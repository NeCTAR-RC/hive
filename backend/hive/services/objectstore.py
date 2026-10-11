"""Object Store: containers, pseudo folders and objects, with uploads and
downloads going straight between the browser and Swift when TempURLs are
available (Horizon ``project/containers`` and ``api/swift.py``)."""

import asyncio
import secrets
import time
from urllib.parse import urlsplit

from hive.clients.swift import SwiftClient
from hive.errors import BadRequest, Conflict, NotFound, PayloadTooLarge
from hive.nectar import objectstore as rules
from hive.services.context import Context

PAGE = 500
FAN_OUT = 8
INFO_TTL = 3600
INFO_STALE = 21600


def _swift(ctx: Context) -> SwiftClient:
    return SwiftClient(ctx.http, ctx.settings, ctx.scoped)


def dashboard_origin(ctx: Context) -> str:
    parts = urlsplit(ctx.settings.public_url)
    return f"{parts.scheme}://{parts.netloc}"


async def info(ctx: Context) -> dict:
    """Store capabilities and the account's usage."""
    swift = _swift(ctx)

    async def fetch():
        return await swift.info()

    result = await ctx.cache.get_or_fetch(
        ctx.cache.global_key("swift-info"),
        fetch,
        ttl=INFO_TTL,
        stale_ttl=INFO_STALE,
        name="swift-info",
    )
    capabilities = result.value or {}
    account = await swift.account()
    core = capabilities.get("swift") or {}
    policies = [
        {"name": p.get("name"), "default": bool(p.get("default"))}
        for p in (core.get("policies") or [])
    ]
    tempurl = "tempurl" in capabilities
    mode = ctx.settings.swift_upload_mode if tempurl else "proxy"
    return {
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
            "container_count": int(account.get("x-account-container-count") or 0),
            "object_count": int(account.get("x-account-object-count") or 0),
            "bytes": int(account.get("x-account-bytes-used") or 0),
            "quota_containers": account.get("x-account-meta-quota-containers"),
            "quota_bytes": account.get("x-account-meta-quota-bytes"),
        },
        "public_url": swift.endpoint,
    }


# --- containers ----------------------------------------------------------------


async def list_containers(ctx: Context) -> dict:
    swift = _swift(ctx)
    items = [
        rules.container_summary(c, swift.endpoint) for c in await swift.containers()
    ]
    items.sort(key=lambda c: c["name"].lower())
    return {"items": items}


async def get_container(ctx: Context, name: str) -> dict:
    swift = _swift(ctx)
    headers = await swift.container(name)
    return {
        "name": name,
        "public_url": f"{swift.endpoint}/{rules.quote(name, safe='')}",
        **rules.container_metadata(headers),
    }


async def create_container(
    ctx: Context, name: str, is_public: bool, storage_policy: str | None
) -> dict:
    problem = rules.validate_container_name(name)
    if problem:
        raise BadRequest(problem)
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
) -> dict:
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


async def delete_container(ctx: Context, name: str) -> None:
    swift = _swift(ctx)
    if await swift.objects(name, limit=1):
        raise Conflict("The container must be empty before it can be deleted.")
    await swift.delete_container(name)


# --- objects -------------------------------------------------------------------


def _prefix(path: str | None) -> str:
    clean = (path or "").strip("/")
    return f"{clean}/" if clean else ""


async def list_objects(
    ctx: Context, container: str, path: str | None, marker: str | None
) -> dict:
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
    return {
        "container": container,
        "prefix": prefix,
        "items": items,
        "has_more": has_more,
        "next_marker": (last.get("name") or last.get("subdir")) if has_more and last else None,
    }


async def create_folder(ctx: Context, container: str, path: str) -> dict:
    name = rules.folder_name("", path)
    problem = rules.validate_object_name(name)
    if problem:
        raise BadRequest(problem)
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
    return {"name": name, "is_folder": True}


async def object_details(ctx: Context, container: str, name: str) -> dict:
    headers = await _swift(ctx).object_head(container, name)
    return {
        "name": name,
        "container": container,
        "orig_filename": headers.get("x-object-meta-orig-filename"),
        **rules.object_metadata(headers),
    }


async def copy_object(
    ctx: Context, container: str, name: str, dest_container: str, dest_name: str
) -> dict:
    problem = rules.validate_object_name(dest_name)
    if problem:
        raise BadRequest(problem)
    swift = _swift(ctx)
    try:
        await swift.object_head(dest_container, dest_name)
    except NotFound:
        pass
    else:
        raise Conflict(f'"{dest_name}" already exists in {dest_container}.')
    await swift.copy_object(container, name, dest_container, dest_name)
    return {"container": dest_container, "name": dest_name}


async def delete_objects(ctx: Context, container: str, names: list[str]) -> dict:
    """Delete objects and folders (recursively); large objects drop their
    segments; everything else goes through one bulk delete."""
    swift = _swift(ctx)
    targets: list[str] = []
    for name in names:
        if name.endswith("/"):
            under = await swift.all_objects(container, prefix=name)
            targets.extend(o["name"] for o in under if o.get("name"))
            targets.append(name)
        else:
            targets.append(name)
    unique = list(dict.fromkeys(targets))
    semaphore = asyncio.Semaphore(FAN_OUT)
    failed: list[str] = []
    plain: list[str] = []

    async def classify(name: str) -> None:
        async with semaphore:
            try:
                head = await swift.object_head(container, name)
            except NotFound:
                return
            if head.get("x-static-large-object", "").lower() == "true":
                try:
                    await swift.delete_object(container, name, slo=True)
                except NotFound:
                    pass
                except Exception:  # noqa: BLE001 - reported per object
                    failed.append(name)
            else:
                plain.append(name)

    await asyncio.gather(*(classify(n) for n in unique))
    deleted = len(unique) - len(plain) - len(failed)
    paths = [rules.quote(f"/{container}/{n}", safe="/") for n in plain]
    for start in range(0, len(paths), 1000):
        result = await swift.bulk_delete(paths[start : start + 1000])
        deleted += int(result.get("Number Deleted") or 0)
        deleted += int(result.get("Number Not Found") or 0)
        for path, _reason in result.get("Errors") or []:
            failed.append(path)
    return {"deleted": deleted, "failed": failed}


# --- uploads and downloads --------------------------------------------------


async def _temp_url_key(ctx: Context, swift: SwiftClient) -> str:
    account = await swift.account()
    key = account.get(rules.TEMP_URL_KEY_HEADER)
    if key:
        return key
    key = secrets.token_hex(32)
    await swift.update_account({"X-Account-Meta-Temp-URL-Key": key})
    return key


async def _ensure_cors(ctx: Context, swift: SwiftClient, container: str) -> None:
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


async def upload_plan(ctx: Context, container: str, objects: list) -> dict:
    """How the browser should upload each object: signed PUT URLs (and a
    manifest for large objects), or the instruction to stream through
    the backend."""
    store = await info(ctx)
    if store["upload_mode"] != "tempurl":
        return {
            "mode": "proxy",
            "max_bytes": ctx.settings.swift_proxy_max_bytes,
            "objects": [],
        }
    swift = _swift(ctx)
    for item in objects:
        problem = rules.validate_object_name(item.name)
        if problem:
            raise BadRequest(f"{item.name}: {problem}")
    key = await _temp_url_key(ctx, swift)
    await _ensure_cors(ctx, swift, container)
    segment_bytes = ctx.settings.swift_segment_bytes
    max_single = store["max_file_size"] or segment_bytes
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
                    for (offset, length), seg in zip(pieces, names, strict=True)
                ],
            }
        )
    return {"mode": "tempurl", "expires_in": ttl, "objects": plans}


async def complete_upload(
    ctx: Context, container: str, name: str, segments: list
) -> dict:
    """Write the static large object manifest once the browser has put
    every segment. The gateway ignores ``multipart-manifest=put`` on a
    TempURL request, so this goes through the backend with the token."""
    problem = rules.validate_object_name(name)
    if problem:
        raise BadRequest(problem)
    manifest = []
    for segment in segments:
        entry = {"path": segment.path, "size_bytes": segment.size_bytes}
        if segment.etag:
            entry["etag"] = segment.etag
        manifest.append(entry)
    swift = _swift(ctx)
    await swift.put_manifest(container, name, manifest)
    head = await swift.object_head(container, name)
    return {
        "name": name,
        "bytes": int(head.get("content-length") or 0),
        "is_slo": True,
    }


async def download_url(ctx: Context, container: str, name: str) -> str | None:
    """A signed GET for the object, or ``None`` when the store has no
    TempURL support (the caller then streams it)."""
    store = await info(ctx)
    if store["upload_mode"] != "tempurl":
        return None
    swift = _swift(ctx)
    key = await _temp_url_key(ctx, swift)
    filename = name.rsplit("/", 1)[-1] or name
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


async def proxy_upload(
    ctx: Context,
    container: str,
    name: str,
    content,
    size: int | None,
    content_type: str | None,
    orig_filename: str | None,
) -> dict:
    problem = rules.validate_object_name(name)
    if problem:
        raise BadRequest(problem)
    if size is not None and size > ctx.settings.swift_proxy_max_bytes:
        raise PayloadTooLarge(
            "The file is larger than this dashboard can relay; use the"
            " OpenStack command line tools instead."
        )
    swift = _swift(ctx)
    headers = await swift.put_object(
        container,
        name,
        content,
        content_type=content_type,
        content_length=size,
        timeout=ctx.settings.image_upload_timeout,
    )
    if orig_filename:
        await swift.update_object(
            container, name, {"X-Object-Meta-Orig-Filename": orig_filename}
        )
    return {"name": name, "etag": headers.get("etag")}
