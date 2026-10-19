"""Load balancers (Octavia): the wizard's chained creation, the resource
tree and the floating IP association, as octavia-dashboard does them."""

import asyncio
import time

import structlog

from hive.clients.octavia import OctaviaClient
from hive.errors import BadRequest, Conflict, HiveError, NotFound
from hive.nectar import loadbalancer as rules
from hive.schemas.loadbalancer import (
    L7PolicySpec,
    L7RuleSpec,
    ListenerSpec,
    LoadBalancerCreate,
    MemberSpec,
    MonitorSpec,
    PoolSpec,
)
from hive.schemas.network import FloatingIpAllocate
from hive.services.context import Context
from hive.services import network as network_service

log = structlog.get_logger("hive.loadbalancer")

POLL_SECONDS = 2.5
POLL_LIMIT = 240  # ten minutes
CHAIN_TTL = 1800
FAN_OUT = 8


def _octavia(ctx: Context) -> OctaviaClient:
    return OctaviaClient(ctx.http, ctx.settings, ctx.scoped)


def _chain_key(ctx: Context, lb_id: str) -> str:
    return ctx.cache.project_key(ctx.project_id, "lb-chain", lb_id)


async def _set_chain(ctx: Context, lb_id: str, state: dict) -> None:
    await ctx.cache.set_json(_chain_key(ctx, lb_id), state, ttl=CHAIN_TTL)


async def chain_state(ctx: Context, lb_id: str) -> dict | None:
    state = await ctx.cache.get_json(_chain_key(ctx, lb_id))
    return state if isinstance(state, dict) else None


# --- summaries -----------------------------------------------------------------


def lb_summary(lb: dict, floating: dict | None = None) -> dict:
    return {
        "id": lb.get("id"),
        "name": lb.get("name"),
        "description": lb.get("description"),
        "provisioning_status": lb.get("provisioning_status"),
        "operating_status": lb.get("operating_status"),
        "admin_state_up": lb.get("admin_state_up"),
        "vip_address": lb.get("vip_address"),
        "vip_port_id": lb.get("vip_port_id"),
        "vip_subnet_id": lb.get("vip_subnet_id"),
        "vip_network_id": lb.get("vip_network_id"),
        "provider": lb.get("provider"),
        "flavor_id": lb.get("flavor_id"),
        "availability_zone": lb.get("availability_zone"),
        "listeners": [i.get("id") for i in lb.get("listeners") or []],
        "pools": [i.get("id") for i in lb.get("pools") or []],
        "floating_ip": (
            {
                "id": floating.get("id"),
                "address": floating.get("floating_ip_address"),
            }
            if floating
            else None
        ),
        "created_at": lb.get("created_at"),
        "updated_at": lb.get("updated_at"),
        "can_delete": rules.can_delete(lb),
        "is_transitional": rules.is_transitional(lb),
    }


def listener_summary(listener: dict) -> dict:
    return {
        "id": listener.get("id"),
        "name": listener.get("name"),
        "description": listener.get("description"),
        "protocol": listener.get("protocol"),
        "protocol_port": listener.get("protocol_port"),
        "provisioning_status": listener.get("provisioning_status"),
        "operating_status": listener.get("operating_status"),
        "admin_state_up": listener.get("admin_state_up"),
        "connection_limit": listener.get("connection_limit"),
        "default_pool_id": listener.get("default_pool_id"),
        "loadbalancer_id": next(
            (i.get("id") for i in listener.get("loadbalancers") or []), None
        ),
        "timeout_client_data": listener.get("timeout_client_data"),
        "timeout_member_connect": listener.get("timeout_member_connect"),
        "timeout_member_data": listener.get("timeout_member_data"),
        "timeout_tcp_inspect": listener.get("timeout_tcp_inspect"),
        "allowed_cidrs": listener.get("allowed_cidrs") or [],
        "insert_headers": listener.get("insert_headers") or {},
        "default_tls_container_ref": listener.get("default_tls_container_ref"),
        "sni_container_refs": listener.get("sni_container_refs") or [],
        "tls_ciphers": listener.get("tls_ciphers"),
        "l7policies": [i.get("id") for i in listener.get("l7policies") or []],
        "created_at": listener.get("created_at"),
        "updated_at": listener.get("updated_at"),
    }


def pool_summary(pool: dict) -> dict:
    return {
        "id": pool.get("id"),
        "name": pool.get("name"),
        "description": pool.get("description"),
        "protocol": pool.get("protocol"),
        "lb_algorithm": pool.get("lb_algorithm"),
        "provisioning_status": pool.get("provisioning_status"),
        "operating_status": pool.get("operating_status"),
        "admin_state_up": pool.get("admin_state_up"),
        "session_persistence": pool.get("session_persistence"),
        "tls_enabled": pool.get("tls_enabled"),
        "tls_ciphers": pool.get("tls_ciphers"),
        "healthmonitor_id": pool.get("healthmonitor_id"),
        "listeners": [i.get("id") for i in pool.get("listeners") or []],
        "loadbalancer_id": next(
            (i.get("id") for i in pool.get("loadbalancers") or []), None
        ),
        "members": [i.get("id") for i in pool.get("members") or []],
        "created_at": pool.get("created_at"),
        "updated_at": pool.get("updated_at"),
    }


def member_summary(member: dict) -> dict:
    return {
        "id": member.get("id"),
        "name": member.get("name"),
        "address": member.get("address"),
        "protocol_port": member.get("protocol_port"),
        "subnet_id": member.get("subnet_id"),
        "weight": member.get("weight"),
        "backup": member.get("backup"),
        "monitor_address": member.get("monitor_address"),
        "monitor_port": member.get("monitor_port"),
        "provisioning_status": member.get("provisioning_status"),
        "operating_status": member.get("operating_status"),
        "admin_state_up": member.get("admin_state_up"),
        "created_at": member.get("created_at"),
        "updated_at": member.get("updated_at"),
    }


def monitor_summary(monitor: dict) -> dict:
    return {
        "id": monitor.get("id"),
        "name": monitor.get("name"),
        "type": monitor.get("type"),
        "delay": monitor.get("delay"),
        "timeout": monitor.get("timeout"),
        "max_retries": monitor.get("max_retries"),
        "max_retries_down": monitor.get("max_retries_down"),
        "http_method": monitor.get("http_method"),
        "url_path": monitor.get("url_path"),
        "expected_codes": monitor.get("expected_codes"),
        "provisioning_status": monitor.get("provisioning_status"),
        "operating_status": monitor.get("operating_status"),
        "admin_state_up": monitor.get("admin_state_up"),
        "pools": [i.get("id") for i in monitor.get("pools") or []],
        "created_at": monitor.get("created_at"),
        "updated_at": monitor.get("updated_at"),
    }


def policy_summary(policy: dict) -> dict:
    return {
        "id": policy.get("id"),
        "name": policy.get("name"),
        "description": policy.get("description"),
        "action": policy.get("action"),
        "position": policy.get("position"),
        "redirect_url": policy.get("redirect_url"),
        "redirect_pool_id": policy.get("redirect_pool_id"),
        "redirect_prefix": policy.get("redirect_prefix"),
        "listener_id": policy.get("listener_id"),
        "provisioning_status": policy.get("provisioning_status"),
        "operating_status": policy.get("operating_status"),
        "admin_state_up": policy.get("admin_state_up"),
        "rules": [i.get("id") for i in policy.get("rules") or []],
        "created_at": policy.get("created_at"),
        "updated_at": policy.get("updated_at"),
    }


def rule_summary(rule: dict) -> dict:
    return {
        "id": rule.get("id"),
        "type": rule.get("type"),
        "compare_type": rule.get("compare_type"),
        "key": rule.get("key"),
        "value": rule.get("value"),
        "invert": rule.get("invert"),
        "provisioning_status": rule.get("provisioning_status"),
        "operating_status": rule.get("operating_status"),
        "admin_state_up": rule.get("admin_state_up"),
    }


# --- load balancers ------------------------------------------------------------


async def _floating_by_port(ctx: Context) -> dict[str, dict]:
    try:
        fips = await ctx.neutron.floatingips(project_id=ctx.project_id)
    except HiveError:
        return {}
    return {f["port_id"]: f for f in fips if f.get("port_id")}


async def list_load_balancers(ctx: Context) -> dict:
    octavia = _octavia(ctx)
    lbs, floating = await asyncio.gather(
        octavia.load_balancers(project_id=ctx.project_id),
        _floating_by_port(ctx),
    )
    items = [
        lb_summary(lb, floating.get(lb.get("vip_port_id") or "")) for lb in lbs
    ]
    items.sort(key=lambda lb: (lb["name"] or "").lower())
    return {"items": items}


async def get_load_balancer(ctx: Context, lb_id: str) -> dict:
    octavia = _octavia(ctx)
    lb, floating = await asyncio.gather(
        octavia.load_balancer(lb_id), _floating_by_port(ctx)
    )
    summary = lb_summary(lb, floating.get(lb.get("vip_port_id") or ""))
    summary["chain"] = await chain_state(ctx, lb_id)
    return summary


async def load_balancer_tree(ctx: Context, lb_id: str) -> dict:
    """The listeners, pools, members, monitors and L7 policies of one load
    balancer, in one call."""
    octavia = _octavia(ctx)
    lb, listeners, pools, monitors, policies, floating = await asyncio.gather(
        octavia.load_balancer(lb_id),
        octavia.listeners(load_balancer_id=lb_id),
        octavia.pools(project_id=ctx.project_id),
        octavia.health_monitors(project_id=ctx.project_id),
        octavia.l7_policies(project_id=ctx.project_id),
        _floating_by_port(ctx),
    )
    pools = rules.pools_of(pools, lb_id)
    pool_ids = {p.get("id") for p in pools}
    listener_ids = {listener.get("id") for listener in listeners}
    semaphore = asyncio.Semaphore(FAN_OUT)

    async def members_of(pool: dict) -> list[dict]:
        async with semaphore:
            try:
                return [
                    member_summary(m)
                    for m in await octavia.members(pool["id"])
                ]
            except HiveError:
                return []

    member_lists = await asyncio.gather(*(members_of(p) for p in pools))
    pool_rows = []
    for pool, members in zip(pools, member_lists, strict=True):
        row = pool_summary(pool)
        row["member_rows"] = members
        pool_rows.append(row)
    return {
        "load_balancer": lb_summary(
            lb, floating.get(lb.get("vip_port_id") or "")
        ),
        "chain": await chain_state(ctx, lb_id),
        "listeners": [listener_summary(listener) for listener in listeners],
        "pools": pool_rows,
        "monitors": [
            monitor_summary(m)
            for m in monitors
            if any(p.get("id") in pool_ids for p in m.get("pools") or [])
        ],
        "l7policies": [
            policy_summary(p)
            for p in policies
            if p.get("listener_id") in listener_ids
        ],
    }


async def _wait_active(octavia: OctaviaClient, lb_id: str) -> dict:
    """Poll until the load balancer is ACTIVE. Only background chains call
    this; requests use ``_require_active`` instead."""
    for _ in range(POLL_LIMIT):
        lb = await octavia.load_balancer(lb_id)
        status = lb.get("provisioning_status")
        if status == "ACTIVE":
            return lb
        if status in ("ERROR", "DELETED") or status is None:
            raise Conflict(f"the load balancer is {status}")
        await asyncio.sleep(POLL_SECONDS)
    raise Conflict("the load balancer did not become active in time")


async def _require_active(octavia: OctaviaClient, lb_id: str) -> dict:
    """Refuse a change while the load balancer is busy rather than holding
    the request open until it settles (``hive.nectar.loadbalancer``)."""
    lb = await octavia.load_balancer(lb_id)
    status = lb.get("provisioning_status")
    if status != "ACTIVE":
        raise Conflict(
            f"The load balancer is {status}; try again once it is ACTIVE.",
            code="load_balancer_busy",
            extra={"provisioning_status": status},
        )
    return lb


# --- background chains ----------------------------------------------------------
#
# A chain creates sub-resources one after another, waiting for the load
# balancer to be ACTIVE before each step and recording progress under the
# load balancer's chain key for the detail page. ``ids`` carries what
# earlier steps (or the caller) produced: listener_id, listener_protocol,
# pool_id.


async def _step_listener(octavia, lb_id: str, spec: dict, ids: dict):
    created = await octavia.create_listener(rules.listener_fields(spec, lb_id))
    ids["listener_id"] = created.get("id")
    ids["listener_protocol"] = spec.get("protocol")


async def _step_pool(octavia, lb_id: str, spec: dict, ids: dict):
    created = await octavia.create_pool(
        rules.pool_fields(
            spec,
            listener_id=ids.get("listener_id"),
            lb_id=lb_id,
            listener_protocol=ids.get("listener_protocol"),
        )
    )
    ids["pool_id"] = created.get("id")


def _pool_id(ids: dict) -> str:
    pool_id = ids.get("pool_id")
    if not pool_id:
        raise Conflict("the pool for this step was not created")
    return pool_id


async def _step_member(octavia, lb_id: str, spec: dict, ids: dict):
    await octavia.create_member(_pool_id(ids), rules.member_fields(spec))


async def _step_delete_member(octavia, lb_id: str, spec: dict, ids: dict):
    try:
        await octavia.delete_member(_pool_id(ids), spec["id"])
    except NotFound:
        pass


async def _step_monitor(octavia, lb_id: str, spec: dict, ids: dict):
    await octavia.create_health_monitor(
        rules.monitor_fields(spec, _pool_id(ids))
    )


STEPS = {
    "listener": _step_listener,
    "pool": _step_pool,
    "member": _step_member,
    "delete_member": _step_delete_member,
    "monitor": _step_monitor,
}


async def _record(ctx: Context, lb_id: str, state: dict) -> None:
    """Best effort: a failure to record must not hide the chain's own
    error."""
    try:
        await _set_chain(ctx, lb_id, state)
    except Exception:  # noqa: BLE001 - logged, the chain state is advisory
        log.exception("load balancer chain state not saved", lb_id=lb_id)


async def _run_chain(
    ctx: Context,
    lb_id: str,
    steps: list[tuple[str, dict]],
    ids: dict | None = None,
) -> None:
    """Run ``steps`` (names from ``STEPS``) in order. Any failure, or a
    cancellation at shutdown, ends the chain with ``error`` set rather
    than leaving it "in progress" until the key expires."""
    octavia = _octavia(ctx)
    ids = dict(ids or {})
    state = {
        "steps": [s[0] for s in steps],
        "done": [],
        "error": None,
        "started": time.time(),
    }
    try:
        await _set_chain(ctx, lb_id, state)
        for name, spec in steps:
            await _wait_active(octavia, lb_id)
            await STEPS[name](octavia, lb_id, spec, ids)
            state["done"].append(name)
            await _set_chain(ctx, lb_id, state)
    except asyncio.CancelledError:
        state["error"] = "interrupted: the dashboard restarted mid-way"
        await _record(ctx, lb_id, state)
        raise
    except HiveError as exc:
        state["error"] = f"{exc.code}: {exc.message}"
        await _record(ctx, lb_id, state)
        log.warning(
            "load balancer chain failed",
            lb_id=lb_id,
            step=len(state["done"]),
            code=exc.code,
        )
    except Exception:  # noqa: BLE001 - background task must not die silently
        state["error"] = "internal error"
        await _record(ctx, lb_id, state)
        log.exception("load balancer chain crashed", lb_id=lb_id)


# Running chains. ``drain`` is for the application lifespan to await on
# shutdown so a restart records an interrupted chain instead of leaving it
# "in progress".
_background: set[asyncio.Task] = set()


def _spawn(coro) -> None:
    task = asyncio.create_task(coro)
    _background.add(task)
    task.add_done_callback(_background.discard)


async def drain(timeout: float = 10.0) -> None:
    """Wait up to ``timeout`` seconds for running chains, then cancel the
    rest; each cancelled chain records that it was interrupted."""
    tasks = set(_background)
    if not tasks:
        return
    _done, pending = await asyncio.wait(tasks, timeout=timeout)
    for task in pending:
        task.cancel()
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)


def _child_steps(
    pool: PoolSpec | None,
    members: list[MemberSpec],
    monitor: MonitorSpec | None,
) -> list[tuple[str, dict]]:
    """Members and monitor behind a pool, the monitor checked first."""
    steps: list[tuple[str, dict]] = []
    if pool:
        steps.append(("pool", pool.model_dump()))
    for member in members:
        steps.append(("member", member.model_dump()))
    if monitor:
        problem = rules.validate_monitor(monitor.model_dump())
        if problem:
            raise BadRequest(problem)
        steps.append(("monitor", monitor.model_dump()))
    return steps


def _steps(
    listener: ListenerSpec | None,
    pool: PoolSpec | None,
    members: list[MemberSpec],
    monitor: MonitorSpec | None,
) -> list[tuple[str, dict]]:
    steps: list[tuple[str, dict]] = []
    if listener:
        steps.append(("listener", listener.model_dump()))
    if pool:
        if not listener and not pool.protocol:
            raise BadRequest("A pool without a listener needs a protocol.")
        steps.extend(_child_steps(pool, members, monitor))
    elif members or monitor:
        raise BadRequest("Members and a health monitor need a pool.")
    return steps


async def create_load_balancer(ctx: Context, data: LoadBalancerCreate) -> dict:
    if data.vip_address and not rules.valid_ip(data.vip_address):
        raise BadRequest("The IP address is not valid.")
    if data.listener:
        problem = rules.valid_cidrs(data.listener.allowed_cidrs)
        if problem:
            raise BadRequest(problem)
    steps = _steps(data.listener, data.pool, data.members, data.monitor)
    fields: dict = {
        "vip_subnet_id": data.vip_subnet_id,
        "admin_state_up": data.admin_state_up,
        "project_id": ctx.project_id,
    }
    for key in (
        "name",
        "description",
        "vip_address",
        "flavor_id",
        "availability_zone",
    ):
        value = getattr(data, key)
        if value:
            fields[key] = value
    lb = await _octavia(ctx).create_load_balancer(fields)
    if steps and lb.get("id"):
        _spawn(_run_chain(ctx, lb["id"], steps))
    return lb_summary(lb)


async def update_load_balancer(ctx: Context, lb_id: str, fields: dict) -> dict:
    clean = _changes(fields)
    lb = await _octavia(ctx).update_load_balancer(lb_id, clean)
    return lb_summary(lb)


async def delete_load_balancer(ctx: Context, lb_id: str) -> None:
    octavia = _octavia(ctx)
    lb = await octavia.load_balancer(lb_id)
    if not rules.can_delete(lb):
        raise Conflict(
            f"Unable to delete the load balancer while it is {lb.get('provisioning_status')}."
        )
    await octavia.delete_load_balancer(lb_id, cascade=True)


async def failover_load_balancer(ctx: Context, lb_id: str) -> None:
    await _octavia(ctx).failover_load_balancer(lb_id)


async def options(ctx: Context) -> dict:
    """Pickers for the wizard: VIP and member subnets (the project's
    bootable networks), flavours, zones, member candidates and quota."""
    octavia = _octavia(ctx)
    networks, flavors, zones, quota, servers, ports = await asyncio.gather(
        network_service.networks_for_purpose(ctx, "boot"),
        octavia.flavors(),
        octavia.availability_zones(),
        octavia.quota(ctx.project_id),
        ctx.nova.servers_brief(limit=1000),
        ctx.neutron.ports(project_id=ctx.project_id),
    )
    subnets = []
    for network in networks:
        for subnet in network.get("subnets") or []:
            if isinstance(subnet, dict) and subnet.get("id"):
                subnets.append(
                    {
                        "id": subnet["id"],
                        "name": subnet.get("name"),
                        "cidr": subnet.get("cidr"),
                        "network_id": network.get("id"),
                        "network_name": network.get("name"),
                        "ip_version": subnet.get("ip_version"),
                    }
                )
    subnet_ids = {s["id"] for s in subnets}
    # octavia-dashboard hides TERMINATED_HTTPS when Barbican is not
    # deployed (listener.html:57); the service catalog says whether it is.
    barbican = any(
        service.get("type") == "key-manager" for service in ctx.scoped.catalog
    )
    return {
        "subnets": subnets,
        "flavors": [
            {
                "id": f.get("id"),
                "name": f.get("name"),
                "description": f.get("description"),
            }
            for f in flavors
            if f.get("enabled", True)
        ],
        "availability_zones": [
            {"name": z.get("name"), "description": z.get("description")}
            for z in zones
            if z.get("enabled", True)
        ],
        "quota": quota,
        "instances": rules.member_candidates(servers, ports, subnet_ids),
        "listener_protocols": [
            protocol
            for protocol in rules.LISTENER_PROTOCOLS
            if barbican or protocol != "TERMINATED_HTTPS"
        ],
        "barbican_available": barbican,
        "pool_protocols": list(rules.POOL_PROTOCOLS),
        "algorithms": list(rules.ALGORITHMS),
        "persistence_types": list(rules.PERSISTENCE),
        "monitor_types": list(rules.MONITOR_TYPES),
        "http_methods": list(rules.HTTP_METHODS),
        "l7_actions": list(rules.L7_ACTIONS),
        "l7_rule_types": list(rules.L7_RULE_TYPES),
        "l7_compare_types": list(rules.L7_COMPARE),
    }


# --- floating IPs on the VIP ----------------------------------------------------


async def associate_floating_ip(
    ctx: Context, lb_id: str, floating_ip_id: str | None, pool_id: str | None
) -> dict:
    """Associate a floating IP with the VIP port, allocating one from
    ``pool_id`` first when no IP is named. A just-allocated IP is released
    again when the association fails, so a failure costs no quota; if the
    release fails too, its id is in the error's ``floating_ip_id``."""
    lb = await _octavia(ctx).load_balancer(lb_id)
    port = lb.get("vip_port_id")
    if not port:
        raise Conflict("The load balancer has no VIP port yet.")
    if floating_ip_id:
        return await network_service.associate_floating_ip(
            ctx, floating_ip_id, port, lb.get("vip_address")
        )
    if not pool_id:
        raise BadRequest("Choose a floating IP or a pool to allocate from.")
    allocated = await network_service.allocate_floating_ip(
        ctx, FloatingIpAllocate(floating_network_id=pool_id)
    )
    try:
        return await network_service.associate_floating_ip(
            ctx, allocated["id"], port, lb.get("vip_address")
        )
    except HiveError as exc:
        try:
            await ctx.neutron.delete_floatingip(allocated["id"])
        except HiveError:
            log.warning(
                "allocated floating IP not released",
                lb_id=lb_id,
                floating_ip_id=allocated["id"],
            )
            exc.extra = {**exc.extra, "floating_ip_id": allocated["id"]}
        raise


async def disassociate_floating_ip(ctx: Context, lb_id: str) -> dict:
    lb = await _octavia(ctx).load_balancer(lb_id)
    floating = await _floating_by_port(ctx)
    fip = floating.get(lb.get("vip_port_id") or "")
    if not fip:
        raise NotFound("The load balancer has no floating IP.")
    return await network_service.disassociate_floating_ip(ctx, fip["id"])


# --- listeners, pools, members, monitors, L7 -------------------------------------


def _changes(fields: dict, nullable: tuple[str, ...] = ()) -> dict:
    """The fields of a PATCH body (dumped with ``exclude_unset``) to send
    on: ``None`` means "not changed" except for ``nullable`` keys, where an
    explicit null clears the value upstream."""
    return {k: v for k, v in fields.items() if v is not None or k in nullable}


async def create_listener(
    ctx: Context,
    lb_id: str,
    spec: ListenerSpec,
    pool: PoolSpec | None,
    members: list[MemberSpec],
    monitor: MonitorSpec | None,
) -> dict:
    problem = rules.valid_cidrs(spec.allowed_cidrs)
    if problem:
        raise BadRequest(problem)
    steps = _child_steps(pool, members, monitor) if pool else []
    if not pool and (members or monitor):
        raise BadRequest("Members and a health monitor need a pool.")
    octavia = _octavia(ctx)
    await _require_active(octavia, lb_id)
    created = await octavia.create_listener(
        rules.listener_fields(spec.model_dump(), lb_id)
    )
    if steps and created.get("id"):
        _spawn(
            _run_chain(
                ctx,
                lb_id,
                steps,
                {
                    "listener_id": created["id"],
                    "listener_protocol": spec.protocol,
                },
            )
        )
    return listener_summary(created)


async def update_listener(
    ctx: Context, listener_id: str, fields: dict
) -> dict:
    """``default_pool_id: null`` detaches the default pool."""
    clean = _changes(fields, ("default_pool_id",))
    if "allowed_cidrs" in clean:
        problem = rules.valid_cidrs(clean["allowed_cidrs"])
        if problem:
            raise BadRequest(problem)
    if "insert_headers" in clean:
        clean["insert_headers"] = {
            k: "true" for k, v in clean["insert_headers"].items() if v
        }
    return listener_summary(
        await _octavia(ctx).update_listener(listener_id, clean)
    )


async def delete_listener(ctx: Context, listener_id: str) -> None:
    await _octavia(ctx).delete_listener(listener_id)


async def create_pool(
    ctx: Context,
    lb_id: str,
    listener_id: str | None,
    spec: PoolSpec,
    members: list[MemberSpec],
    monitor: MonitorSpec | None,
) -> dict:
    octavia = _octavia(ctx)
    if not listener_id and not spec.protocol:
        raise BadRequest("A pool without a listener needs a protocol.")
    steps = _child_steps(None, members, monitor)
    protocol = None
    if listener_id:
        protocol = (await octavia.listener(listener_id)).get("protocol")
    await _require_active(octavia, lb_id)
    created = await octavia.create_pool(
        rules.pool_fields(
            spec.model_dump(),
            listener_id=listener_id,
            lb_id=lb_id,
            listener_protocol=protocol,
        )
    )
    if steps and created.get("id"):
        _spawn(_run_chain(ctx, lb_id, steps, {"pool_id": created["id"]}))
    return pool_summary(created)


async def update_pool(ctx: Context, pool_id: str, fields: dict) -> dict:
    """``session_persistence: null`` (or one without a type) turns
    persistence off."""
    clean = _changes(fields, ("session_persistence",))
    if "session_persistence" in clean:
        persistence = clean["session_persistence"] or {}
        ptype = persistence.get("type")
        if ptype:
            entry = {"type": ptype}
            if ptype == "APP_COOKIE" and persistence.get("cookie_name"):
                entry["cookie_name"] = persistence["cookie_name"]
            clean["session_persistence"] = entry
        else:
            clean["session_persistence"] = None
    return pool_summary(await _octavia(ctx).update_pool(pool_id, clean))


async def delete_pool(ctx: Context, pool_id: str) -> None:
    await _octavia(ctx).delete_pool(pool_id)


async def replace_members(
    ctx: Context, lb_id: str, pool_id: str, members: list[MemberSpec]
) -> dict:
    """Delete members that are gone and add the new ones, one at a time
    with the load balancer ACTIVE in between (``lbaasv2.py:661-696``).
    The load balancer must be ACTIVE now; the changes run as a background
    chain the detail page follows. ``items`` are the members before the
    change and ``pending`` counts the queued changes."""
    octavia = _octavia(ctx)
    await _require_active(octavia, lb_id)
    existing = await octavia.members(pool_id)
    wanted = {(m.address, m.protocol_port) for m in members}
    present = {(m.get("address"), m.get("protocol_port")) for m in existing}
    steps: list[tuple[str, dict]] = [
        ("delete_member", {"id": member["id"]})
        for member in existing
        if (member.get("address"), member.get("protocol_port")) not in wanted
    ]
    steps.extend(
        ("member", member.model_dump())
        for member in members
        if (member.address, member.protocol_port) not in present
    )
    if steps:
        _spawn(_run_chain(ctx, lb_id, steps, {"pool_id": pool_id}))
    return {
        "items": [member_summary(m) for m in existing],
        "pending": len(steps),
    }


async def add_member(
    ctx: Context, lb_id: str, pool_id: str, member: MemberSpec
) -> dict:
    octavia = _octavia(ctx)
    await _require_active(octavia, lb_id)
    return member_summary(
        await octavia.create_member(
            pool_id, rules.member_fields(member.model_dump())
        )
    )


async def update_member(
    ctx: Context, pool_id: str, member_id: str, fields: dict
) -> dict:
    """``monitor_address`` and ``monitor_port`` set to null (or an empty
    address) go back to monitoring the member's own address and port."""
    if fields.get("monitor_address") == "":
        fields = {**fields, "monitor_address": None}
    clean = _changes(fields, ("monitor_address", "monitor_port"))
    return member_summary(
        await _octavia(ctx).update_member(pool_id, member_id, clean)
    )


async def delete_member(ctx: Context, pool_id: str, member_id: str) -> None:
    await _octavia(ctx).delete_member(pool_id, member_id)


async def create_monitor(
    ctx: Context, pool_id: str, spec: MonitorSpec
) -> dict:
    problem = rules.validate_monitor(spec.model_dump())
    if problem:
        raise BadRequest(problem)
    created = await _octavia(ctx).create_health_monitor(
        rules.monitor_fields(spec.model_dump(), pool_id)
    )
    return monitor_summary(created)


async def update_monitor(ctx: Context, monitor_id: str, fields: dict) -> dict:
    octavia = _octavia(ctx)
    current = await octavia.health_monitor(monitor_id)
    clean = _changes(fields)
    if current.get("type") not in ("HTTP", "HTTPS"):
        for key in ("http_method", "url_path", "expected_codes"):
            clean.pop(key, None)
    merged = {**current, **clean, "type": current.get("type")}
    problem = rules.validate_monitor(merged)
    if problem:
        raise BadRequest(problem)
    return monitor_summary(
        await octavia.update_health_monitor(monitor_id, clean)
    )


async def delete_monitor(ctx: Context, monitor_id: str) -> None:
    await _octavia(ctx).delete_health_monitor(monitor_id)


async def create_l7_policy(
    ctx: Context, listener_id: str, spec: L7PolicySpec
) -> dict:
    data = spec.model_dump()
    if data["action"] == "REDIRECT_TO_URL" and not data.get("redirect_url"):
        raise BadRequest("A redirect URL is required.")
    if data["action"] == "REDIRECT_TO_POOL" and not data.get(
        "redirect_pool_id"
    ):
        raise BadRequest("A pool to redirect to is required.")
    if data["action"] == "REDIRECT_PREFIX" and not data.get("redirect_prefix"):
        raise BadRequest("A redirect prefix is required.")
    created = await _octavia(ctx).create_l7_policy(
        rules.l7_policy_fields(data, listener_id)
    )
    return policy_summary(created)


async def update_l7_policy(ctx: Context, policy_id: str, fields: dict) -> dict:
    clean = _changes(fields)
    return policy_summary(
        await _octavia(ctx).update_l7_policy(policy_id, clean)
    )


async def delete_l7_policy(ctx: Context, policy_id: str) -> None:
    await _octavia(ctx).delete_l7_policy(policy_id)


async def get_l7_policy(ctx: Context, policy_id: str) -> dict:
    octavia = _octavia(ctx)
    policy, l7rules = await asyncio.gather(
        octavia.l7_policy(policy_id), octavia.l7_rules(policy_id)
    )
    summary = policy_summary(policy)
    summary["rule_rows"] = [rule_summary(r) for r in l7rules]
    return summary


async def create_l7_rule(
    ctx: Context, policy_id: str, spec: L7RuleSpec
) -> dict:
    data = spec.model_dump()
    if data["type"] in ("HEADER", "COOKIE") and not data.get("key"):
        raise BadRequest("Header and cookie rules need a key.")
    if data["type"] == "FILE_TYPE" and data["compare_type"] not in (
        "REGEX",
        "EQUAL_TO",
    ):
        raise BadRequest(
            "File type rules compare with REGEX or EQUAL_TO only."
        )
    return rule_summary(
        await _octavia(ctx).create_l7_rule(
            policy_id, rules.l7_rule_fields(data)
        )
    )


async def update_l7_rule(
    ctx: Context, policy_id: str, rule_id: str, fields: dict
) -> dict:
    clean = _changes(fields)
    return rule_summary(
        await _octavia(ctx).update_l7_rule(policy_id, rule_id, clean)
    )


async def delete_l7_rule(ctx: Context, policy_id: str, rule_id: str) -> None:
    await _octavia(ctx).delete_l7_rule(policy_id, rule_id)
