"""Swift (object store) client over the account URL from the catalog.

Listings use ``format=json``; metadata travels in headers as the Swift
API defines it. Large objects are static large objects (SLO): segments in
``<container>_segments`` and a manifest uploaded with
``multipart-manifest=put``. Nothing here applies Nectar policy.
"""

from collections.abc import AsyncIterable
from urllib.parse import quote

import httpx

from hive.clients.base import ServiceClient

LISTING_LIMIT = 1000
MAX_PAGES = 50


def object_path(container: str, name: str) -> str:
    return f"/{quote(container, safe='')}/{quote(name, safe='/')}"


class SwiftClient(ServiceClient):
    service_type = "object-store"
    service_name = "swift"

    def headers(self) -> dict[str, str]:
        hdrs = super().headers()
        # Swift answers JSON listings only when asked by query string; the
        # Accept header alone makes some proxies return XML.
        hdrs["Accept"] = "application/json"
        return hdrs

    # --- account -------------------------------------------------------------

    async def account(self) -> dict[str, str]:
        resp = await self.request("HEAD", "", ok=(200, 204))
        return {k.lower(): v for k, v in resp.headers.items()}

    async def update_account(self, metadata: dict[str, str]) -> None:
        await self.request("POST", "", headers=metadata, ok=(200, 202, 204))

    async def containers(self) -> list[dict]:
        items: list[dict] = []
        marker = None
        for _ in range(MAX_PAGES):
            params: dict = {"format": "json", "limit": LISTING_LIMIT}
            if marker:
                params["marker"] = marker
            body = await self.get_json("", params=params) or []
            items.extend(body)
            if len(body) < LISTING_LIMIT:
                break
            marker = body[-1].get("name")
        return items

    # --- containers ----------------------------------------------------------

    async def container(self, name: str) -> dict[str, str]:
        resp = await self.request(
            "HEAD", f"/{quote(name, safe='')}", ok=(200, 204)
        )
        return {k.lower(): v for k, v in resp.headers.items()}

    async def create_container(
        self, name: str, metadata: dict[str, str] | None = None
    ) -> None:
        await self.request(
            "PUT",
            f"/{quote(name, safe='')}",
            headers=metadata,
            ok=(201, 202, 204),
        )

    async def update_container(self, name: str, metadata: dict[str, str]):
        await self.request(
            "POST",
            f"/{quote(name, safe='')}",
            headers=metadata,
            ok=(200, 202, 204),
        )

    async def delete_container(self, name: str) -> None:
        await self.request(
            "DELETE", f"/{quote(name, safe='')}", ok=(200, 202, 204)
        )

    async def objects(
        self,
        container: str,
        *,
        prefix: str | None = None,
        delimiter: str | None = None,
        marker: str | None = None,
        limit: int = LISTING_LIMIT,
    ) -> list[dict]:
        params: dict = {"format": "json", "limit": limit}
        if prefix:
            params["prefix"] = prefix
        if delimiter:
            params["delimiter"] = delimiter
        if marker:
            params["marker"] = marker
        body = await self.get_json(f"/{quote(container, safe='')}", params=params)
        return body or []

    async def all_objects(self, container: str, prefix: str | None = None):
        """Every object under a prefix, following markers (for recursive
        folder deletes)."""
        items: list[dict] = []
        marker = None
        for _ in range(MAX_PAGES):
            page = await self.objects(container, prefix=prefix, marker=marker)
            items.extend(page)
            if len(page) < LISTING_LIMIT:
                break
            marker = page[-1].get("name")
        return items

    # --- objects -------------------------------------------------------------

    async def object_head(self, container: str, name: str) -> dict[str, str]:
        resp = await self.request(
            "HEAD", object_path(container, name), ok=(200, 204)
        )
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
    ) -> dict[str, str]:
        headers = {}
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
            ok=(201, 202),
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
            ok=(201, 202),
        )

    async def update_object(
        self, container: str, name: str, metadata: dict[str, str]
    ) -> None:
        await self.request(
            "POST", object_path(container, name), headers=metadata, ok=(202,)
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
            ok=(201, 202),
        )

    async def delete_object(self, container: str, name: str, slo=False):
        params = {"multipart-manifest": "delete"} if slo else None
        await self.request(
            "DELETE",
            object_path(container, name),
            params=params,
            ok=(200, 204),
        )

    async def bulk_delete(self, paths: list[str]) -> dict:
        """``POST ?bulk-delete`` with one ``/container/object`` per line."""
        if not paths:
            return {}
        body = "\n".join(paths).encode()
        resp = await self.request(
            "POST",
            "",
            params={"bulk-delete": "true"},
            content=body,
            headers={"Content-Type": "text/plain", "Accept": "application/json"},
            timeout=120,
            ok=(200,),
        )
        try:
            return resp.json()
        except ValueError:
            return {}

    async def get_object(self, container: str, name: str) -> httpx.Response:
        """A streaming GET; the caller closes the response."""
        url = self.endpoint + object_path(container, name)
        req = self._http.build_request(
            "GET", url, headers=self.headers(), timeout=httpx.Timeout(600, connect=self.settings.upstream_connect_timeout)
        )
        return await self._http.send(req, stream=True)

    async def info(self) -> dict:
        """Cluster capabilities from ``/info`` next to the account URL."""
        base = self.endpoint.rsplit("/v1", 1)[0]
        body = await self.get_json(base + "/info")
        return body or {}
