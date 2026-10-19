"""Magnum (container infrastructure) client, pinned to the microversion
that carries node group labels and taints."""

from hive.clients.base import seg
from hive.clients.base import ServiceClient


def _json(resp) -> dict:
    return resp.json() if resp.content else {}


class MagnumClient(ServiceClient):
    service_type = "container-infra"
    service_name = "magnum"
    microversion_header = "OpenStack-API-Version"
    microversion_prefix = "container-infra"

    def __init__(self, http, settings, scoped, **kwargs):
        kwargs.setdefault("microversion", settings.magnum_microversion)
        super().__init__(http, settings, scoped, **kwargs)

    @staticmethod
    def _cluster(cluster_id: str) -> str:
        return f"/clusters/{seg(cluster_id)}"

    def _nodegroup(self, cluster_id: str, nodegroup_id: str) -> str:
        return f"{self._cluster(cluster_id)}/nodegroups/{seg(nodegroup_id)}"

    async def cluster_templates(self) -> list[dict]:
        body = await self.get_json("/clustertemplates/detail")
        return (body or {}).get("clustertemplates", [])

    async def cluster_template(self, template_id: str) -> dict:
        return (
            await self.get_json(f"/clustertemplates/{seg(template_id)}") or {}
        )

    async def clusters(self) -> list[dict]:
        body = await self.get_json("/clusters/detail")
        return (body or {}).get("clusters", [])

    async def cluster(self, cluster_id: str) -> dict:
        return await self.get_json(self._cluster(cluster_id)) or {}

    async def create_cluster(self, fields: dict) -> dict:
        resp = await self.request("POST", "/clusters", json=fields, timeout=60)
        return _json(resp)

    async def delete_cluster(self, cluster_id: str) -> None:
        await self.request("DELETE", self._cluster(cluster_id), ok=(202, 204))

    async def upgrade_cluster(self, cluster_id: str, fields: dict) -> dict:
        resp = await self.request(
            "POST",
            f"{self._cluster(cluster_id)}/actions/upgrade",
            json=fields,
        )
        return _json(resp)

    async def resize_cluster(self, cluster_id: str, fields: dict) -> dict:
        resp = await self.request(
            "POST", f"{self._cluster(cluster_id)}/actions/resize", json=fields
        )
        return _json(resp)

    async def nodegroups(self, cluster_id: str) -> list[dict]:
        body = await self.get_json(f"{self._cluster(cluster_id)}/nodegroups")
        return (body or {}).get("nodegroups", [])

    async def nodegroup(self, cluster_id: str, nodegroup_id: str) -> dict:
        return (
            await self.get_json(self._nodegroup(cluster_id, nodegroup_id))
            or {}
        )

    async def create_nodegroup(self, cluster_id: str, fields: dict) -> dict:
        resp = await self.request(
            "POST", f"{self._cluster(cluster_id)}/nodegroups", json=fields
        )
        return _json(resp)

    async def patch_nodegroup(
        self, cluster_id: str, nodegroup_id: str, patch: list[dict]
    ) -> dict:
        resp = await self.request(
            "PATCH",
            self._nodegroup(cluster_id, nodegroup_id),
            json=patch,
            headers={"Content-Type": "application/json-patch+json"},
        )
        return _json(resp)

    async def delete_nodegroup(self, cluster_id: str, nodegroup_id: str):
        await self.request(
            "DELETE",
            self._nodegroup(cluster_id, nodegroup_id),
            ok=(202, 204),
        )

    async def ca_certificate(self, cluster_id: str) -> dict:
        return await self.get_json(f"/certificates/{seg(cluster_id)}") or {}

    async def sign_certificate(self, cluster_id: str, csr: str) -> dict:
        resp = await self.request(
            "POST",
            "/certificates",
            json={"cluster_uuid": cluster_id, "csr": csr},
            timeout=60,
        )
        return _json(resp)

    async def quota(self, project_id: str) -> dict:
        return await self.get_json(f"/quotas/{seg(project_id)}/Cluster") or {}

    async def stats(self, project_id: str) -> dict:
        return (
            await self.get_json("/stats", params={"project_id": project_id})
            or {}
        )
