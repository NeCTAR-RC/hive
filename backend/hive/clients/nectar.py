"""Thin clients for the Nectar services (manuka, langstroth, varroa, warre,
cloudkitty, gnocchi, the Horizon allocation API).

Paths and parameters mirror the python client libraries Horizon uses
(``nectarclient_lib`` pagination is ``{results, next}``; updates are
PATCH), so behaviour stays recognisable to anyone who maintains those.
"""

from hive.clients.base import ServiceClient

MAX_PAGES = 20


class PagedClient(ServiceClient):
    """A client whose list endpoints follow the nectarclient_lib shape."""

    async def list_all(
        self, path: str, params: dict | None = None, **kwargs
    ) -> list[dict]:
        items: list[dict] = []
        url = path
        for _ in range(MAX_PAGES):
            body = await self.get_json(url, params=params, **kwargs)
            if body is None:
                break
            if isinstance(body, list):
                items.extend(body)
                break
            items.extend(body.get("results") or [])
            url = body.get("next") or ""
            params = None  # the next link carries its own query
            if not url:
                break
        return items


class ManukaClient(ServiceClient):
    service_type = "account"
    service_name = "manuka"

    async def get_user(self, keystone_user_id: str) -> dict:
        return await self.get_json(f"/v1/users/{keystone_user_id}/") or {}

    async def update_user(self, keystone_user_id: str, **fields) -> dict:
        resp = await self.request(
            "PATCH", f"/v1/users/{keystone_user_id}/", json=fields
        )
        return resp.json() if resp.content else {}

    async def search_users(self, query: str) -> list[dict]:
        resp = await self.request(
            "POST", "/v1/users/search/", json={"search": query}
        )
        body = resp.json()
        return body.get("results", body) if isinstance(body, dict) else body

    async def user_by_name(self, name: str) -> dict:
        path = f"/v1/keystone-ext/user-by-name/{name}/"
        return await self.get_json(path) or {}


class LangstrothClient(PagedClient):
    service_type = "nectar-ops"
    service_name = "langstroth"

    async def outages(self, **params) -> list[dict]:
        return await self.list_all("/v1/outages/", params=params)


class VarroaClient(PagedClient):
    service_type = "security"
    service_name = "varroa"

    async def security_risks(self, **params) -> list[dict]:
        return await self.list_all("/v1/security-risks/", params=params)


class WarreClient(PagedClient):
    """Nectar's reservation service (``warreclient`` v1)."""

    service_type = "nectar-reservation"
    service_name = "warre"

    async def reservations(self, **params) -> list[dict]:
        return await self.list_all("/v1/reservations/", params=params)

    async def reservation(self, reservation_id: str) -> dict:
        return await self.get_json(f"/v1/reservations/{reservation_id}/") or {}

    async def create_reservation(self, fields: dict) -> dict:
        resp = await self.request("POST", "/v1/reservations/", json=fields)
        return resp.json() if resp.content else {}

    async def update_reservation(self, reservation_id: str, fields: dict):
        resp = await self.request(
            "PATCH", f"/v1/reservations/{reservation_id}/", json=fields
        )
        return resp.json() if resp.content else {}

    async def delete_reservation(self, reservation_id: str) -> None:
        await self.request("DELETE", f"/v1/reservations/{reservation_id}/")

    async def flavors(self, **params) -> list[dict]:
        return await self.list_all("/v1/flavors/", params=params)

    async def flavor(self, flavor_id: str) -> dict:
        return await self.get_json(f"/v1/flavors/{flavor_id}/") or {}

    async def free_slots(
        self, flavor_id: str, start: str | None = None, end: str | None = None
    ) -> list[dict]:
        params = {}
        if start:
            params["start"] = start
        if end:
            params["end"] = end
        body = await self.get_json(
            f"/v1/flavors/{flavor_id}/freeslots/", params=params or None
        )
        return body if isinstance(body, list) else []

    async def limits(self) -> dict:
        body = await self.get_json("/v1/limits/")
        return (body or {}).get("absolute") or {}

    async def maintenance_windows(self) -> list[dict]:
        return await self.list_all("/v1/maintenancewindows/")


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
        limit: int = 1000,
    ) -> list[dict]:
        """Every row of a summary, following ``offset`` pages (Horizon
        stops at the first 1000 rows, ``nectar_dashboard/api/usage.py:48``)."""
        rows: list[dict] = []
        for page in range(MAX_PAGES):
            body = await self.summary(
                begin,
                end,
                filters=filters,
                groupby=groupby,
                limit=limit,
                offset=page * limit,
            )
            results = body.get("results") or []
            rows.extend(results)
            total = body.get("total")
            if not results or len(results) < limit:
                break
            if isinstance(total, int) and len(rows) >= total:
                break
        return rows


class GnocchiClient(ServiceClient):
    service_type = "metric"
    service_name = "gnocchi"

    async def search_resources(
        self, resource_type: str, query: dict, limit: int = 1000
    ) -> list[dict]:
        resp = await self.request(
            "POST",
            f"/v1/search/resource/{resource_type}",
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

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.settings.allocation_api_url:
            self._endpoint = self.settings.allocation_api_url.rstrip("/")

    async def allocations(self, **params) -> list[dict]:
        return await self.list_all("/allocations/", params=params)
