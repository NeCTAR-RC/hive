"""Trove (database) v1 client. The catalog endpoint carries the project.

Lists follow Trove's paging: a full page carries a ``links`` entry with
``rel=next`` whose URL names the next page by ``marker``.
"""

from typing import Any, override

from hive.clients.base import path, quote_segment, ServiceClient

# Trove provisions before it answers a create or a log action.
CREATE_TIMEOUT = 60


class TroveClient(ServiceClient):
    service_type = "database"
    service_name = "trove"

    @override
    def next_link(self, body: Any, key: str) -> str | None:
        """The ``rel=next`` URL in the page's ``links``."""
        links = body.get("links") if isinstance(body, dict) else None
        for link in links or []:
            if link.get("rel") == "next" and link.get("href"):
                return link["href"]
        return None

    @staticmethod
    def _user_path(instance_id: str, user: str, *rest: str) -> str:
        """A user's URL as troveclient builds it (``quote_user_host``):
        ``user@host`` percent-encoded with its dots as ``%2e``, so Trove's
        router does not read ``.0.5`` as a format suffix."""
        users = path("instances", instance_id, "users")
        segment = quote_segment(user).replace(".", "%2e")
        return f"{users}/{segment}{path(*rest)}"

    async def instances(self, **params) -> list[dict]:
        return await self.list_all("/instances", "instances", **params)

    async def instance(self, instance_id: str) -> dict:
        return await self.get(path("instances", instance_id), "instance")

    async def create_instance(self, fields: dict) -> dict:
        return await self.create(
            "/instances", "instance", fields, timeout=CREATE_TIMEOUT
        )

    async def update_instance(self, instance_id: str, fields: dict) -> None:
        await self.update(path("instances", instance_id), "instance", fields)

    async def patch_instance(self, instance_id: str, fields: dict) -> None:
        await self.update(
            path("instances", instance_id), "instance", fields, method="PATCH"
        )

    async def delete_instance(self, instance_id: str) -> None:
        await self.delete(path("instances", instance_id))

    async def instance_action(self, instance_id: str, body: dict) -> None:
        await self.action(path("instances", instance_id, "action"), body)

    async def enable_root(self, instance_id: str, password: str | None = None):
        body = {"password": password} if password else None
        reply = await self.action(path("instances", instance_id, "root"), body)
        return reply.get("user") or {}

    async def root_status(self, instance_id: str) -> bool:
        reply = await self.get(path("instances", instance_id, "root"))
        return bool(reply.get("rootEnabled"))

    async def backups_of(self, instance_id: str) -> list[dict]:
        return await self.list_all(
            path("instances", instance_id, "backups"), "backups"
        )

    async def instance_configuration(self, instance_id: str) -> dict:
        """The effective configuration values of a running instance."""
        body = await self.get(
            path("instances", instance_id, "configuration"), "instance"
        )
        return body.get("configuration") or {}

    async def logs(self, instance_id: str) -> list[dict]:
        return await self.list_all(
            path("instances", instance_id, "log"), "logs"
        )

    async def log_action(self, instance_id: str, body: dict) -> dict:
        """``{"name": log}`` alone shows a log; add ``enable``, ``disable``,
        ``publish`` or ``discard`` set to 1 to act on it."""
        reply = await self.action(
            path("instances", instance_id, "log"), body, timeout=CREATE_TIMEOUT
        )
        return reply.get("log") or {}

    async def users(self, instance_id: str) -> list[dict]:
        return await self.list_all(
            path("instances", instance_id, "users"), "users"
        )

    async def create_users(self, instance_id: str, users: list[dict]) -> None:
        await self.action(
            path("instances", instance_id, "users"), {"users": users}
        )

    async def update_user(
        self, instance_id: str, name: str, fields: dict
    ) -> None:
        """Change a user's name, password or host (``PUT .../users/{user}``
        with ``{"user": fields}``, troveclient ``users.update_attributes``)."""
        await self.update(self._user_path(instance_id, name), "user", fields)

    async def delete_user(self, instance_id: str, name: str) -> None:
        await self.delete(self._user_path(instance_id, name))

    async def user_access(self, instance_id: str, name: str) -> list[dict]:
        return await self.list_all(
            self._user_path(instance_id, name, "databases"),
            "databases",
        )

    async def grant_access(self, instance_id: str, name: str, databases: list):
        await self.update(
            self._user_path(instance_id, name, "databases"),
            "databases",
            [{"name": d} for d in databases],
        )

    async def revoke_access(self, instance_id: str, name: str, database: str):
        await self.delete(
            self._user_path(instance_id, name, "databases", database)
        )

    async def databases(self, instance_id: str) -> list[dict]:
        return await self.list_all(
            path("instances", instance_id, "databases"), "databases"
        )

    async def create_databases(self, instance_id: str, databases: list[dict]):
        await self.action(
            path("instances", instance_id, "databases"),
            {"databases": databases},
        )

    async def delete_database(self, instance_id: str, name: str) -> None:
        await self.delete(path("instances", instance_id, "databases", name))

    async def backups(self, **params) -> list[dict]:
        return await self.list_all("/backups", "backups", **params)

    async def backup(self, backup_id: str) -> dict:
        return await self.get(path("backups", backup_id), "backup")

    async def create_backup(self, fields: dict) -> dict:
        return await self.create(
            "/backups", "backup", fields, timeout=CREATE_TIMEOUT
        )

    async def delete_backup(self, backup_id: str) -> None:
        await self.delete(path("backups", backup_id))

    async def configurations(self) -> list[dict]:
        return await self.list_all("/configurations", "configurations")

    async def configuration(self, configuration_id: str) -> dict:
        return await self.get(
            path("configurations", configuration_id), "configuration"
        )

    async def create_configuration(self, fields: dict) -> dict:
        return await self.create("/configurations", "configuration", fields)

    async def update_configuration(self, configuration_id: str, fields: dict):
        await self.update(
            path("configurations", configuration_id), "configuration", fields
        )

    async def patch_configuration(self, configuration_id: str, values: dict):
        await self.update(
            path("configurations", configuration_id),
            "configuration",
            {"values": values},
            method="PATCH",
        )

    async def delete_configuration(self, configuration_id: str) -> None:
        await self.delete(path("configurations", configuration_id))

    async def configuration_instances(
        self, configuration_id: str
    ) -> list[dict]:
        return await self.list_all(
            path("configurations", configuration_id, "instances"), "instances"
        )

    async def datastores(self) -> list[dict]:
        return await self.list_all("/datastores", "datastores")

    async def datastore_versions(self, datastore: str) -> list[dict]:
        return await self.list_all(
            path("datastores", datastore, "versions"), "versions"
        )

    async def configuration_parameters(self, datastore: str, version: str):
        return await self.list_all(
            path("datastores", datastore, "versions", version, "parameters"),
            "configuration-parameters",
        )

    async def flavors(
        self, datastore: str | None = None, version: str | None = None
    ):
        if datastore and version:
            return await self.list_all(
                path("datastores", datastore, "versions", version, "flavors"),
                "flavors",
            )
        return await self.list_all("/flavors", "flavors")

    async def limits(self) -> list[dict]:
        return await self.list_all("/limits", "limits")
