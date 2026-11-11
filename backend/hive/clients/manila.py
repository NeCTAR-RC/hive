"""Manila (shared file systems) v2 client, pinned to a microversion."""

from hive.clients.base import path, ServiceClient

# Manila schedules a share before it answers a create.
CREATE_TIMEOUT = 60


class ManilaClient(ServiceClient):
    service_type = "sharev2"
    service_name = "manila"
    microversion_header = "X-OpenStack-Manila-API-Version"

    def __init__(self, http, settings, scoped, **kwargs):
        kwargs.setdefault("microversion", settings.manila_microversion)
        super().__init__(http, settings, scoped, **kwargs)

    async def shares(self, **params) -> list[dict]:
        return await self.list("/shares/detail", "shares", **params)

    async def share(self, share_id: str) -> dict:
        return await self.get(path("shares", share_id), "share")

    async def create_share(self, fields: dict) -> dict:
        return await self.create(
            "/shares", "share", fields, timeout=CREATE_TIMEOUT
        )

    async def update_share(self, share_id: str, fields: dict) -> dict:
        return await self.update(path("shares", share_id), "share", fields)

    async def delete_share(self, share_id: str) -> None:
        await self.delete(path("shares", share_id))

    async def extend_share(self, share_id: str, size: int) -> None:
        await self.action(
            path("shares", share_id, "action"), {"extend": {"new_size": size}}
        )

    async def shrink_share(self, share_id: str, size: int) -> None:
        await self.action(
            path("shares", share_id, "action"), {"shrink": {"new_size": size}}
        )

    async def revert_share(self, share_id: str, snapshot_id: str) -> None:
        await self.action(
            path("shares", share_id, "action"),
            {"revert": {"snapshot_id": snapshot_id}},
        )

    async def access_rules(self, share_id: str) -> list[dict]:
        return await self.list(
            "/share-access-rules", "access_list", share_id=share_id
        )

    async def allow_access(self, share_id: str, fields: dict) -> dict:
        body = await self.action(
            path("shares", share_id, "action"), {"allow_access": fields}
        )
        return body.get("access", {})

    async def deny_access(self, share_id: str, access_id: str) -> None:
        await self.action(
            path("shares", share_id, "action"),
            {"deny_access": {"access_id": access_id}},
        )

    async def export_locations(self, share_id: str) -> list[dict]:
        return await self.list(
            path("shares", share_id, "export_locations"), "export_locations"
        )

    async def share_metadata(self, share_id: str) -> dict:
        return await self.get(path("shares", share_id, "metadata"), "metadata")

    async def set_share_metadata(self, share_id: str, metadata: dict) -> dict:
        return await self.update(
            path("shares", share_id, "metadata"), "metadata", metadata
        )

    async def delete_share_metadata(self, share_id: str, key: str) -> None:
        await self.delete(path("shares", share_id, "metadata", key))

    async def snapshots(self, **params) -> list[dict]:
        return await self.list("/snapshots/detail", "snapshots", **params)

    async def snapshot(self, snapshot_id: str) -> dict:
        return await self.get(path("snapshots", snapshot_id), "snapshot")

    async def snapshot_export_locations(self, snapshot_id: str) -> list[dict]:
        return await self.list(
            path("snapshots", snapshot_id, "export-locations"),
            "share_snapshot_export_locations",
        )

    async def snapshot_access_rules(self, snapshot_id: str) -> list[dict]:
        return await self.list(
            path("snapshots", snapshot_id, "access-list"),
            "snapshot_access_list",
        )

    async def snapshot_allow_access(self, snapshot_id: str, fields: dict):
        """The whole reply: ``snapshot_access``, or the bare rule."""
        return await self.action(
            path("snapshots", snapshot_id, "action"), {"allow_access": fields}
        )

    async def snapshot_deny_access(self, snapshot_id: str, access_id: str):
        await self.action(
            path("snapshots", snapshot_id, "action"),
            {"deny_access": {"access_id": access_id}},
        )

    async def create_snapshot(self, fields: dict) -> dict:
        return await self.create(
            "/snapshots", "snapshot", fields, timeout=CREATE_TIMEOUT
        )

    async def update_snapshot(self, snapshot_id: str, fields: dict) -> dict:
        return await self.update(
            path("snapshots", snapshot_id), "snapshot", fields
        )

    async def delete_snapshot(self, snapshot_id: str) -> None:
        await self.delete(path("snapshots", snapshot_id))

    async def security_services(self, **params) -> list[dict]:
        return await self.list(
            "/security-services/detail", "security_services", **params
        )

    async def security_service(self, service_id: str) -> dict:
        return await self.get(
            path("security-services", service_id), "security_service"
        )

    async def create_security_service(self, fields: dict) -> dict:
        return await self.create(
            "/security-services",
            "security_service",
            fields,
            timeout=CREATE_TIMEOUT,
        )

    async def update_security_service(self, service_id: str, fields: dict):
        return await self.update(
            path("security-services", service_id), "security_service", fields
        )

    async def delete_security_service(self, service_id: str) -> None:
        await self.delete(path("security-services", service_id))

    async def share_groups(self, **params) -> list[dict]:
        return await self.list(
            "/share-groups/detail", "share_groups", **params
        )

    async def share_group(self, group_id: str) -> dict:
        return await self.get(path("share-groups", group_id), "share_group")

    async def create_share_group(self, fields: dict) -> dict:
        return await self.create(
            "/share-groups", "share_group", fields, timeout=CREATE_TIMEOUT
        )

    async def update_share_group(self, group_id: str, fields: dict) -> dict:
        return await self.update(
            path("share-groups", group_id), "share_group", fields
        )

    async def delete_share_group(self, group_id: str) -> None:
        await self.delete(path("share-groups", group_id))

    async def share_group_types(self) -> list[dict]:
        return await self.list("/share-group-types", "share_group_types")

    async def share_group_snapshots(self, **params) -> list[dict]:
        return await self.list(
            "/share-group-snapshots/detail", "share_group_snapshots", **params
        )

    async def share_group_snapshot(self, snapshot_id: str) -> dict:
        return await self.get(
            path("share-group-snapshots", snapshot_id), "share_group_snapshot"
        )

    async def create_share_group_snapshot(self, fields: dict) -> dict:
        return await self.create(
            "/share-group-snapshots",
            "share_group_snapshot",
            fields,
            timeout=CREATE_TIMEOUT,
        )

    async def update_share_group_snapshot(
        self, snapshot_id: str, fields: dict
    ):
        return await self.update(
            path("share-group-snapshots", snapshot_id),
            "share_group_snapshot",
            fields,
        )

    async def delete_share_group_snapshot(self, snapshot_id: str) -> None:
        await self.delete(path("share-group-snapshots", snapshot_id))

    async def share_types(self) -> list[dict]:
        return await self.list("/types", "share_types")

    async def availability_zones(self) -> list[dict]:
        return await self.list("/availability-zones", "availability_zones")

    async def share_networks(self) -> list[dict]:
        return await self.list("/share-networks", "share_networks")

    async def limits(self) -> dict:
        return (await self.get("/limits", "limits")).get("absolute") or {}
