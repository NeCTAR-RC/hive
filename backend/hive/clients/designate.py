"""Designate (DNS) v2 client with link-following pagination. Every
caller-supplied id goes through ``seg``."""

from hive.clients.base import seg, ServiceClient

MAX_PAGES = 20


class DesignateClient(ServiceClient):
    service_type = "dns"
    service_name = "designate"

    async def _paged(self, path: str, key: str, params: dict | None) -> list:
        items: list[dict] = []
        url: str | None = path
        query = params
        for _ in range(MAX_PAGES):
            if not url:
                break
            body = await self.get_json(url, params=query) or {}
            items.extend(body.get(key) or [])
            url = (body.get("links") or {}).get("next")
            query = None
            if url and not url.startswith("http"):
                url = None
            if url:
                # Designate links carry the public URL; use the path only so
                # the endpoint override still applies.
                url = url[url.find("/v2/") :] if "/v2/" in url else url
        return items

    async def zones(self, **params) -> list[dict]:
        return await self._paged("/v2/zones", "zones", params or None)

    async def zone(self, zone_id: str) -> dict:
        return await self.get_json(f"/v2/zones/{seg(zone_id)}") or {}

    async def create_zone(self, fields: dict) -> dict:
        resp = await self.request(
            "POST", "/v2/zones", json=fields, ok=(201, 202)
        )
        return resp.json() if resp.content else {}

    async def update_zone(self, zone_id: str, fields: dict) -> dict:
        resp = await self.request(
            "PATCH", f"/v2/zones/{seg(zone_id)}", json=fields, ok=(200, 202)
        )
        return resp.json() if resp.content else {}

    async def delete_zone(self, zone_id: str) -> dict:
        resp = await self.request(
            "DELETE", f"/v2/zones/{seg(zone_id)}", ok=(202, 204)
        )
        return resp.json() if resp.content else {}

    async def recordsets(self, zone_id: str, **params) -> list[dict]:
        return await self._paged(
            f"/v2/zones/{seg(zone_id)}/recordsets",
            "recordsets",
            params or None,
        )

    async def recordset(self, zone_id: str, recordset_id: str) -> dict:
        return (
            await self.get_json(
                f"/v2/zones/{seg(zone_id)}/recordsets/{seg(recordset_id)}"
            )
            or {}
        )

    async def create_recordset(self, zone_id: str, fields: dict) -> dict:
        resp = await self.request(
            "POST",
            f"/v2/zones/{seg(zone_id)}/recordsets",
            json=fields,
            ok=(201, 202),
        )
        return resp.json() if resp.content else {}

    async def update_recordset(
        self, zone_id: str, recordset_id: str, fields: dict
    ) -> dict:
        resp = await self.request(
            "PUT",
            f"/v2/zones/{seg(zone_id)}/recordsets/{seg(recordset_id)}",
            json=fields,
            ok=(200, 202),
        )
        return resp.json() if resp.content else {}

    async def delete_recordset(self, zone_id: str, recordset_id: str) -> None:
        await self.request(
            "DELETE",
            f"/v2/zones/{seg(zone_id)}/recordsets/{seg(recordset_id)}",
            ok=(202, 204),
        )

    async def quotas(self) -> dict:
        return await self.get_json("/v2/quotas") or {}
