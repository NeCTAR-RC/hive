"""Magnum (container infrastructure) client, pinned to the microversion
that carries node group labels and taints. Bodies are not enveloped."""

from hive.clients.base import path, ServiceClient

# Magnum validates the template and quota before it answers.
CREATE_TIMEOUT = 60


class MagnumClient(ServiceClient):
    service_type = "container-infra"
    service_name = "magnum"
    microversion_header = "OpenStack-API-Version"
    microversion_prefix = "container-infra"

    def __init__(self, http, settings, scoped, **kwargs):
        kwargs.setdefault("microversion", settings.magnum_microversion)
        super().__init__(http, settings, scoped, **kwargs)

    async def cluster_templates(self) -> list[dict]:
        return await self.list("/clustertemplates/detail", "clustertemplates")

    async def cluster_template(self, template_id: str) -> dict:
        return await self.get(path("clustertemplates", template_id))

    async def clusters(self) -> list[dict]:
        return await self.list("/clusters/detail", "clusters")

    async def cluster(self, cluster_id: str) -> dict:
        return await self.get(path("clusters", cluster_id))

    async def create_cluster(self, fields: dict) -> dict:
        return await self.create(
            "/clusters", None, fields, timeout=CREATE_TIMEOUT
        )

    async def delete_cluster(self, cluster_id: str) -> None:
        await self.delete(path("clusters", cluster_id))

    async def upgrade_cluster(self, cluster_id: str, fields: dict) -> dict:
        return await self.action(
            path("clusters", cluster_id, "actions", "upgrade"), fields
        )

    async def resize_cluster(self, cluster_id: str, fields: dict) -> dict:
        return await self.action(
            path("clusters", cluster_id, "actions", "resize"), fields
        )

    async def nodegroups(self, cluster_id: str) -> list[dict]:
        return await self.list(
            path("clusters", cluster_id, "nodegroups"), "nodegroups"
        )

    async def nodegroup(self, cluster_id: str, nodegroup_id: str) -> dict:
        return await self.get(
            path("clusters", cluster_id, "nodegroups", nodegroup_id)
        )

    async def create_nodegroup(self, cluster_id: str, fields: dict) -> dict:
        return await self.create(
            path("clusters", cluster_id, "nodegroups"), None, fields
        )

    async def patch_nodegroup(
        self, cluster_id: str, nodegroup_id: str, patch: list[dict]
    ) -> dict:
        """A JSON-patch update (``application/json-patch+json``)."""
        resp = await self.request(
            "PATCH",
            path("clusters", cluster_id, "nodegroups", nodegroup_id),
            json=patch,
            headers={"Content-Type": "application/json-patch+json"},
        )
        return resp.json() if resp.content else {}

    async def delete_nodegroup(self, cluster_id: str, nodegroup_id: str):
        await self.delete(
            path("clusters", cluster_id, "nodegroups", nodegroup_id)
        )

    async def ca_certificate(self, cluster_id: str) -> dict:
        return await self.get(path("certificates", cluster_id))

    async def sign_certificate(self, cluster_id: str, csr: str) -> dict:
        return await self.create(
            "/certificates",
            None,
            {"cluster_uuid": cluster_id, "csr": csr},
            timeout=CREATE_TIMEOUT,
        )

    async def quota(self, project_id: str) -> dict:
        return await self.get(path("quotas", project_id, "Cluster"))

    async def stats(self, project_id: str) -> dict:
        return await self.get("/stats", project_id=project_id)
