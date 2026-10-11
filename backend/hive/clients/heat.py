"""Heat (orchestration) v1 client. The catalog endpoint already carries the
project id; stacks are addressed as ``/stacks/{name}/{id}`` once known."""

from hive.clients.base import ServiceClient


class HeatClient(ServiceClient):
    service_type = "orchestration"
    service_name = "heat"

    @staticmethod
    def _path(name: str, stack_id: str) -> str:
        return f"/stacks/{name}/{stack_id}"

    async def stacks(self, **params) -> list[dict]:
        body = await self.get_json("/stacks", params=params or None)
        return (body or {}).get("stacks", [])

    async def find_stack(self, identity: str) -> dict:
        """``GET /stacks/{name_or_id}`` answers with a redirect to the
        canonical ``/stacks/{name}/{id}``."""
        resp = await self.request(
            "GET", f"/stacks/{identity}", follow_redirects=True
        )
        return resp.json().get("stack", {})

    async def stack(self, name: str, stack_id: str, **params) -> dict:
        body = await self.get_json(
            self._path(name, stack_id), params=params or None
        )
        return (body or {}).get("stack", {})

    async def create_stack(self, fields: dict) -> dict:
        resp = await self.request("POST", "/stacks", json=fields, timeout=120)
        return resp.json().get("stack", {})

    async def preview_stack(self, fields: dict) -> dict:
        resp = await self.request(
            "POST", "/stacks/preview", json=fields, timeout=120
        )
        return resp.json().get("stack", {})

    async def update_stack(
        self, name: str, stack_id: str, fields: dict, existing: bool = False
    ) -> None:
        await self.request(
            "PATCH" if existing else "PUT",
            self._path(name, stack_id),
            json=fields,
            timeout=120,
            ok=(200, 202),
        )

    async def delete_stack(self, name: str, stack_id: str) -> None:
        await self.request("DELETE", self._path(name, stack_id), ok=(204,))

    async def stack_action(
        self, name: str, stack_id: str, action: str
    ) -> None:
        await self.request(
            "POST",
            f"{self._path(name, stack_id)}/actions",
            json={action: None},
            ok=(200, 202),
        )

    async def resources(
        self, name: str, stack_id: str, **params
    ) -> list[dict]:
        body = await self.get_json(
            f"{self._path(name, stack_id)}/resources", params=params or None
        )
        return (body or {}).get("resources", [])

    async def resource(self, name: str, stack_id: str, resource: str) -> dict:
        body = await self.get_json(
            f"{self._path(name, stack_id)}/resources/{resource}"
        )
        return (body or {}).get("resource", {})

    async def events(self, name: str, stack_id: str, **params) -> list[dict]:
        body = await self.get_json(
            f"{self._path(name, stack_id)}/events", params=params or None
        )
        return (body or {}).get("events", [])

    async def template(self, name: str, stack_id: str) -> dict:
        return (
            await self.get_json(f"{self._path(name, stack_id)}/template") or {}
        )

    async def environment(self, name: str, stack_id: str) -> dict:
        return (
            await self.get_json(f"{self._path(name, stack_id)}/environment")
            or {}
        )

    async def outputs(self, name: str, stack_id: str) -> list[dict]:
        body = await self.get_json(f"{self._path(name, stack_id)}/outputs")
        return (body or {}).get("outputs", [])

    async def output(self, name: str, stack_id: str, key: str) -> dict:
        body = await self.get_json(
            f"{self._path(name, stack_id)}/outputs/{key}"
        )
        return (body or {}).get("output", {})

    async def resource_types(self, with_description: bool = False) -> list:
        params = {"with_description": "true"} if with_description else None
        body = await self.get_json("/resource_types", params=params)
        return (body or {}).get("resource_types", [])

    async def resource_type(self, name: str) -> dict:
        return await self.get_json(f"/resource_types/{name}") or {}

    async def resource_type_template(self, name: str, template_type="hot"):
        return (
            await self.get_json(
                f"/resource_types/{name}/template",
                params={"template_type": template_type},
            )
            or {}
        )

    async def template_versions(self) -> list[dict]:
        body = await self.get_json("/template_versions")
        return (body or {}).get("template_versions", [])

    async def template_functions(self, version: str) -> list[dict]:
        body = await self.get_json(f"/template_versions/{version}/functions")
        return (body or {}).get("template_functions", [])

    async def validate(self, fields: dict) -> dict:
        resp = await self.request("POST", "/validate", json=fields, timeout=60)
        return resp.json() if resp.content else {}
