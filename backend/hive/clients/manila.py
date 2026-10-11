"""Manila (shared file systems) v2 client, pinned to a microversion."""

from hive.clients.base import ServiceClient


class ManilaClient(ServiceClient):
    service_type = "sharev2"
    service_name = "manila"
    microversion_header = "X-OpenStack-Manila-API-Version"

    def __init__(self, http, settings, scoped, **kwargs):
        kwargs.setdefault("microversion", settings.manila_microversion)
        super().__init__(http, settings, scoped, **kwargs)

    async def _list(self, path: str, key: str, **params) -> list[dict]:
        body = await self.get_json(path, params=params or None)
        return (body or {}).get(key, [])

    async def _get(self, path: str, key: str) -> dict:
        body = await self.get_json(path)
        return (body or {}).get(key, {})

    async def _create(self, path: str, key: str, fields: dict) -> dict:
        resp = await self.request("POST", path, json={key: fields}, timeout=60)
        return resp.json().get(key, {})

    async def _update(self, path: str, key: str, fields: dict) -> dict:
        resp = await self.request("PUT", path, json={key: fields})
        return resp.json().get(key, {}) if resp.content else {}

    async def _action(self, path: str, body: dict, timeout=None) -> dict:
        resp = await self.request(
            "POST", f"{path}/action", json=body, timeout=timeout, ok=(200, 202)
        )
        return resp.json() if resp.content else {}

    # shares
    async def shares(self, **params) -> list[dict]:
        return await self._list("/shares/detail", "shares", **params)

    async def share(self, share_id: str) -> dict:
        return await self._get(f"/shares/{share_id}", "share")

    async def create_share(self, fields: dict) -> dict:
        return await self._create("/shares", "share", fields)

    async def update_share(self, share_id: str, fields: dict) -> dict:
        return await self._update(f"/shares/{share_id}", "share", fields)

    async def delete_share(self, share_id: str) -> None:
        await self.request("DELETE", f"/shares/{share_id}", ok=(202, 204))

    async def extend_share(self, share_id: str, size: int) -> None:
        await self._action(f"/shares/{share_id}", {"extend": {"new_size": size}})

    async def shrink_share(self, share_id: str, size: int) -> None:
        await self._action(f"/shares/{share_id}", {"shrink": {"new_size": size}})

    async def revert_share(self, share_id: str, snapshot_id: str) -> None:
        await self._action(
            f"/shares/{share_id}", {"revert": {"snapshot_id": snapshot_id}}
        )

    async def access_rules(self, share_id: str) -> list[dict]:
        return await self._list(
            "/share-access-rules", "access_list", share_id=share_id
        )

    async def allow_access(self, share_id: str, fields: dict) -> dict:
        body = await self._action(f"/shares/{share_id}", {"allow_access": fields})
        return body.get("access", {})

    async def deny_access(self, share_id: str, access_id: str) -> None:
        await self._action(
            f"/shares/{share_id}", {"deny_access": {"access_id": access_id}}
        )

    async def export_locations(self, share_id: str) -> list[dict]:
        return await self._list(
            f"/shares/{share_id}/export_locations", "export_locations"
        )

    async def share_metadata(self, share_id: str) -> dict:
        body = await self.get_json(f"/shares/{share_id}/metadata")
        return (body or {}).get("metadata", {})

    async def set_share_metadata(self, share_id: str, metadata: dict) -> dict:
        resp = await self.request(
            "PUT", f"/shares/{share_id}/metadata", json={"metadata": metadata}
        )
        return resp.json().get("metadata", {}) if resp.content else {}

    async def delete_share_metadata(self, share_id: str, key: str) -> None:
        await self.request(
            "DELETE", f"/shares/{share_id}/metadata/{key}", ok=(200, 204)
        )

    # snapshots
    async def snapshots(self, **params) -> list[dict]:
        return await self._list("/snapshots/detail", "snapshots", **params)

    async def snapshot(self, snapshot_id: str) -> dict:
        return await self._get(f"/snapshots/{snapshot_id}", "snapshot")

    async def create_snapshot(self, fields: dict) -> dict:
        return await self._create("/snapshots", "snapshot", fields)

    async def update_snapshot(self, snapshot_id: str, fields: dict) -> dict:
        return await self._update(f"/snapshots/{snapshot_id}", "snapshot", fields)

    async def delete_snapshot(self, snapshot_id: str) -> None:
        await self.request("DELETE", f"/snapshots/{snapshot_id}", ok=(202, 204))

    # security services
    async def security_services(self, **params) -> list[dict]:
        return await self._list(
            "/security-services/detail", "security_services", **params
        )

    async def security_service(self, service_id: str) -> dict:
        return await self._get(f"/security-services/{service_id}", "security_service")

    async def create_security_service(self, fields: dict) -> dict:
        return await self._create("/security-services", "security_service", fields)

    async def update_security_service(self, service_id: str, fields: dict):
        return await self._update(
            f"/security-services/{service_id}", "security_service", fields
        )

    async def delete_security_service(self, service_id: str) -> None:
        await self.request(
            "DELETE", f"/security-services/{service_id}", ok=(202, 204)
        )

    # share groups
    async def share_groups(self, **params) -> list[dict]:
        return await self._list("/share-groups/detail", "share_groups", **params)

    async def share_group(self, group_id: str) -> dict:
        return await self._get(f"/share-groups/{group_id}", "share_group")

    async def create_share_group(self, fields: dict) -> dict:
        return await self._create("/share-groups", "share_group", fields)

    async def update_share_group(self, group_id: str, fields: dict) -> dict:
        return await self._update(f"/share-groups/{group_id}", "share_group", fields)

    async def delete_share_group(self, group_id: str) -> None:
        await self.request("DELETE", f"/share-groups/{group_id}", ok=(202, 204))

    async def share_group_types(self) -> list[dict]:
        return await self._list("/share-group-types", "share_group_types")

    async def share_group_snapshots(self, **params) -> list[dict]:
        return await self._list(
            "/share-group-snapshots/detail", "share_group_snapshots", **params
        )

    async def share_group_snapshot(self, snapshot_id: str) -> dict:
        return await self._get(
            f"/share-group-snapshots/{snapshot_id}", "share_group_snapshot"
        )

    async def create_share_group_snapshot(self, fields: dict) -> dict:
        return await self._create(
            "/share-group-snapshots", "share_group_snapshot", fields
        )

    async def update_share_group_snapshot(self, snapshot_id: str, fields: dict):
        return await self._update(
            f"/share-group-snapshots/{snapshot_id}", "share_group_snapshot", fields
        )

    async def delete_share_group_snapshot(self, snapshot_id: str) -> None:
        await self.request(
            "DELETE", f"/share-group-snapshots/{snapshot_id}", ok=(202, 204)
        )

    # catalogues
    async def share_types(self) -> list[dict]:
        return await self._list("/types", "share_types")

    async def availability_zones(self) -> list[dict]:
        return await self._list("/availability-zones", "availability_zones")

    async def share_networks(self) -> list[dict]:
        return await self._list("/share-networks", "share_networks")

    async def limits(self) -> dict:
        body = await self.get_json("/limits")
        return ((body or {}).get("limits") or {}).get("absolute") or {}
