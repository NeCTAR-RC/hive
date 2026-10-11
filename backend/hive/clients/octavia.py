"""Octavia (load balancer) v2 client."""

from hive.clients.base import ServiceClient

LB = "/v2/lbaas"


class OctaviaClient(ServiceClient):
    service_type = "load-balancer"
    service_name = "octavia"

    async def _list(self, resource: str, key: str, **params) -> list[dict]:
        body = await self.get_json(f"{LB}/{resource}", params=params or None)
        return (body or {}).get(key, [])

    async def _get(self, resource: str, key: str, item_id: str) -> dict:
        body = await self.get_json(f"{LB}/{resource}/{item_id}")
        return (body or {}).get(key, {})

    async def _create(self, resource: str, key: str, fields: dict) -> dict:
        resp = await self.request(
            "POST", f"{LB}/{resource}", json={key: fields}, timeout=60
        )
        return resp.json().get(key, {})

    async def _update(
        self, resource: str, key: str, item_id: str, fields: dict
    ) -> dict:
        resp = await self.request(
            "PUT", f"{LB}/{resource}/{item_id}", json={key: fields}, timeout=60
        )
        return resp.json().get(key, {}) if resp.content else {}

    async def _delete(self, resource: str, item_id: str, **params) -> None:
        await self.request(
            "DELETE",
            f"{LB}/{resource}/{item_id}",
            params=params or None,
            ok=(202, 204),
        )

    # load balancers
    async def load_balancers(self, **params) -> list[dict]:
        return await self._list("loadbalancers", "loadbalancers", **params)

    async def load_balancer(self, lb_id: str) -> dict:
        return await self._get("loadbalancers", "loadbalancer", lb_id)

    async def create_load_balancer(self, fields: dict) -> dict:
        return await self._create("loadbalancers", "loadbalancer", fields)

    async def update_load_balancer(self, lb_id: str, fields: dict) -> dict:
        return await self._update(
            "loadbalancers", "loadbalancer", lb_id, fields
        )

    async def delete_load_balancer(self, lb_id: str, cascade: bool = True):
        await self._delete(
            "loadbalancers", lb_id, **({"cascade": "true"} if cascade else {})
        )

    async def load_balancer_status(self, lb_id: str) -> dict:
        body = await self.get_json(f"{LB}/loadbalancers/{lb_id}/status")
        return (body or {}).get("statuses", {})

    async def failover_load_balancer(self, lb_id: str) -> None:
        await self.request(
            "PUT", f"{LB}/loadbalancers/{lb_id}/failover", ok=(202,)
        )

    # listeners
    async def listeners(self, **params) -> list[dict]:
        return await self._list("listeners", "listeners", **params)

    async def listener(self, listener_id: str) -> dict:
        return await self._get("listeners", "listener", listener_id)

    async def create_listener(self, fields: dict) -> dict:
        return await self._create("listeners", "listener", fields)

    async def update_listener(self, listener_id: str, fields: dict) -> dict:
        return await self._update("listeners", "listener", listener_id, fields)

    async def delete_listener(self, listener_id: str) -> None:
        await self._delete("listeners", listener_id)

    # pools
    async def pools(self, **params) -> list[dict]:
        return await self._list("pools", "pools", **params)

    async def pool(self, pool_id: str) -> dict:
        return await self._get("pools", "pool", pool_id)

    async def create_pool(self, fields: dict) -> dict:
        return await self._create("pools", "pool", fields)

    async def update_pool(self, pool_id: str, fields: dict) -> dict:
        return await self._update("pools", "pool", pool_id, fields)

    async def delete_pool(self, pool_id: str) -> None:
        await self._delete("pools", pool_id)

    # members
    async def members(self, pool_id: str) -> list[dict]:
        return await self._list(f"pools/{pool_id}/members", "members")

    async def member(self, pool_id: str, member_id: str) -> dict:
        return await self._get(f"pools/{pool_id}/members", "member", member_id)

    async def create_member(self, pool_id: str, fields: dict) -> dict:
        return await self._create(f"pools/{pool_id}/members", "member", fields)

    async def update_member(
        self, pool_id: str, member_id: str, fields: dict
    ) -> dict:
        return await self._update(
            f"pools/{pool_id}/members", "member", member_id, fields
        )

    async def delete_member(self, pool_id: str, member_id: str) -> None:
        await self._delete(f"pools/{pool_id}/members", member_id)

    # health monitors
    async def health_monitors(self, **params) -> list[dict]:
        return await self._list("healthmonitors", "healthmonitors", **params)

    async def health_monitor(self, monitor_id: str) -> dict:
        return await self._get("healthmonitors", "healthmonitor", monitor_id)

    async def create_health_monitor(self, fields: dict) -> dict:
        return await self._create("healthmonitors", "healthmonitor", fields)

    async def update_health_monitor(self, monitor_id: str, fields: dict):
        return await self._update(
            "healthmonitors", "healthmonitor", monitor_id, fields
        )

    async def delete_health_monitor(self, monitor_id: str) -> None:
        await self._delete("healthmonitors", monitor_id)

    # L7
    async def l7_policies(self, **params) -> list[dict]:
        return await self._list("l7policies", "l7policies", **params)

    async def l7_policy(self, policy_id: str) -> dict:
        return await self._get("l7policies", "l7policy", policy_id)

    async def create_l7_policy(self, fields: dict) -> dict:
        return await self._create("l7policies", "l7policy", fields)

    async def update_l7_policy(self, policy_id: str, fields: dict) -> dict:
        return await self._update("l7policies", "l7policy", policy_id, fields)

    async def delete_l7_policy(self, policy_id: str) -> None:
        await self._delete("l7policies", policy_id)

    async def l7_rules(self, policy_id: str) -> list[dict]:
        return await self._list(f"l7policies/{policy_id}/rules", "rules")

    async def create_l7_rule(self, policy_id: str, fields: dict) -> dict:
        return await self._create(
            f"l7policies/{policy_id}/rules", "rule", fields
        )

    async def update_l7_rule(
        self, policy_id: str, rule_id: str, fields: dict
    ) -> dict:
        return await self._update(
            f"l7policies/{policy_id}/rules", "rule", rule_id, fields
        )

    async def delete_l7_rule(self, policy_id: str, rule_id: str) -> None:
        await self._delete(f"l7policies/{policy_id}/rules", rule_id)

    # catalogues
    async def flavors(self) -> list[dict]:
        return await self._list("flavors", "flavors")

    async def availability_zones(self) -> list[dict]:
        return await self._list("availabilityzones", "availability_zones")

    async def quota(self, project_id: str) -> dict:
        body = await self.get_json(f"{LB}/quotas/{project_id}")
        return (body or {}).get("quota", {})
