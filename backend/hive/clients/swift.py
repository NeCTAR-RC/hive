"""Swift (object store) client over the account URL from the catalog.

Listings use ``format=json``; metadata travels in headers as the Swift
API defines it. Large objects are static large objects (SLO): segments in
``<container>_segments`` and a manifest uploaded with
``multipart-manifest=put``. Nothing here applies Nectar policy.
"""

from collections.abc import AsyncIterable
from typing import NamedTuple
from urllib.parse import quote

import httpx

from hive.clients.base import DOT_SEGMENTS, path, ServiceClient
from hive.errors import BadRequest

LISTING_LIMIT = 1000
# Swift's default ``max_deletes_per_request``, for a cluster whose ``/info``
# does not say.
BULK_DELETE_LIMIT = 1000


class Listing(NamedTuple):
    """A whole listing, or as much of it as the page cap allowed:
    ``truncated`` says the walk stopped with more to come."""

    items: list[dict]
    truncated: bool


def object_path(container: str, name: str) -> str:
    """The URL path of one object.

    Object names keep their ``/`` (pseudo-folders), so ``path()`` cannot
    encode them whole; a ``.`` or ``..`` part would be collapsed by URL
    normalisation into another object's path, so it is refused instead.
    """
    if not name or any(part in DOT_SEGMENTS for part in name.split("/")):
        raise BadRequest(f"invalid object name: {name!r}")
    return path(container) + "/" + quote(name, safe="/")


def _present(params: dict) -> dict:
    """The query parameters that carry a value (Swift reads an empty
    ``prefix=`` or ``marker=`` as given)."""
    return {key: value for key, value in params.items() if value}


class SwiftClient(ServiceClient):
    service_type = "object-store"
    service_name = "swift"

    def headers(self) -> dict[str, str]:
        hdrs = super().headers()
        # Swift answers JSON listings only when asked by query string; the
        # Accept header alone makes some proxies return XML.
        hdrs["Accept"] = "application/json"
        return hdrs

    async def account(self) -> dict[str, str]:
        resp = await self.request("HEAD", "")
        return {k.lower(): v for k, v in resp.headers.items()}

    async def update_account(self, metadata: dict[str, str]) -> None:
        await self.request("POST", "", headers=metadata)

    async def containers(self) -> Listing:
        return await self._listing("")

    async def container(self, name: str) -> dict[str, str]:
        resp = await self.request("HEAD", path(name))
        return {k.lower(): v for k, v in resp.headers.items()}

    async def create_container(
        self, name: str, metadata: dict[str, str] | None = None
    ) -> None:
        await self.request(
            "PUT",
            path(name),
            headers=metadata,
        )

    async def update_container(self, name: str, metadata: dict[str, str]):
        await self.request(
            "POST",
            path(name),
            headers=metadata,
        )

    async def delete_container(self, name: str) -> None:
        await self.delete(path(name))

    async def objects(
        self,
        container: str,
        *,
        prefix: str | None = None,
        delimiter: str | None = None,
        marker: str | None = None,
        limit: int = LISTING_LIMIT,
    ) -> list[dict]:
        params = _present(
            {
                "format": "json",
                "limit": limit,
                "prefix": prefix,
                "delimiter": delimiter,
                "marker": marker,
            }
        )
        body = await self.get_json(path(container), params=params)
        return body or []

    async def all_objects(
        self, container: str, prefix: str | None = None
    ) -> Listing:
        """Every object under a prefix, following markers (for recursive
        deletes)."""
        return await self._listing(path(container), prefix=prefix)

    async def _listing(self, at: str, **params) -> Listing:
        """A whole account or container listing. Swift pages by
        ``marker``: a full page means there may be more after its last
        name (or ``subdir``)."""

        async def fetch(marker: str | None) -> list[dict]:
            query = {"format": "json", "limit": LISTING_LIMIT, **params}
            if marker:
                query["marker"] = marker
            return await self.get_json(at, params=_present(query)) or []

        def next_marker(page: list[dict]) -> str | None:
            if len(page) < LISTING_LIMIT:
                return None
            return page[-1].get("name") or page[-1].get("subdir")

        items: list[dict] = []
        more: str | None = None
        async for page in self.paginate(fetch, next_marker):
            items.extend(page)
            more = next_marker(page)
        return Listing(items, truncated=more is not None)

    async def object_head(self, container: str, name: str) -> dict[str, str]:
        resp = await self.request("HEAD", object_path(container, name))
        return {k.lower(): v for k, v in resp.headers.items()}

    async def put_object(
        self,
        container: str,
        name: str,
        content: bytes | AsyncIterable[bytes],
        *,
        content_type: str | None = None,
        content_length: int | None = None,
        timeout: float | None = None,
        metadata: dict[str, str] | None = None,
    ) -> dict[str, str]:
        headers = dict(metadata or {})
        if content_type:
            headers["Content-Type"] = content_type
        if content_length is not None:
            headers["Content-Length"] = str(content_length)
        resp = await self.request(
            "PUT",
            object_path(container, name),
            content=content,
            headers=headers,
            timeout=timeout,
        )
        return {k.lower(): v for k, v in resp.headers.items()}

    async def put_manifest(
        self, container: str, name: str, manifest: list[dict]
    ) -> None:
        await self.request(
            "PUT",
            object_path(container, name),
            params={"multipart-manifest": "put"},
            json=manifest,
        )

    async def update_object(
        self, container: str, name: str, metadata: dict[str, str]
    ) -> None:
        await self.request(
            "POST", object_path(container, name), headers=metadata
        )

    async def copy_object(
        self, container: str, name: str, target_container: str, target: str
    ) -> None:
        await self.request(
            "PUT",
            object_path(target_container, target),
            headers={
                "X-Copy-From": object_path(container, name),
                "Content-Length": "0",
            },
        )

    async def delete_object(self, container: str, name: str, slo=False):
        params = {"multipart-manifest": "delete"} if slo else None
        await self.delete(object_path(container, name), params=params)

    async def bulk_delete(self, paths: list[str]) -> dict:
        """``POST ?bulk-delete`` with one percent-encoded
        ``/container/object`` per line. Swift answers 200 with the outcome
        in the body (``Response Status``, ``Number Deleted``, ``Errors``)."""
        if not paths:
            return {}
        body = "\n".join(paths).encode()
        resp = await self.request(
            "POST",
            "",
            params={"bulk-delete": "true"},
            content=body,
            headers={
                "Content-Type": "text/plain",
                "Accept": "application/json",
            },
            timeout=120,
        )
        try:
            return resp.json()
        except ValueError:
            return {}

    async def get_object(self, container: str, name: str) -> httpx.Response:
        """A streaming GET; the caller closes the response. An error
        status is read, closed and raised as the usual error."""
        url = self.endpoint + object_path(container, name)
        req = self._http.build_request(
            "GET",
            url,
            headers=self.headers(),
            timeout=httpx.Timeout(
                600, connect=self.settings.upstream_connect_timeout
            ),
        )
        resp = await self._http.send(req, stream=True)
        if resp.status_code >= 400:
            try:
                await resp.aread()
            finally:
                await resp.aclose()
            raise self.map_error(resp)
        return resp

    async def info(self) -> dict:
        """Cluster capabilities from ``/info`` next to the account URL."""
        base = self.endpoint.rsplit("/v1", 1)[0]
        body = await self.get_json(base + "/info")
        return body or {}
