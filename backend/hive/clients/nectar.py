"""Thin clients for the Nectar services (manuka, langstroth, varroa, warre,
cloudkitty, gnocchi, the Horizon allocation API).

Paths and parameters mirror the python client libraries Horizon uses
(``nectarclient_lib`` pagination is ``{results, next}``; updates are
PATCH), so behaviour stays recognisable to anyone who maintains those.
"""

from typing import Any, override

from hive.clients.base import path, ServiceClient

# CloudKitty summary rows per page (its own default limit).
SUMMARY_PAGE = 1000


class PagedClient(ServiceClient):
    """A client whose lists follow the nectarclient_lib shape: ``{results,
    next}``, with ``next`` an absolute URL."""

    @override
    def next_link(self, body: Any, key: str) -> str | None:
        return body.get("next") if isinstance(body, dict) else None


class ManukaClient(ServiceClient):
    service_type = "account"
    service_name = "manuka"

    async def get_user(self, keystone_user_id: str) -> dict:
        return await self.get(path("v1", "users", keystone_user_id) + "/")

    async def update_user(self, keystone_user_id: str, **fields) -> dict:
        return await self.update(
            path("v1", "users", keystone_user_id) + "/",
            None,
            fields,
            method="PATCH",
        )

    async def search_users(self, query: str) -> list[dict]:
        body = await self.action("/v1/users/search/", {"search": query})
        return body.get("results", body) if isinstance(body, dict) else body

    async def user_by_name(self, name: str) -> dict:
        return await self.get(
            path("v1", "keystone-ext", "user-by-name", name) + "/"
        )


class LangstrothClient(PagedClient):
    service_type = "nectar-ops"
    service_name = "langstroth"
    ends_session_on_401 = False

    async def outages(self, **params) -> list[dict]:
        return await self.list_all("/v1/outages/", "results", **params)


class VarroaClient(PagedClient):
    service_type = "security"
    service_name = "varroa"
    ends_session_on_401 = False

    async def security_risks(self, **params) -> list[dict]:
        return await self.list_all("/v1/security-risks/", "results", **params)


class WarreClient(PagedClient):
    """Nectar's reservation service (``warreclient`` v1)."""

    service_type = "nectar-reservation"
    service_name = "warre"

    async def reservations(self, **params) -> list[dict]:
        return await self.list_all("/v1/reservations/", "results", **params)

    async def reservation(self, reservation_id: str) -> dict:
        return await self.get(path("v1", "reservations", reservation_id) + "/")

    async def create_reservation(self, fields: dict) -> dict:
        return await self.create("/v1/reservations/", None, fields)

    async def update_reservation(self, reservation_id: str, fields: dict):
        return await self.update(
            path("v1", "reservations", reservation_id) + "/",
            None,
            fields,
            method="PATCH",
        )

    async def delete_reservation(self, reservation_id: str) -> None:
        await self.delete(path("v1", "reservations", reservation_id) + "/")

    async def flavors(self, **params) -> list[dict]:
        return await self.list_all("/v1/flavors/", "results", **params)

    async def flavor(self, flavor_id: str) -> dict:
        return await self.get(path("v1", "flavors", flavor_id) + "/")

    async def free_slots(
        self, flavor_id: str, start: str | None = None, end: str | None = None
    ) -> list[dict]:
        params = {}
        if start:
            params["start"] = start
        if end:
            params["end"] = end
        body = await self.get_json(
            path("v1", "flavors", flavor_id, "freeslots") + "/",
            params=params or None,
        )
        return body if isinstance(body, list) else []

    async def limits(self) -> dict:
        return await self.get("/v1/limits/", "absolute")

    async def maintenance_windows(self) -> list[dict]:
        return await self.list_all("/v1/maintenancewindows/", "results")


class CloudKittyClient(ServiceClient):
    service_type = "rating"
    service_name = "cloudkitty"

    async def summary(
        self,
        begin: str,
        end: str,
        *,
        filters: dict | None = None,
        groupby: str | list[str] | None = None,
        limit: int = 1000,
        offset: int = 0,
    ) -> dict:
        params: dict = {
            "begin": begin,
            "end": end,
            "response_format": "object",
            "limit": limit,
            "offset": offset,
        }
        if filters:
            params["filters"] = ",".join(
                f"{key}:{value}" for key, value in filters.items()
            )
        if groupby:
            params["groupby"] = (
                groupby if isinstance(groupby, str) else ",".join(groupby)
            )
        body = await self.get_json("/v2/summary", params=params, timeout=60)
        return body or {}

    async def summary_rows(
        self,
        begin: str,
        end: str,
        *,
        filters: dict | None = None,
        groupby: str | list[str] | None = None,
    ) -> list[dict]:
        """Every row of a summary, following ``offset`` pages (Horizon
        stops at the first 1000 rows, ``nectar_dashboard/api/usage.py:48``)."""

        async def page(offset: int) -> list[dict]:
            body = await self.summary(
                begin,
                end,
                filters=filters,
                groupby=groupby,
                limit=SUMMARY_PAGE,
                offset=offset,
            )
            return body.get("results") or []

        return await self.list_by_offset(page, SUMMARY_PAGE)


class GnocchiClient(ServiceClient):
    service_type = "metric"
    service_name = "gnocchi"

    async def search_resources(
        self, resource_type: str, query: dict, limit: int = 1000
    ) -> list[dict]:
        resp = await self.request(
            "POST",
            path("v1", "search", "resource", resource_type),
            params={"limit": limit},
            json=query,
            timeout=60,
        )
        body = resp.json() if resp.content else []
        return body if isinstance(body, list) else []


class AllocationsClient(PagedClient):
    """Horizon's ``/rest_api/`` allocation API, read with the user's token."""

    service_type = "allocations"
    service_name = "allocations"
    ends_session_on_401 = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.settings.allocation_api_url:
            self._endpoint = self.settings.allocation_api_url.rstrip("/")

    async def allocations(self, **params) -> list[dict]:
        return await self.list_all("/allocations/", "results", **params)
