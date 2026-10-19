"""Trove (database) v1 client. The catalog endpoint carries the project."""

from urllib.parse import parse_qs
from urllib.parse import urlsplit

from hive.clients.base import seg
from hive.clients.base import ServiceClient

# Trove pages lists at 20 by default; 50 pages is far beyond any project.
MAX_PAGES = 50


def next_marker(body: dict) -> str | None:
    """The ``marker`` of the ``rel=next`` link Trove adds to a full page."""
    for link in body.get("links") or []:
        if link.get("rel") != "next":
            continue
        query = parse_qs(urlsplit(link.get("href") or "").query)
        marker = query.get("marker")
        if marker and marker[0]:
            return marker[0]
    return None


def _json(resp) -> dict:
    return resp.json() if resp.content else {}


class TroveClient(ServiceClient):
    service_type = "database"
    service_name = "trove"

    async def _list(self, path: str, key: str, **params) -> list[dict]:
        """Every page of a list, following ``links[rel=next]`` by marker."""
        items: list[dict] = []
        query = dict(params)
        for _ in range(MAX_PAGES):
            body = await self.get_json(path, params=query or None) or {}
            items.extend(body.get(key, []))
            marker = next_marker(body)
            if not marker or marker == query.get("marker"):
                break
            query["marker"] = marker
        return items

    async def _get(self, path: str, key: str) -> dict:
        body = await self.get_json(path)
        return (body or {}).get(key, {})

    @staticmethod
    def _instance(instance_id: str) -> str:
        return f"/instances/{seg(instance_id)}"

    # instances
    async def instances(self, **params) -> list[dict]:
        return await self._list("/instances", "instances", **params)

    async def instance(self, instance_id: str) -> dict:
        return await self._get(self._instance(instance_id), "instance")

    async def create_instance(self, fields: dict) -> dict:
        resp = await self.request(
            "POST", "/instances", json={"instance": fields}, timeout=60
        )
        return _json(resp).get("instance", {})

    async def update_instance(self, instance_id: str, fields: dict) -> None:
        await self.request(
            "PUT",
            self._instance(instance_id),
            json={"instance": fields},
            ok=(200, 202),
        )

    async def patch_instance(self, instance_id: str, fields: dict) -> None:
        await self.request(
            "PATCH",
            self._instance(instance_id),
            json={"instance": fields},
            ok=(200, 202),
        )

    async def delete_instance(self, instance_id: str) -> None:
        await self.request(
            "DELETE", self._instance(instance_id), ok=(202, 204)
        )

    async def instance_action(self, instance_id: str, body: dict) -> None:
        await self.request(
            "POST",
            f"{self._instance(instance_id)}/action",
            json=body,
            ok=(200, 202),
        )

    async def enable_root(self, instance_id: str, password: str | None = None):
        body = {"password": password} if password else None
        resp = await self.request(
            "POST",
            f"{self._instance(instance_id)}/root",
            json=body,
            ok=(200, 201),
        )
        return _json(resp).get("user", {})

    async def root_status(self, instance_id: str) -> bool:
        body = await self.get_json(f"{self._instance(instance_id)}/root")
        return bool((body or {}).get("rootEnabled"))

    async def backups_of(self, instance_id: str) -> list[dict]:
        return await self._list(
            f"{self._instance(instance_id)}/backups", "backups"
        )

    async def instance_configuration(self, instance_id: str) -> dict:
        """The effective configuration values of a running instance."""
        body = await self._get(
            f"{self._instance(instance_id)}/configuration", "instance"
        )
        return body.get("configuration") or {}

    # guest logs
    async def logs(self, instance_id: str) -> list[dict]:
        return await self._list(f"{self._instance(instance_id)}/log", "logs")

    async def log_action(self, instance_id: str, body: dict) -> dict:
        """``{"name": log}`` alone shows a log; add ``enable``, ``disable``,
        ``publish`` or ``discard`` set to 1 to act on it."""
        resp = await self.request(
            "POST",
            f"{self._instance(instance_id)}/log",
            json=body,
            timeout=60,
            ok=(200, 202),
        )
        return _json(resp).get("log", {})

    # users and databases
    def _user(self, instance_id: str, name: str) -> str:
        """``name`` is ``user@host``; troveclient ``quote_user_host``
        percent-encodes it and then encodes each dot as ``%2e`` so Trove's
        router does not read a host's dots as a format suffix."""
        ident = seg(name).replace(".", "%2e")
        return f"{self._instance(instance_id)}/users/{ident}"

    async def users(self, instance_id: str) -> list[dict]:
        return await self._list(
            f"{self._instance(instance_id)}/users", "users"
        )

    async def create_users(self, instance_id: str, users: list[dict]) -> None:
        await self.request(
            "POST",
            f"{self._instance(instance_id)}/users",
            json={"users": users},
            ok=(202,),
        )

    async def delete_user(self, instance_id: str, name: str) -> None:
        await self.request(
            "DELETE", self._user(instance_id, name), ok=(202, 204)
        )

    async def user_access(self, instance_id: str, name: str) -> list[dict]:
        return await self._list(
            f"{self._user(instance_id, name)}/databases", "databases"
        )

    async def grant_access(self, instance_id: str, name: str, databases: list):
        await self.request(
            "PUT",
            f"{self._user(instance_id, name)}/databases",
            json={"databases": [{"name": d} for d in databases]},
            ok=(202,),
        )

    async def revoke_access(self, instance_id: str, name: str, database: str):
        await self.request(
            "DELETE",
            f"{self._user(instance_id, name)}/databases/{seg(database)}",
            ok=(202, 204),
        )

    async def databases(self, instance_id: str) -> list[dict]:
        return await self._list(
            f"{self._instance(instance_id)}/databases", "databases"
        )

    async def create_databases(self, instance_id: str, databases: list[dict]):
        await self.request(
            "POST",
            f"{self._instance(instance_id)}/databases",
            json={"databases": databases},
            ok=(202,),
        )

    async def delete_database(self, instance_id: str, name: str) -> None:
        await self.request(
            "DELETE",
            f"{self._instance(instance_id)}/databases/{seg(name)}",
            ok=(202, 204),
        )

    # backups
    async def backups(self, **params) -> list[dict]:
        return await self._list("/backups", "backups", **params)

    async def backup(self, backup_id: str) -> dict:
        return await self._get(f"/backups/{seg(backup_id)}", "backup")

    async def create_backup(self, fields: dict) -> dict:
        resp = await self.request(
            "POST",
            "/backups",
            json={"backup": fields},
            timeout=60,
            ok=(200, 202),
        )
        return _json(resp).get("backup", {})

    async def delete_backup(self, backup_id: str) -> None:
        await self.request(
            "DELETE", f"/backups/{seg(backup_id)}", ok=(202, 204)
        )

    # configurations
    @staticmethod
    def _configuration(configuration_id: str) -> str:
        return f"/configurations/{seg(configuration_id)}"

    async def configurations(self) -> list[dict]:
        return await self._list("/configurations", "configurations")

    async def configuration(self, configuration_id: str) -> dict:
        return await self._get(
            self._configuration(configuration_id), "configuration"
        )

    async def create_configuration(self, fields: dict) -> dict:
        resp = await self.request(
            "POST",
            "/configurations",
            json={"configuration": fields},
            ok=(200, 201),
        )
        return _json(resp).get("configuration", {})

    async def update_configuration(self, configuration_id: str, fields: dict):
        await self.request(
            "PUT",
            self._configuration(configuration_id),
            json={"configuration": fields},
            ok=(200, 202),
        )

    async def patch_configuration(self, configuration_id: str, values: dict):
        await self.request(
            "PATCH",
            self._configuration(configuration_id),
            json={"configuration": {"values": values}},
            ok=(200, 202),
        )

    async def delete_configuration(self, configuration_id: str) -> None:
        await self.request(
            "DELETE", self._configuration(configuration_id), ok=(202, 204)
        )

    async def configuration_instances(
        self, configuration_id: str
    ) -> list[dict]:
        return await self._list(
            f"{self._configuration(configuration_id)}/instances", "instances"
        )

    # catalogues
    async def datastores(self) -> list[dict]:
        return await self._list("/datastores", "datastores")

    async def datastore_versions(self, datastore: str) -> list[dict]:
        return await self._list(
            f"/datastores/{seg(datastore)}/versions", "versions"
        )

    async def configuration_parameters(self, datastore: str, version: str):
        return await self._list(
            f"/datastores/{seg(datastore)}/versions/{seg(version)}/parameters",
            "configuration-parameters",
        )

    async def flavors(
        self, datastore: str | None = None, version: str | None = None
    ):
        if datastore and version:
            return await self._list(
                f"/datastores/{seg(datastore)}/versions/{seg(version)}"
                "/flavors",
                "flavors",
            )
        return await self._list("/flavors", "flavors")

    async def limits(self) -> list[dict]:
        return await self._list("/limits", "limits")
