"""Object Store: containers, pseudo folders and objects, with uploads and
downloads going straight between the browser and Swift when TempURLs are
available (Horizon ``project/containers`` and ``api/swift.py``)."""

from collections.abc import AsyncIterable
import secrets
import time
from urllib.parse import quote, urlsplit

from hive.cache import policy
from hive.clients.swift import BULK_DELETE_LIMIT, SwiftClient
from hive.errors import (
    Conflict,
    HiveError,
    LengthRequired,
    ListingTruncated,
    NotFound,
    PayloadTooLarge,
)
from hive.nectar import objectstore as rules
from hive.schemas.responses.objectstore import (
    ContainerDetail,
    ContainerList,
    DeleteObjectsResult,
    FolderCreated,
    ObjectCopied,
    ObjectDetail,
    ObjectListing,
    ObjectUploaded,
    ProxyUploadPlan,
    StoreInfo,
    TempUrlUploadPlan,
    UploadCompleted,
    UploadPlan,
)
from hive.services.concurrency import bounded_gather
from hive.services.context import Context
from hive.services.download import Download

PAGE = 500


def _swift(ctx: Context) -> SwiftClient:
    return SwiftClient(ctx.http, ctx.settings, ctx.scoped)


def dashboard_origin(ctx: Context) -> str:
    parts = urlsplit(ctx.settings.public_url)
    return f"{parts.scheme}://{parts.netloc}"


async def _capabilities(ctx: Context, swift: SwiftClient) -> dict:
    """The cluster's ``/info`` (cached; it is the same for everyone)."""
    result = await ctx.cached(policy.SWIFT_INFO, swift.info)
    return result.value or {}


async def _store_and_account(
    ctx: Context, swift: SwiftClient
) -> tuple[StoreInfo, dict[str, str]]:
    """The store summary and the raw account headers from one ``HEAD``, so
    the TempURL key comes from the same request."""
    capabilities = await _capabilities(ctx, swift)
    account = await swift.account()
    return _store(ctx, swift, capabilities, account), account


async def info(ctx: Context) -> StoreInfo:
    """Store capabilities and the account's usage."""
    store, _account = await _store_and_account(ctx, _swift(ctx))
    return store


def _store(
    ctx: Context, swift: SwiftClient, capabilities: dict, account: dict
) -> StoreInfo:
    """The store summary from the cluster's capabilities and the account's
    ``HEAD``."""
    core = capabilities.get("swift") or {}
    policies = [
        {"name": p.get("name"), "default": bool(p.get("default"))}
        for p in (core.get("policies") or [])
    ]
    tempurl = "tempurl" in capabilities
    mode = ctx.settings.swift_upload_mode if tempurl else "proxy"
    return StoreInfo.model_validate(
        {
            "upload_mode": mode,
            "max_file_size": core.get("max_file_size"),
            "segment_bytes": ctx.settings.swift_segment_bytes,
            "proxy_max_bytes": ctx.settings.swift_proxy_max_bytes,
            "slo": "slo" in capabilities,
            "bulk_delete": (capabilities.get("bulk_delete") or {}).get(
                "max_deletes_per_request"
            ),
            "policies": policies,
            "account": {
                "container_count": int(
                    account.get("x-account-container-count") or 0
                ),
                "object_count": int(
                    account.get("x-account-object-count") or 0
                ),
                "bytes": int(account.get("x-account-bytes-used") or 0),
                "quota_containers": account.get(
                    "x-account-meta-quota-containers"
                ),
                "quota_bytes": account.get("x-account-meta-quota-bytes"),
            },
            "public_url": swift.endpoint,
        }
    )


async def list_containers(ctx: Context) -> ContainerList:
    """The account's containers by name; ``truncated`` when the listing
    stopped at the page cap with more to come."""
    swift = _swift(ctx)
    listing = await swift.containers()
    items = [rules.container_summary(c, swift.endpoint) for c in listing.items]
    items.sort(key=lambda c: c["name"].lower())
    return ContainerList.model_validate(
        {"items": items, "truncated": listing.truncated}
    )


async def get_container(ctx: Context, name: str) -> ContainerDetail:
    swift = _swift(ctx)
    headers = await swift.container(name)
    return ContainerDetail.model_validate(
        {
            "name": name,
            "public_url": f"{swift.endpoint}/{quote(name, safe='')}",
            **rules.container_metadata(headers),
        }
    )


async def create_container(
    ctx: Context, name: str, is_public: bool, storage_policy: str | None
) -> ContainerDetail:
    swift = _swift(ctx)
    try:
        await swift.container(name)
    except NotFound:
        pass
    else:
        raise Conflict(f'A container named "{name}" already exists.')
    metadata = {}
    if is_public:
        metadata["X-Container-Read"] = rules.PUBLIC_ACL
    if storage_policy:
        metadata["X-Storage-Policy"] = storage_policy
    await swift.create_container(name, metadata or None)
    return await get_container(ctx, name)


async def update_container(
    ctx: Context, name: str, is_public: bool | None, metadata: dict | None
) -> ContainerDetail:
    headers: dict[str, str] = {}
    if is_public is not None:
        headers["X-Container-Read"] = rules.PUBLIC_ACL if is_public else ""
    for key, value in (metadata or {}).items():
        header = f"X-Container-Meta-{key}"
        if value:
            headers[header] = value
        else:
            headers[f"X-Remove-Container-Meta-{key}"] = "1"
    if headers:
        await _swift(ctx).update_container(name, headers)
    return await get_container(ctx, name)


async def delete_container(
    ctx: Context, name: str, with_objects: bool = False
) -> None:
    """Delete a container. Swift deletes only an empty one, so with
    ``with_objects`` every object goes first, through the same deletes as
    ``delete_objects`` (classified from one listing, so no per-object
    ``HEAD``); the container stays when any object could not be deleted,
    and nothing is deleted when the listing stops at the page cap."""
    swift = _swift(ctx)
    if with_objects:
        listing = await swift.all_objects(name)
        if listing.truncated:
            raise _too_many(f'The container "{name}"')
        listed = {
            entry["name"]: rules.is_slo_entry(entry)
            for entry in listing.items
            if entry.get("name")
        }
        result = await _delete_named(ctx, swift, name, list(listed), listed)
        if result.failed:
            count = len(result.failed)
            noun = "object" if count == 1 else "objects"
            raise Conflict(
                f"{count} {noun} could not be deleted, so the container was "
                "kept."
            )
    elif await swift.objects(name, limit=1):
        raise Conflict("The container must be empty before it can be deleted.")
    await swift.delete_container(name)


def _prefix(path: str | None) -> str:
    clean = (path or "").strip("/")
    return f"{clean}/" if clean else ""


async def list_objects(
    ctx: Context, container: str, path: str | None, marker: str | None
) -> ObjectListing:
    prefix = _prefix(path)
    swift = _swift(ctx)
    page = await swift.objects(
        container,
        prefix=prefix or None,
        delimiter="/",
        marker=marker,
        limit=PAGE + 1,
    )
    has_more = len(page) > PAGE
    page = page[:PAGE]
    items = [
        rules.object_summary(entry, prefix)
        for entry in page
        if (entry.get("name") or entry.get("subdir")) != prefix
    ]
    items.sort(key=lambda o: (not o["is_folder"], o["basename"].lower()))
    last = page[-1] if page else None
    return ObjectListing.model_validate(
        {
            "container": container,
            "prefix": prefix,
            "items": items,
            "has_more": has_more,
            "next_marker": (last.get("name") or last.get("subdir"))
            if has_more and last
            else None,
        }
    )


async def create_folder(
    ctx: Context, container: str, path: str
) -> FolderCreated:
    name = rules.folder_name("", path)
    rules.validate_object_name(name)
    swift = _swift(ctx)
    try:
        await swift.object_head(container, name)
    except NotFound:
        pass
    else:
        raise Conflict(f'A folder named "{name}" already exists.')
    await swift.put_object(
        container,
        name,
        b"",
        content_type=rules.FOLDER_CONTENT_TYPE,
        content_length=0,
    )
    return FolderCreated.model_validate({"name": name, "is_folder": True})


async def object_details(
    ctx: Context, container: str, name: str
) -> ObjectDetail:
    headers = await _swift(ctx).object_head(container, name)
    return ObjectDetail.model_validate(
        {
            "name": name,
            "container": container,
            "orig_filename": rules.decode_orig_filename(
                headers.get("x-object-meta-orig-filename")
            ),
            **rules.object_metadata(headers),
        }
    )


async def copy_object(
    ctx: Context,
    container: str,
    name: str,
    dest_container: str,
    dest_name: str,
) -> ObjectCopied:
    swift = _swift(ctx)
    try:
        await swift.object_head(dest_container, dest_name)
    except NotFound:
        pass
    else:
        raise Conflict(f'"{dest_name}" already exists in {dest_container}.')
    await swift.copy_object(container, name, dest_container, dest_name)
    return ObjectCopied.model_validate(
        {"container": dest_container, "name": dest_name}
    )


def _too_many(what: str) -> ListingTruncated:
    return ListingTruncated(
        f"{what} holds too many objects to delete here; use the OpenStack"
        " command line tools instead."
    )


async def _expand(
    swift: SwiftClient, container: str, names: list[str]
) -> tuple[list[str], dict[str, bool]]:
    """Every object to delete, in order (a folder's contents before its
    marker), and whether each listed one is a large object. A folder whose
    listing stops at the page cap is refused before anything is deleted,
    so a partial delete is never reported as success."""
    targets: list[str] = []
    listed: dict[str, bool] = {}
    for name in names:
        if name.endswith("/"):
            listing = await swift.all_objects(container, prefix=name)
            if listing.truncated:
                raise _too_many(f'"{name}"')
            for entry in listing.items:
                if entry.get("name"):
                    listed[entry["name"]] = rules.is_slo_entry(entry)
                    targets.append(entry["name"])
        targets.append(name)
    return list(dict.fromkeys(targets)), listed


async def delete_objects(
    ctx: Context, container: str, names: list[str]
) -> DeleteObjectsResult:
    """Delete objects and folders (recursively); large objects drop their
    segments; everything else goes through one bulk delete.

    Objects found by listing a folder are classified from the listing
    (Swift lists ``slo_etag`` for every SLO manifest), so a folder of
    thousands of objects costs no per-object ``HEAD``; only objects named
    directly are looked at one by one.
    """
    swift = _swift(ctx)
    unique, listed = await _expand(swift, container, names)
    return await _delete_named(ctx, swift, container, unique, listed)


async def _delete_named(
    ctx: Context,
    swift: SwiftClient,
    container: str,
    unique: list[str],
    listed: dict[str, bool],
) -> DeleteObjectsResult:
    """Delete the named objects: large objects one by one with their
    segments, the rest in bulk deletes of at most the cluster's
    ``max_deletes_per_request`` paths each. ``listed`` says, for the names
    a listing found, whether each is a large object; any other name is
    looked at with a ``HEAD``. Failures are reported by object name."""
    failed: list[str] = []
    plain: list[str] = []

    async def is_slo(name: str) -> bool | None:
        """``None`` when the object is already gone."""
        if name in listed:
            return listed[name]
        try:
            head = await swift.object_head(container, name)
        except NotFound:
            return None
        return head.get("x-static-large-object", "").lower() == "true"

    async def classify(name: str) -> None:
        large = await is_slo(name)
        if large is None:
            return
        if not large:
            plain.append(name)
            return
        try:
            await swift.delete_object(container, name, slo=True)
        except NotFound:
            pass
        except HiveError:
            failed.append(name)

    await bounded_gather(unique, classify, ctx.settings.upstream_fan_out)
    deleted = len(unique) - len(plain) - len(failed)
    chunk = await _bulk_delete_limit(ctx, swift)
    by_path = {quote(f"/{container}/{n}", safe="/"): n for n in plain}
    paths = list(by_path)
    for start in range(0, len(paths), chunk):
        batch = paths[start : start + chunk]
        result = await swift.bulk_delete(batch)
        errors: list[tuple[str, str]] = result.get("Errors") or []
        failed.extend(by_path.get(error, error) for error, _reason in errors)
        if not errors and not _bulk_ok(result):
            # The whole request failed and Swift names no object: nothing
            # in this batch counts as deleted.
            failed.extend(by_path[sent] for sent in batch)
            continue
        deleted += int(result.get("Number Deleted") or 0)
        deleted += int(result.get("Number Not Found") or 0)
    return DeleteObjectsResult.model_validate(
        {"deleted": deleted, "failed": failed}
    )


async def _bulk_delete_limit(ctx: Context, swift: SwiftClient) -> int:
    """Paths per bulk delete: the cluster's ``max_deletes_per_request``."""
    capabilities = await _capabilities(ctx, swift)
    limit = (capabilities.get("bulk_delete") or {}).get(
        "max_deletes_per_request"
    )
    return limit if isinstance(limit, int) and limit > 0 else BULK_DELETE_LIMIT


def _bulk_ok(result: dict) -> bool:
    """Whether a bulk delete reply's ``Response Status`` is a 2xx."""
    return str(result.get("Response Status") or "200").startswith("2")


async def _temp_url_key(swift: SwiftClient, account: dict[str, str]) -> str:
    """The account's TempURL key (either slot), set once when the account
    has none."""
    key = rules.temp_url_key(account)
    if key:
        return key
    key = secrets.token_hex(32)
    await swift.update_account({"X-Account-Meta-Temp-URL-Key": key})
    return key


async def _ensure_cors(
    ctx: Context, swift: SwiftClient, container: str
) -> None:
    origin = dashboard_origin(ctx)
    headers = await swift.container(container)
    allowed = headers.get("x-container-meta-access-control-allow-origin") or ""
    origins = allowed.split()
    if origin in origins:
        return
    origins.append(origin)
    await swift.update_container(
        container,
        {
            "X-Container-Meta-Access-Control-Allow-Origin": " ".join(origins),
            "X-Container-Meta-Access-Control-Max-Age": "3600",
            "X-Container-Meta-Access-Control-Expose-Headers": "etag",
        },
    )


async def upload_plan(
    ctx: Context, container: str, objects: list
) -> UploadPlan:
    """How the browser should upload each object: signed PUT URLs (and a
    manifest for large objects), or the instruction to stream through
    the backend."""
    swift = _swift(ctx)
    store, account = await _store_and_account(ctx, swift)
    if store.upload_mode != "tempurl":
        return ProxyUploadPlan.model_validate(
            {
                "mode": "proxy",
                "max_bytes": ctx.settings.swift_proxy_max_bytes,
                "objects": [],
            }
        )
    key = await _temp_url_key(swift, account)
    await _ensure_cors(ctx, swift, container)
    segment_bytes = ctx.settings.swift_segment_bytes
    max_single = store.max_file_size or segment_bytes
    segment_container = f"{container}{rules.SEGMENTS_SUFFIX}"
    needs_segments = any(item.size > segment_bytes for item in objects)
    if needs_segments:
        try:
            await swift.container(segment_container)
        except NotFound:
            await swift.create_container(segment_container)
        await _ensure_cors(ctx, swift, segment_container)
    stamp = str(int(time.time()))
    plans = []
    ttl = ctx.settings.swift_tempurl_ttl
    digest = ctx.settings.swift_tempurl_digest
    for item in objects:
        if item.size <= segment_bytes and item.size <= max_single:
            plans.append(
                {
                    "name": item.name,
                    "size": item.size,
                    "url": rules.temp_url(
                        swift.endpoint,
                        container,
                        item.name,
                        key=key,
                        method="PUT",
                        ttl=ttl,
                        digest=digest,
                    ),
                    "segments": None,
                    "manifest": False,
                }
            )
            continue
        pieces = rules.segment_plan(item.size, segment_bytes)
        names = rules.segment_names(item.name, stamp, len(pieces))
        plans.append(
            {
                "name": item.name,
                "size": item.size,
                "url": None,
                "manifest": True,
                "segments": [
                    {
                        "offset": offset,
                        "length": length,
                        "path": f"/{segment_container}/{seg}",
                        "url": rules.temp_url(
                            swift.endpoint,
                            segment_container,
                            seg,
                            key=key,
                            method="PUT",
                            ttl=ttl,
                            digest=digest,
                        ),
                    }
                    for (offset, length), seg in zip(
                        pieces, names, strict=True
                    )
                ],
            }
        )
    return TempUrlUploadPlan.model_validate(
        {"mode": "tempurl", "expires_in": ttl, "objects": plans}
    )


async def complete_upload(
    ctx: Context, container: str, name: str, segments: list
) -> UploadCompleted:
    """Write the static large object manifest once the browser has put
    every segment. Swift's tempurl middleware drops every query parameter
    but its own, so ``multipart-manifest=put`` on a TempURL PUT would store
    the manifest as a plain object (``hive.nectar.objectstore``); the
    manifest goes through the backend with the token instead."""
    rules.validate_object_name(name)
    manifest = []
    for segment in segments:
        entry = {"path": segment.path, "size_bytes": segment.size_bytes}
        if segment.etag:
            entry["etag"] = segment.etag
        manifest.append(entry)
    swift = _swift(ctx)
    await swift.put_manifest(container, name, manifest)
    head = await swift.object_head(container, name)
    return UploadCompleted.model_validate(
        {
            "name": name,
            "bytes": int(head.get("content-length") or 0),
            "is_slo": True,
        }
    )


async def _download_filename(
    swift: SwiftClient, container: str, name: str
) -> str:
    """The download name; a ``HEAD`` for the original file name only when
    the object name has no extension to keep."""
    filename = rules.download_filename(name, None)
    if rules.has_extension(filename):
        return filename
    try:
        head = await swift.object_head(container, name)
    except NotFound:
        return filename
    return rules.download_filename(
        name,
        rules.decode_orig_filename(head.get("x-object-meta-orig-filename")),
    )


async def download_url(ctx: Context, container: str, name: str) -> str | None:
    """A signed GET for the object, or ``None`` when the store has no
    TempURL support (the caller then streams it)."""
    swift = _swift(ctx)
    store, account = await _store_and_account(ctx, swift)
    if store.upload_mode != "tempurl":
        return None
    key = await _temp_url_key(swift, account)
    filename = await _download_filename(swift, container, name)
    return rules.temp_url(
        swift.endpoint,
        container,
        name,
        key=key,
        method="GET",
        ttl=ctx.settings.swift_tempurl_ttl,
        digest=ctx.settings.swift_tempurl_digest,
        query={"filename": filename},
    )


async def download(ctx: Context, container: str, name: str) -> str | Download:
    """Where the browser gets an object: a signed Swift URL to redirect
    to, or the object itself streamed through Hive when the store has no
    TempURL support."""
    url = await download_url(ctx, container, name)
    if url:
        return url
    upstream = await _swift(ctx).get_object(container, name)
    length = upstream.headers.get("content-length")
    orig = upstream.headers.get("x-object-meta-orig-filename")
    return Download(
        rules.download_filename(name, rules.decode_orig_filename(orig)),
        upstream.headers.get("content-type") or "application/octet-stream",
        upstream.aiter_bytes(),
        int(length) if length and length.isdigit() else None,
        close=upstream.aclose,
    )


async def proxy_upload(
    ctx: Context,
    container: str,
    name: str,
    content: AsyncIterable[bytes],
    content_length: str | None,
    content_type: str | None,
    orig_filename: str | None,
) -> ObjectUploaded:
    """Stream a file through Hive into Swift (the ``proxy`` upload mode),
    for stores the browser cannot reach directly. The size must be known
    up front (a numeric Content-Length) so the relay cap holds; the
    original file name rides on the PUT itself, percent-encoded."""
    rules.validate_object_name(name)
    if not content_length or not content_length.isdigit():
        raise LengthRequired("The upload needs a Content-Length header.")
    size = int(content_length)
    if size > ctx.settings.swift_proxy_max_bytes:
        raise PayloadTooLarge(
            "The file is larger than this dashboard can relay; use the"
            " OpenStack command line tools instead."
        )
    metadata = None
    if orig_filename:
        metadata = {
            rules.ORIG_FILENAME_HEADER: rules.encode_orig_filename(
                orig_filename
            )
        }
    headers = await _swift(ctx).put_object(
        container,
        name,
        content,
        content_type=content_type,
        content_length=size,
        timeout=ctx.settings.image_upload_timeout,
        metadata=metadata,
    )
    return ObjectUploaded.model_validate(
        {"name": name, "etag": headers.get("etag")}
    )
