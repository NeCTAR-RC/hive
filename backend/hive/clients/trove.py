"""Trove (database) v1 client. The catalog endpoint carries the project."""

from hive.clients.base import ServiceClient


class TroveClient(ServiceClient):
    service_type = "database"
    service_name = "trove"

    async def _list(self, path: str, key: str, **params) -> list[dict]:
        body = await self.get_json(path, params=params or None)
        return (body or {}).get(key, [])

    async def _get(self, path: str, key: str) -> dict:
        body = await self.get_json(path)
        return (body or {}).get(key, {})

    # instances
    async def instances(self, **params) -> list[dict]:
        return await self._list("/instances", "instances", **params)

    async def instance(self, instance_id: str) -> dict:
        return await self._get(f"/instances/{instance_id}", "instance")

    async def create_instance(self, fields: dict) -> dict:
        resp = await self.request(
            "POST", "/instances", json={"instance": fields}, timeout=60
        )
        return resp.json().get("instance", {})

    async def update_instance(self, instance_id: str, fields: dict) -> None:
        await self.request(
            "PUT", f"/instances/{instance_id}", json={"instance": fields}, ok=(200, 202)
        )

    async def patch_instance(self, instance_id: str, fields: dict) -> None:
        await self.request(
            "PATCH", f"/instances/{instance_id}", json={"instance": fields}, ok=(200, 202)
        )

    async def delete_instance(self, instance_id: str) -> None:
        await self.request("DELETE", f"/instances/{instance_id}", ok=(202, 204))

    async def instance_action(self, instance_id: str, body: dict) -> None:
        await self.request(
            "POST", f"/instances/{instance_id}/action", json=body, ok=(200, 202)
        )

    async def enable_root(self, instance_id: str, password: str | None = None):
        body = {"password": password} if password else None
        resp = await self.request(
            "POST", f"/instances/{instance_id}/root", json=body, ok=(200, 201)
        )
        return resp.json().get("user", {})

    async def root_status(self, instance_id: str) -> bool:
        body = await self.get_json(f"/instances/{instance_id}/root")
        return bool((body or {}).get("rootEnabled"))

    async def backups_of(self, instance_id: str) -> list[dict]:
        return await self._list(f"/instances/{instance_id}/backups", "backups")

    # users and databases
    async def users(self, instance_id: str) -> list[dict]:
        return await self._list(f"/instances/{instance_id}/users", "users")

    async def create_users(self, instance_id: str, users: list[dict]) -> None:
        await self.request(
            "POST", f"/instances/{instance_id}/users", json={"users": users}, ok=(202,)
        )

    async def delete_user(self, instance_id: str, name: str) -> None:
        await self.request(
            "DELETE", f"/instances/{instance_id}/users/{name}", ok=(202, 204)
        )

    async def user_access(self, instance_id: str, name: str) -> list[dict]:
        return await self._list(
            f"/instances/{instance_id}/users/{name}/databases", "databases"
        )

    async def grant_access(self, instance_id: str, name: str, databases: list):
        await self.request(
            "PUT",
            f"/instances/{instance_id}/users/{name}/databases",
            json={"databases": [{"name": d} for d in databases]},
            ok=(202,),
        )

    async def revoke_access(self, instance_id: str, name: str, database: str):
        await self.request(
            "DELETE",
            f"/instances/{instance_id}/users/{name}/databases/{database}",
            ok=(202, 204),
        )

    async def databases(self, instance_id: str) -> list[dict]:
        return await self._list(f"/instances/{instance_id}/databases", "databases")

    async def create_databases(self, instance_id: str, databases: list[dict]):
        await self.request(
            "POST",
            f"/instances/{instance_id}/databases",
            json={"databases": databases},
            ok=(202,),
        )

    async def delete_database(self, instance_id: str, name: str) -> None:
        await self.request(
            "DELETE", f"/instances/{instance_id}/databases/{name}", ok=(202, 204)
        )

    # backups
    async def backups(self, **params) -> list[dict]:
        return await self._list("/backups", "backups", **params)

    async def backup(self, backup_id: str) -> dict:
        return await self._get(f"/backups/{backup_id}", "backup")

    async def create_backup(self, fields: dict) -> dict:
        resp = await self.request(
            "POST", "/backups", json={"backup": fields}, timeout=60, ok=(200, 202)
        )
        return resp.json().get("backup", {})

    async def delete_backup(self, backup_id: str) -> None:
        await self.request("DELETE", f"/backups/{backup_id}", ok=(202, 204))

    # configurations
    async def configurations(self) -> list[dict]:
        return await self._list("/configurations", "configurations")

    async def configuration(self, configuration_id: str) -> dict:
        return await self._get(f"/configurations/{configuration_id}", "configuration")

    async def create_configuration(self, fields: dict) -> dict:
        resp = await self.request(
            "POST", "/configurations", json={"configuration": fields}, ok=(200, 201)
        )
        return resp.json().get("configuration", {})

    async def update_configuration(self, configuration_id: str, fields: dict):
        await self.request(
            "PUT",
            f"/configurations/{configuration_id}",
            json={"configuration": fields},
            ok=(200, 202),
        )

    async def patch_configuration(self, configuration_id: str, values: dict):
        await self.request(
            "PATCH",
            f"/configurations/{configuration_id}",
            json={"configuration": {"values": values}},
            ok=(200, 202),
        )

    async def delete_configuration(self, configuration_id: str) -> None:
        await self.request(
            "DELETE", f"/configurations/{configuration_id}", ok=(202, 204)
        )

    async def configuration_instances(self, configuration_id: str) -> list[dict]:
        return await self._list(
            f"/configurations/{configuration_id}/instances", "instances"
        )

    # catalogues
    async def datastores(self) -> list[dict]:
        return await self._list("/datastores", "datastores")

    async def datastore_versions(self, datastore: str) -> list[dict]:
        return await self._list(f"/datastores/{datastore}/versions", "versions")

    async def configuration_parameters(self, datastore: str, version: str):
        return await self._list(
            f"/datastores/{datastore}/versions/{version}/parameters",
            "configuration-parameters",
        )

    async def flavors(self, datastore: str | None = None, version: str | None = None):
        if datastore and version:
            return await self._list(
                f"/datastores/{datastore}/versions/{version}/flavors", "flavors"
            )
        return await self._list("/flavors", "flavors")

    async def limits(self) -> list[dict]:
        return await self._list("/limits", "limits")
