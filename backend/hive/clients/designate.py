"""Designate (DNS) v2 client. Zones and record sets are not enveloped;
lists name their next page in ``links.next``."""

from typing import Any, override

from hive.clients.base import path, ServiceClient


class DesignateClient(ServiceClient):
    service_type = "dns"
    service_name = "designate"

    @override
    def next_link(self, body: Any, key: str) -> str | None:
        if not isinstance(body, dict):
            return None
        return (body.get("links") or {}).get("next")

    async def zones(self, **params) -> list[dict]:
        return await self.list_all("/v2/zones", "zones", **params)

    async def zone(self, zone_id: str) -> dict:
        return await self.get(path("v2", "zones", zone_id))

    async def create_zone(self, fields: dict) -> dict:
        return await self.create("/v2/zones", None, fields)

    async def update_zone(self, zone_id: str, fields: dict) -> dict:
        return await self.update(
            path("v2", "zones", zone_id), None, fields, method="PATCH"
        )

    async def delete_zone(self, zone_id: str) -> dict:
        """Designate answers the zone, now ``PENDING`` delete."""
        resp = await self.request("DELETE", path("v2", "zones", zone_id))
        return resp.json() if resp.content else {}

    async def recordsets(self, zone_id: str, **params) -> list[dict]:
        return await self.list_all(
            path("v2", "zones", zone_id, "recordsets"), "recordsets", **params
        )

    async def recordset(self, zone_id: str, recordset_id: str) -> dict:
        return await self.get(
            path("v2", "zones", zone_id, "recordsets", recordset_id)
        )

    async def create_recordset(self, zone_id: str, fields: dict) -> dict:
        return await self.create(
            path("v2", "zones", zone_id, "recordsets"), None, fields
        )

    async def update_recordset(
        self, zone_id: str, recordset_id: str, fields: dict
    ) -> dict:
        return await self.update(
            path("v2", "zones", zone_id, "recordsets", recordset_id),
            None,
            fields,
        )

    async def delete_recordset(self, zone_id: str, recordset_id: str) -> None:
        await self.delete(
            path("v2", "zones", zone_id, "recordsets", recordset_id)
        )

    async def quotas(self) -> dict:
        return await self.get("/v2/quotas")
