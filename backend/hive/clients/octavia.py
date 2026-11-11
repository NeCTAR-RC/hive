"""Octavia (load balancer) v2 client. Every resource lives under
``/v2/lbaas``; writes get a longer timeout, as Octavia validates the
whole load balancer before it answers."""

from hive.clients.base import path, ServiceClient

WRITE_TIMEOUT = 60


def lbaas(*segments: str) -> str:
    """An Octavia path under ``/v2/lbaas``, every segment encoded."""
    return path("v2", "lbaas", *segments)


class OctaviaClient(ServiceClient):
    service_type = "load-balancer"
    service_name = "octavia"

    async def load_balancers(self, **params) -> list[dict]:
        return await self.list(
            lbaas("loadbalancers"), "loadbalancers", **params
        )

    async def load_balancer(self, lb_id: str) -> dict:
        return await self.get(lbaas("loadbalancers", lb_id), "loadbalancer")

    async def create_load_balancer(self, fields: dict) -> dict:
        return await self.create(
            lbaas("loadbalancers"),
            "loadbalancer",
            fields,
            timeout=WRITE_TIMEOUT,
        )

    async def update_load_balancer(self, lb_id: str, fields: dict) -> dict:
        return await self.update(
            lbaas("loadbalancers", lb_id),
            "loadbalancer",
            fields,
            timeout=WRITE_TIMEOUT,
        )

    async def delete_load_balancer(self, lb_id: str, cascade: bool = True):
        await self.delete(
            lbaas("loadbalancers", lb_id),
            params={"cascade": "true"} if cascade else None,
        )

    async def load_balancer_status(self, lb_id: str) -> dict:
        return await self.get(
            lbaas("loadbalancers", lb_id, "status"), "statuses"
        )

    async def failover_load_balancer(self, lb_id: str) -> None:
        await self.request("PUT", lbaas("loadbalancers", lb_id, "failover"))

    async def listeners(self, **params) -> list[dict]:
        return await self.list(lbaas("listeners"), "listeners", **params)

    async def listener(self, listener_id: str) -> dict:
        return await self.get(lbaas("listeners", listener_id), "listener")

    async def create_listener(self, fields: dict) -> dict:
        return await self.create(
            lbaas("listeners"), "listener", fields, timeout=WRITE_TIMEOUT
        )

    async def update_listener(self, listener_id: str, fields: dict) -> dict:
        return await self.update(
            lbaas("listeners", listener_id),
            "listener",
            fields,
            timeout=WRITE_TIMEOUT,
        )

    async def delete_listener(self, listener_id: str) -> None:
        await self.delete(lbaas("listeners", listener_id))

    async def pools(self, **params) -> list[dict]:
        return await self.list(lbaas("pools"), "pools", **params)

    async def pool(self, pool_id: str) -> dict:
        return await self.get(lbaas("pools", pool_id), "pool")

    async def create_pool(self, fields: dict) -> dict:
        return await self.create(
            lbaas("pools"), "pool", fields, timeout=WRITE_TIMEOUT
        )

    async def update_pool(self, pool_id: str, fields: dict) -> dict:
        return await self.update(
            lbaas("pools", pool_id), "pool", fields, timeout=WRITE_TIMEOUT
        )

    async def delete_pool(self, pool_id: str) -> None:
        await self.delete(lbaas("pools", pool_id))

    async def members(self, pool_id: str) -> list[dict]:
        return await self.list(lbaas("pools", pool_id, "members"), "members")

    async def member(self, pool_id: str, member_id: str) -> dict:
        return await self.get(
            lbaas("pools", pool_id, "members", member_id), "member"
        )

    async def create_member(self, pool_id: str, fields: dict) -> dict:
        return await self.create(
            lbaas("pools", pool_id, "members"),
            "member",
            fields,
            timeout=WRITE_TIMEOUT,
        )

    async def update_member(
        self, pool_id: str, member_id: str, fields: dict
    ) -> dict:
        return await self.update(
            lbaas("pools", pool_id, "members", member_id),
            "member",
            fields,
            timeout=WRITE_TIMEOUT,
        )

    async def delete_member(self, pool_id: str, member_id: str) -> None:
        await self.delete(lbaas("pools", pool_id, "members", member_id))

    async def health_monitors(self, **params) -> list[dict]:
        return await self.list(
            lbaas("healthmonitors"), "healthmonitors", **params
        )

    async def health_monitor(self, monitor_id: str) -> dict:
        return await self.get(
            lbaas("healthmonitors", monitor_id), "healthmonitor"
        )

    async def create_health_monitor(self, fields: dict) -> dict:
        return await self.create(
            lbaas("healthmonitors"),
            "healthmonitor",
            fields,
            timeout=WRITE_TIMEOUT,
        )

    async def update_health_monitor(self, monitor_id: str, fields: dict):
        return await self.update(
            lbaas("healthmonitors", monitor_id),
            "healthmonitor",
            fields,
            timeout=WRITE_TIMEOUT,
        )

    async def delete_health_monitor(self, monitor_id: str) -> None:
        await self.delete(lbaas("healthmonitors", monitor_id))

    async def l7_policies(self, **params) -> list[dict]:
        return await self.list(lbaas("l7policies"), "l7policies", **params)

    async def l7_policy(self, policy_id: str) -> dict:
        return await self.get(lbaas("l7policies", policy_id), "l7policy")

    async def create_l7_policy(self, fields: dict) -> dict:
        return await self.create(
            lbaas("l7policies"), "l7policy", fields, timeout=WRITE_TIMEOUT
        )

    async def update_l7_policy(self, policy_id: str, fields: dict) -> dict:
        return await self.update(
            lbaas("l7policies", policy_id),
            "l7policy",
            fields,
            timeout=WRITE_TIMEOUT,
        )

    async def delete_l7_policy(self, policy_id: str) -> None:
        await self.delete(lbaas("l7policies", policy_id))

    async def l7_rules(self, policy_id: str) -> list[dict]:
        return await self.list(
            lbaas("l7policies", policy_id, "rules"), "rules"
        )

    async def create_l7_rule(self, policy_id: str, fields: dict) -> dict:
        return await self.create(
            lbaas("l7policies", policy_id, "rules"),
            "rule",
            fields,
            timeout=WRITE_TIMEOUT,
        )

    async def update_l7_rule(
        self, policy_id: str, rule_id: str, fields: dict
    ) -> dict:
        return await self.update(
            lbaas("l7policies", policy_id, "rules", rule_id),
            "rule",
            fields,
            timeout=WRITE_TIMEOUT,
        )

    async def delete_l7_rule(self, policy_id: str, rule_id: str) -> None:
        await self.delete(lbaas("l7policies", policy_id, "rules", rule_id))

    async def flavors(self) -> list[dict]:
        return await self.list(lbaas("flavors"), "flavors")

    async def availability_zones(self) -> list[dict]:
        return await self.list(
            lbaas("availabilityzones"), "availability_zones"
        )

    async def quota(self, project_id: str) -> dict:
        return await self.get(lbaas("quotas", project_id), "quota")
