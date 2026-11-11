"""Heat (orchestration) v1 client. The catalog endpoint already carries the
project id; stacks are addressed as ``/stacks/{name}/{id}`` once known.
Stack bodies are not enveloped; replies are."""

from hive.clients.base import path, rebase, ServiceClient

# Heat validates and plans the whole template before it answers a write.
STACK_TIMEOUT = 120


class HeatClient(ServiceClient):
    service_type = "orchestration"
    service_name = "heat"

    @staticmethod
    def _path(name: str, stack_id: str, *rest: str) -> str:
        return path("stacks", name, stack_id, *rest)

    async def stacks(self, **params) -> list[dict]:
        return await self.list("/stacks", "stacks", **params)

    async def find_stack(self, identity: str) -> dict:
        """``GET /stacks/{name_or_id}`` answers with a 302 to the canonical
        ``/stacks/{name}/{id}``. Only the path of the ``Location`` is
        followed, re-based on this client's endpoint (``rebase``), so an
        endpoint override holds and the token never goes to a host Heat
        names."""
        resp = await self.request(
            "GET", path("stacks", identity), ok=(200, 302)
        )
        if resp.status_code == 302:
            location = resp.headers.get("location") or ""
            resp = await self.request("GET", rebase(self.endpoint, location))
        return resp.json().get("stack") or {}

    async def stack(self, name: str, stack_id: str, **params) -> dict:
        return await self.get(self._path(name, stack_id), "stack", **params)

    async def create_stack(self, fields: dict) -> dict:
        reply = await self.action("/stacks", fields, timeout=STACK_TIMEOUT)
        return reply.get("stack") or {}

    async def preview_stack(self, fields: dict) -> dict:
        reply = await self.action(
            "/stacks/preview", fields, timeout=STACK_TIMEOUT
        )
        return reply.get("stack") or {}

    async def update_stack(
        self, name: str, stack_id: str, fields: dict, existing: bool = False
    ) -> None:
        await self.update(
            self._path(name, stack_id),
            None,
            fields,
            method="PATCH" if existing else "PUT",
            timeout=STACK_TIMEOUT,
        )

    async def delete_stack(self, name: str, stack_id: str) -> None:
        await self.delete(self._path(name, stack_id))

    async def stack_action(
        self, name: str, stack_id: str, action: str
    ) -> None:
        await self.action(
            self._path(name, stack_id, "actions"), {action: None}
        )

    async def resources(
        self, name: str, stack_id: str, **params
    ) -> list[dict]:
        return await self.list(
            self._path(name, stack_id, "resources"), "resources", **params
        )

    async def resource(self, name: str, stack_id: str, resource: str) -> dict:
        return await self.get(
            self._path(name, stack_id, "resources", resource), "resource"
        )

    async def events(self, name: str, stack_id: str, **params) -> list[dict]:
        return await self.list(
            self._path(name, stack_id, "events"), "events", **params
        )

    async def template(self, name: str, stack_id: str) -> dict:
        return await self.get(self._path(name, stack_id, "template"))

    async def environment(self, name: str, stack_id: str) -> dict:
        return await self.get(self._path(name, stack_id, "environment"))

    async def outputs(self, name: str, stack_id: str) -> list[dict]:
        return await self.list(
            self._path(name, stack_id, "outputs"), "outputs"
        )

    async def output(self, name: str, stack_id: str, key: str) -> dict:
        return await self.get(
            self._path(name, stack_id, "outputs", key), "output"
        )

    async def resource_types(self, with_description: bool = False) -> list:
        params = {"with_description": "true"} if with_description else {}
        return await self.list("/resource_types", "resource_types", **params)

    async def resource_type(self, name: str) -> dict:
        return await self.get(path("resource_types", name))

    async def resource_type_template(self, name: str, template_type="hot"):
        return await self.get(
            path("resource_types", name, "template"),
            template_type=template_type,
        )

    async def template_versions(self) -> list[dict]:
        return await self.list("/template_versions", "template_versions")

    async def template_functions(self, version: str) -> list[dict]:
        return await self.list(
            path("template_versions", version, "functions"),
            "template_functions",
        )

    async def validate(self, fields: dict) -> dict:
        return await self.action("/validate", fields, timeout=60)
