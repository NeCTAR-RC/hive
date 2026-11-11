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
- Swift facts that shape the above (Nectar's Melbourne object store is
  Swift 2.37, the 2026.1 release, on rctest and prod; checked 12 Oct 2026
  on rctest and against the 2.37.2 source): a signature given as
  ``<algorithm>:<digest>`` must be base64, a bare hex digest is read by
  its length (``swift/common/digest.py`` ``extract_digest_and_algorithm``);
  the tempurl middleware rebuilds ``QUERY_STRING`` with only its own
  parameters before passing the request on
  (``swift/common/middleware/tempurl.py``), so ``multipart-manifest=put``
  on a TempURL PUT never reaches the SLO middleware and the body is stored
  as a plain object. The manifest therefore goes through the backend with
  the user's token.
- Container CORS metadata (``X-Container-Meta-Access-Control-Allow-
  Origin``) must name the dashboard origin for the browser's PUT to be
  allowed.
- The TempURL signature covers the decoded path: Swift's tempurl
  middleware (``swift/common/middleware/tempurl.py``) rebuilds
  ``/v1/<account>/<container>/<object>`` from the unquoted ``PATH_INFO``
  before computing the HMAC, as swiftclient's ``generate_temp_url`` does.
  Only the URL the browser follows is percent-encoded. Swift accepts a
  signature made with either account key (``Temp-URL-Key`` or
  ``Temp-URL-Key-2``).
- Uploads record the browser's file name in ``X-Object-Meta-Orig-Filename``
  (``openstack_dashboard/api/swift.py`` ``swift_upload_object``) and a
  download whose object name has no extension takes the original one back
  (``openstack_dashboard/api/rest/swift.py`` ``Object.get``). Hive
  percent-encodes the header value so any file name survives the
  latin-1/ASCII header encoding; Horizon's raw ASCII values decode
  unchanged.
"""

import base64
from dataclasses import dataclass
import hashlib
import hmac
import posixpath
import time
from urllib.parse import quote, unquote, urlsplit

from hive.nectar.violation import RuleViolation
from hive.times import to_utc_iso

PUBLIC_ACL = ".r:*,.rlistings"
FOLDER_CONTENT_TYPE = "application/directory"
SEGMENTS_SUFFIX = "_segments"
DEFAULT_SEGMENT_BYTES = 1024**3
MAX_CONTAINER_NAME = 256
MAX_OBJECT_NAME = 1024
TEMP_URL_KEY_HEADER = "x-account-meta-temp-url-key"
TEMP_URL_KEY_2_HEADER = "x-account-meta-temp-url-key-2"
ORIG_FILENAME_HEADER = "X-Object-Meta-Orig-Filename"
DIGESTS = {
    "sha1": hashlib.sha1,
    "sha256": hashlib.sha256,
    "sha512": hashlib.sha512,
}


def is_slo_entry(entry: dict) -> bool:
    """Whether a container listing entry is a static large object
    manifest: Swift adds ``slo_etag`` to exactly those entries (checked
    against Swift 2.37, which Nectar runs in Melbourne)."""
    return "slo_etag" in entry


def validate_container_name(name: str) -> None:
    """No slash, at most 256 bytes (Swift ``/info``)."""
    if not name:
        raise RuleViolation("Enter a container name.")
    if "/" in name:
        raise RuleViolation("Container names cannot contain a slash.")
    if len(name.encode()) > MAX_CONTAINER_NAME:
        raise RuleViolation("Container names are at most 256 characters.")


def validate_object_name(name: str) -> None:
    """At most 1024 bytes, no empty folder (Swift)."""
    if not name or name == "/":
        raise RuleViolation("Enter a name.")
    if name.startswith("/"):
        raise RuleViolation("Names cannot start with a slash.")
    if "//" in name:
        raise RuleViolation("Names cannot contain an empty folder.")
    if len(name.encode()) > MAX_OBJECT_NAME:
        raise RuleViolation("Names are at most 1024 characters.")


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
    """The ``.r:*`` read ACL (``api/swift.py``)."""
    return bool(read_acl) and ".r:*" in read_acl


def container_summary(container: dict, account_url: str) -> dict:
    """A container row (``project/containers``)."""
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
    """An object or folder row (``swift_get_objects``)."""
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
        "basename": name[len(prefix) :].rstrip("/")
        if folder
        else name[len(prefix) :],
        "is_folder": folder,
        "bytes": entry.get("bytes") or 0,
        "content_type": entry.get("content_type"),
        "hash": entry.get("hash"),
        "last_modified": to_utc_iso(entry.get("last_modified")),
    }


def object_metadata(headers: dict[str, str]) -> dict:
    """An object's details from its headers (``api/swift.py``)."""
    meta = {
        k[len("x-object-meta-") :]: v
        for k, v in headers.items()
        if k.startswith("x-object-meta-")
    }
    return {
        "bytes": int(headers.get("content-length") or 0),
        "content_type": headers.get("content-type"),
        "hash": headers.get("etag"),
        "last_modified": to_utc_iso(headers.get("last-modified")),
        "timestamp": headers.get("x-timestamp"),
        "is_slo": headers.get("x-static-large-object", "").lower() == "true",
        "manifest": headers.get("x-object-manifest"),
        "metadata": meta,
    }


def temp_url_signature(
    key: str, method: str, expires: int, path: str, digest: str = "sha256"
) -> str:
    """``temp_url_sig`` in the form Swift parses: a bare hex digest for
    sha1, ``<algorithm>:<base64 digest>`` for sha256 and sha512 (a prefixed
    hex digest is rejected with 401)."""
    body = f"{method.upper()}\n{expires}\n{path}".encode()
    mac = hmac.new(key.encode(), body, DIGESTS[digest])
    if digest == "sha1":
        return mac.hexdigest()
    return f"{digest}:{base64.urlsafe_b64encode(mac.digest()).decode('ascii')}"


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
    """A signed URL for one object. The signature covers the decoded
    request path (``/v1/AUTH_x/container/object``, see the module
    docstring) and not the query string, so extra parameters can be added;
    Swift keeps only ``filename``, ``temp_url_prefix`` and its own
    parameters, which is enough for the download file name."""
    expires = int((now if now is not None else time.time()) + ttl)
    parts = urlsplit(account_url)
    account_path = unquote(parts.path.rstrip("/"))
    signed = f"{account_path}/{container}/{name}"
    sig = temp_url_signature(key, method, expires, signed, digest)
    path = (
        quote(account_path, safe="/")
        + f"/{quote(container, safe='')}/{quote(name, safe='/')}"
    )
    params = {"temp_url_sig": sig, "temp_url_expires": str(expires)}
    if query:
        params.update(query)
    encoded = "&".join(f"{k}={quote(v, safe=':')}" for k, v in params.items())
    return f"{parts.scheme}://{parts.netloc}{path}?{encoded}"


def temp_url_key(account: dict[str, str]) -> str | None:
    """The account's TempURL key from its HEAD: ``Temp-URL-Key``, else
    ``Temp-URL-Key-2``."""
    return account.get(TEMP_URL_KEY_HEADER) or account.get(
        TEMP_URL_KEY_2_HEADER
    )


def encode_orig_filename(filename: str) -> str:
    """The ``X-Object-Meta-Orig-Filename`` value: percent-encoded so a
    non-ASCII or CR/LF name cannot break the header."""
    return quote(filename, safe=" ")


def decode_orig_filename(value: str | None) -> str | None:
    """The original file name from its header (see the module
    docstring)."""
    return unquote(value) if value else None


def has_extension(filename: str) -> bool:
    """Whether ``filename`` ends in an extension, as ``os.path.splitext``
    reads it in ``Object.get``."""
    return bool(posixpath.splitext(filename)[1])


def download_filename(name: str, orig_filename: str | None) -> str:
    """The object's last path segment, with the original file's extension
    added back when the object name has none (Horizon
    ``api/rest/swift.py`` ``Object.get``)."""
    filename = name.rstrip("/").rsplit("/", 1)[-1] or name
    if orig_filename and not has_extension(filename):
        filename += posixpath.splitext(orig_filename)[1]
    return filename


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
    """SLO segment names under ``<container>_segments`` (Hive uploads)."""
    return [f"{name}/{stamp}/{index:08d}" for index in range(count)]


def manifest_entries(
    segment_container: str, names: list[str], lengths: list[int]
) -> list[dict]:
    """The SLO manifest for ``multipart-manifest=put`` (Hive uploads)."""
    return [
        {"path": f"/{segment_container}/{seg}", "size_bytes": length}
        for seg, length in zip(names, lengths, strict=True)
    ]
