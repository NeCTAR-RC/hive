"""Object store rules: Horizon's container panel conventions and the
Swift mechanics Hive uses for direct browser uploads.

- Pseudo folders are zero-byte objects whose name ends in ``/`` with the
  ``application/directory`` content type; listings use ``delimiter=/``
  and show ``subdir`` entries as folders
  (``openstack_dashboard/api/swift.py`` ``swift_create_pseudo_folder``,
  ``swift_get_objects``).
- A public container carries the ACL ``.r:*,.rlistings`` in
  ``X-Container-Read``; private clears it (``swift_update_container``).
- Container names cannot contain ``/`` and are at most 256 bytes; object
  names are at most 1024 bytes (Swift limits reported by ``/info``).
- Uploads: the browser PUTs straight to Swift with a TempURL the backend
  signs (``temp_url_sig``/``temp_url_expires``, HMAC of
  ``METHOD\\nexpires\\npath``). Files above the segment size become a
  static large object: numbered segments under ``<container>_segments``
  and a manifest PUT with ``multipart-manifest=put``.
- Container CORS metadata (``X-Container-Meta-Access-Control-Allow-
  Origin``) must name the dashboard origin for the browser's PUT to be
  allowed.
"""

from dataclasses import dataclass
import hashlib
import hmac
import time
from urllib.parse import quote, urlsplit

PUBLIC_ACL = ".r:*,.rlistings"
FOLDER_CONTENT_TYPE = "application/directory"
SEGMENTS_SUFFIX = "_segments"
DEFAULT_SEGMENT_BYTES = 1024**3
MAX_CONTAINER_NAME = 256
MAX_OBJECT_NAME = 1024
TEMP_URL_KEY_HEADER = "x-account-meta-temp-url-key"
DIGESTS = {"sha1": hashlib.sha1, "sha256": hashlib.sha256, "sha512": hashlib.sha512}


def validate_container_name(name: str) -> str | None:
    if not name:
        return "Enter a container name."
    if "/" in name:
        return "Container names cannot contain a slash."
    if len(name.encode()) > MAX_CONTAINER_NAME:
        return "Container names are at most 256 characters."
    return None


def validate_object_name(name: str) -> str | None:
    if not name or name == "/":
        return "Enter a name."
    if name.startswith("/"):
        return "Names cannot start with a slash."
    if "//" in name:
        return "Names cannot contain an empty folder."
    if len(name.encode()) > MAX_OBJECT_NAME:
        return "Names are at most 1024 characters."
    return None


def folder_name(prefix: str, name: str) -> str:
    """The object name for a pseudo folder: ``prefix/name/``."""
    clean = name.strip("/")
    return f"{prefix}{clean}/" if clean else prefix


def is_folder(entry: dict) -> bool:
    """A ``subdir`` from a delimiter listing, or the zero-byte ``name/``
    marker Horizon writes for a pseudo folder."""
    if "subdir" in entry:
        return True
    name = entry.get("name") or ""
    return name.endswith("/") and not entry.get("bytes")


def is_public(read_acl: str | None) -> bool:
    return bool(read_acl) and ".r:*" in read_acl


def container_summary(container: dict, account_url: str) -> dict:
    name = container.get("name") or ""
    return {
        "name": name,
        "object_count": container.get("count") or 0,
        "bytes": container.get("bytes") or 0,
        "public_url": f"{account_url}/{quote(name, safe='')}",
    }


def container_metadata(headers: dict[str, str]) -> dict:
    """Shape a container HEAD into what the panel shows."""
    meta = {
        k[len("x-container-meta-") :]: v
        for k, v in headers.items()
        if k.startswith("x-container-meta-")
    }
    read_acl = headers.get("x-container-read")
    return {
        "object_count": int(headers.get("x-container-object-count") or 0),
        "bytes": int(headers.get("x-container-bytes-used") or 0),
        "is_public": is_public(read_acl),
        "read_acl": read_acl,
        "storage_policy": headers.get("x-storage-policy"),
        "cors_origin": meta.pop("access-control-allow-origin", None),
        "metadata": meta,
        "timestamp": headers.get("x-timestamp"),
    }


def object_summary(entry: dict, prefix: str) -> dict:
    if "subdir" in entry:
        name = entry["subdir"]
        return {
            "name": name,
            "basename": name[len(prefix) :].rstrip("/"),
            "is_folder": True,
            "bytes": 0,
            "content_type": FOLDER_CONTENT_TYPE,
            "hash": None,
            "last_modified": None,
        }
    name = entry.get("name") or ""
    folder = is_folder(entry)
    return {
        "name": name,
        "basename": name[len(prefix) :].rstrip("/") if folder else name[len(prefix) :],
        "is_folder": folder,
        "bytes": entry.get("bytes") or 0,
        "content_type": entry.get("content_type"),
        "hash": entry.get("hash"),
        "last_modified": entry.get("last_modified"),
    }


def object_metadata(headers: dict[str, str]) -> dict:
    meta = {
        k[len("x-object-meta-") :]: v
        for k, v in headers.items()
        if k.startswith("x-object-meta-")
    }
    return {
        "bytes": int(headers.get("content-length") or 0),
        "content_type": headers.get("content-type"),
        "hash": headers.get("etag"),
        "last_modified": headers.get("last-modified"),
        "timestamp": headers.get("x-timestamp"),
        "is_slo": headers.get("x-static-large-object", "").lower() == "true",
        "manifest": headers.get("x-object-manifest"),
        "metadata": meta,
    }


# --- TempURL --------------------------------------------------------------


def temp_url_signature(
    key: str, method: str, expires: int, path: str, digest: str = "sha256"
) -> str:
    body = f"{method.upper()}\n{expires}\n{path}".encode()
    hasher = DIGESTS[digest]
    sig = hmac.new(key.encode(), body, hasher).hexdigest()
    return sig if digest == "sha1" else f"{digest}:{sig}"


def temp_url(
    account_url: str,
    container: str,
    name: str,
    *,
    key: str,
    method: str,
    ttl: int,
    digest: str = "sha256",
    now: float | None = None,
    query: dict[str, str] | None = None,
) -> str:
    """A signed URL for one object. The signature covers the request path
    (``/v1/AUTH_x/container/object`` on Swift, ``/swift/v1/container/
    object`` on a Ceph gateway that keeps the account out of the URL), so
    extra query parameters such as ``multipart-manifest=put`` are allowed."""
    expires = int((now if now is not None else time.time()) + ttl)
    parts = urlsplit(account_url)
    path = (
        parts.path.rstrip("/")
        + f"/{quote(container, safe='')}/{quote(name, safe='/')}"
    )
    sig = temp_url_signature(key, method, expires, path, digest)
    params = {"temp_url_sig": sig, "temp_url_expires": str(expires)}
    if query:
        params.update(query)
    encoded = "&".join(f"{k}={quote(v, safe=':')}" for k, v in params.items())
    return f"{parts.scheme}://{parts.netloc}{path}?{encoded}"


@dataclass
class UploadPlan:
    name: str
    size: int
    content_type: str | None
    url: str | None = None
    segments: list[dict] | None = None
    manifest_url: str | None = None
    segment_container: str | None = None
    segment_prefix: str | None = None


def segment_plan(
    size: int, segment_bytes: int = DEFAULT_SEGMENT_BYTES
) -> list[tuple[int, int]]:
    """``(offset, length)`` per segment; one segment when it fits."""
    if size <= segment_bytes:
        return [(0, size)]
    segments = []
    offset = 0
    while offset < size:
        length = min(segment_bytes, size - offset)
        segments.append((offset, length))
        offset += length
    return segments


def segment_names(name: str, stamp: str, count: int) -> list[str]:
    return [f"{name}/{stamp}/{index:08d}" for index in range(count)]


def manifest_entries(
    segment_container: str, names: list[str], lengths: list[int]
) -> list[dict]:
    return [
        {"path": f"/{segment_container}/{seg}", "size_bytes": length}
        for seg, length in zip(names, lengths, strict=True)
    ]
