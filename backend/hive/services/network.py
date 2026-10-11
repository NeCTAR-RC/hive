"""The Network dashboard shaped for the SPA, with the Nectar classification
applied: networks, subnets and ports, routers, floating IPs and their
port forwardings, trunks, and the topology payload."""

import asyncio

from hive.errors import BadRequest, HiveError, NotFound, QuotaExceeded
from hive.nectar.networks import (
    PURPOSE_BOOT,
    PURPOSE_ROUTER,
    ROUTER_GATEWAY_OWNER,
    ROUTER_HA_OWNER,
    ROUTER_INTERFACE_OWNERS,
    NetworkRules,
    port_forwarding_body,
    static_routes,
    subnet_body,
)
from hive.nectar import secgroups as secgroup_rules
from hive.schemas.network import (
    AddInterface,
    FloatingIpAllocate,
    NetworkCreate,
    PortCreate,
    PortForwardingCreate,
    PortForwardingUpdate,
    PortUpdate,
    RouterCreate,
    SubnetCreate,
    SubnetUpdate,
    TrunkCreate,
)
from hive.services.context import Context

NETWORKS_TTL = 300
NETWORKS_STALE = 3600
EXTENSIONS_TTL = 3600
EXTENSIONS_STALE = 6 * 3600
LIST_LIMIT = 1000
FAN_OUT = 8

PORT_FORWARDING_EXTENSION = "floating-ip-port-forwarding"
TRUNK_EXTENSION = "trunk"

# Neutron quota resources the dashboard shows, in Horizon's order.
QUOTA_RESOURCES = (
    "network",
    "subnet",
    "port",
    "router",
    "floatingip",
    "security_group",
    "security_group_rule",
    "trunk",
)


def _subnet_summary(subnet: dict) -> dict:
    return {
        "id": subnet.get("id"),
        "name": subnet.get("name"),
        "cidr": subnet.get("cidr"),
        "ip_version": subnet.get("ip_version"),
        "gateway_ip": subnet.get("gateway_ip"),
        "enable_dhcp": subnet.get("enable_dhcp"),
    }


def subnet_summary(subnet: dict) -> dict:
    """The full subnet, for the subnet pages and edit form."""
    return {
        **_subnet_summary(subnet),
        "network_id": subnet.get("network_id"),
        "project_id": subnet.get("project_id") or subnet.get("tenant_id"),
        "allocation_pools": [
            {"start": p.get("start"), "end": p.get("end")}
            for p in subnet.get("allocation_pools") or []
        ],
        "dns_nameservers": subnet.get("dns_nameservers") or [],
        "host_routes": [
            {"destination": r.get("destination"), "nexthop": r.get("nexthop")}
            for r in subnet.get("host_routes") or []
        ],
        "subnetpool_id": subnet.get("subnetpool_id"),
        "ipv6_address_mode": subnet.get("ipv6_address_mode"),
        "ipv6_ra_mode": subnet.get("ipv6_ra_mode"),
        "created_at": subnet.get("created_at"),
        "updated_at": subnet.get("updated_at"),
    }


def network_summary(ctx: Context, network: dict, subnets: list[dict]) -> dict:
    return {
        "id": network.get("id"),
        "name": network.get("name") or network.get("id"),
        "description": network.get("description") or "",
        "status": network.get("status"),
        "admin_state_up": network.get("admin_state_up"),
        "is_shared": bool(network.get("shared")),
        "is_external": bool(network.get("router:external")),
        "is_classic": ctx.network_rules.is_classic(network.get("id", "")),
        "is_project": network.get("project_id") == ctx.project_id,
        "project_id": network.get("project_id") or network.get("tenant_id"),
        "mtu": network.get("mtu"),
        "port_security_enabled": network.get("port_security_enabled"),
        "availability_zones": network.get("availability_zones") or [],
        "tags": network.get("tags") or [],
        "subnets": [_subnet_summary(s) for s in subnets],
        "created_at": network.get("created_at"),
        "updated_at": network.get("updated_at"),
    }


def port_summary(port: dict, network_name: str | None = None) -> dict:
    return {
        "id": port.get("id"),
        "name": port.get("name") or "",
        "description": port.get("description") or "",
        "network_id": port.get("network_id"),
        "network_name": network_name,
        "project_id": port.get("project_id") or port.get("tenant_id"),
        "status": port.get("status"),
        "admin_state_up": port.get("admin_state_up"),
        "mac_address": port.get("mac_address"),
        "device_id": port.get("device_id") or "",
        "device_owner": port.get("device_owner") or "",
        "device_type": NetworkRules.device_type(port.get("device_owner")),
        "fixed_ips": [
            {
                "ip_address": ip.get("ip_address"),
                "subnet_id": ip.get("subnet_id"),
            }
            for ip in port.get("fixed_ips") or []
        ],
        "security_groups": port.get("security_groups") or [],
        "port_security_enabled": port.get("port_security_enabled"),
        "vnic_type": port.get("binding:vnic_type"),
        "trunk_id": (port.get("trunk_details") or {}).get("trunk_id"),
        "created_at": port.get("created_at"),
        "updated_at": port.get("updated_at"),
    }


def router_summary(router: dict, network_names: dict[str, str]) -> dict:
    gateway = router.get("external_gateway_info") or None
    return {
        "id": router.get("id"),
        "name": router.get("name") or router.get("id"),
        "description": router.get("description") or "",
        "status": router.get("status"),
        "admin_state_up": router.get("admin_state_up"),
        "project_id": router.get("project_id") or router.get("tenant_id"),
        "external_gateway": (
            {
                "network_id": gateway.get("network_id"),
                "network_name": network_names.get(
                    gateway.get("network_id") or ""
                ),
                "enable_snat": gateway.get("enable_snat"),
                "fixed_ips": [
                    {
                        "ip_address": ip.get("ip_address"),
                        "subnet_id": ip.get("subnet_id"),
                    }
                    for ip in gateway.get("external_fixed_ips") or []
                ],
            }
            if gateway and gateway.get("network_id")
            else None
        ),
        "routes": [
            {"destination": r.get("destination"), "nexthop": r.get("nexthop")}
            for r in router.get("routes") or []
        ],
        "availability_zones": router.get("availability_zones") or [],
        "created_at": router.get("created_at"),
        "updated_at": router.get("updated_at"),
    }


def floating_ip_summary(
    fip: dict,
    port: dict | None,
    server_names: dict[str, str],
    network_names: dict[str, str],
) -> dict:
    device_id = port.get("device_id") if port else None
    device_type = (
        NetworkRules.device_type(port.get("device_owner")) if port else None
    )
    forwardings = fip.get("port_forwardings") or []
    return {
        "id": fip.get("id"),
        "floating_ip_address": fip.get("floating_ip_address"),
        "floating_network_id": fip.get("floating_network_id"),
        "pool_name": network_names.get(fip.get("floating_network_id") or ""),
        "fixed_ip_address": fip.get("fixed_ip_address"),
        "port_id": fip.get("port_id"),
        "router_id": fip.get("router_id"),
        "status": fip.get("status"),
        "description": fip.get("description") or "",
        "dns_name": fip.get("dns_name") or "",
        "dns_domain": fip.get("dns_domain") or "",
        "instance_id": device_id or None,
        "instance_name": server_names.get(device_id or ""),
        "instance_type": device_type,
        "port_forwarding_count": len(forwardings),
        "created_at": fip.get("created_at"),
        "updated_at": fip.get("updated_at"),
    }


def _port_range(rule: dict, key: str) -> str:
    value = rule.get(f"{key}_range") or rule.get(key)
    return "" if value is None else str(value)


def port_forwarding_summary(rule: dict, fip: dict | None = None) -> dict:
    fip = fip or {}
    return {
        "id": rule.get("id"),
        "floating_ip_id": fip.get("id") or rule.get("floating_ip_id"),
        "floating_ip_address": fip.get("floating_ip_address")
        or rule.get("floating_ip_address"),
        "protocol": (rule.get("protocol") or "").lower(),
        "external_port": _port_range(rule, "external_port"),
        "internal_port": _port_range(rule, "internal_port"),
        "internal_ip_address": rule.get("internal_ip_address"),
        "internal_port_id": rule.get("internal_port_id"),
        "description": rule.get("description") or "",
    }


def trunk_summary(
    trunk: dict, port_names: dict[str, str] | None = None
) -> dict:
    names = port_names or {}
    subports = trunk.get("sub_ports") or []
    return {
        "id": trunk.get("id"),
        "name": trunk.get("name") or "",
        "description": trunk.get("description") or "",
        "status": trunk.get("status"),
        "admin_state_up": trunk.get("admin_state_up"),
        "project_id": trunk.get("project_id") or trunk.get("tenant_id"),
        "port_id": trunk.get("port_id"),
        "port_name": names.get(trunk.get("port_id") or ""),
        "sub_ports": [
            {
                "port_id": s.get("port_id"),
                "port_name": names.get(s.get("port_id") or ""),
                "segmentation_type": s.get("segmentation_type"),
                "segmentation_id": s.get("segmentation_id"),
            }
            for s in subports
        ],
        "subport_count": len(subports),
        "created_at": trunk.get("created_at"),
        "updated_at": trunk.get("updated_at"),
    }


def _names(items: list[dict]) -> dict[str, str]:
    names: dict[str, str] = {}
    for item in items:
        if item.get("id"):
            names[str(item["id"])] = item.get("name") or str(item["id"])
    return names


# --- reference data -------------------------------------------------------


async def extensions(ctx: Context) -> set[str]:
    result = await ctx.cache.get_or_fetch(
        ctx.cache.global_key("neutron-extensions"),
        ctx.neutron.extensions,
        ttl=EXTENSIONS_TTL,
        stale_ttl=EXTENSIONS_STALE,
        name="neutron-extensions",
    )
    return {alias for alias in result.value if alias}


async def extension_flags(ctx: Context) -> dict[str, bool]:
    """Which optional neutron features the panels may offer."""
    present = await extensions(ctx)
    return {
        "port_forwarding": PORT_FORWARDING_EXTENSION in present,
        "trunk": TRUNK_EXTENSION in present,
        "dns_integration": "dns-integration" in present,
        "extraroute": "extraroute" in present,
        "network_availability_zone": "network_availability_zone" in present,
        "router_availability_zone": "router_availability_zone" in present,
        "subnet_allocation": "subnet_allocation" in present,
        "port_security": "port-security" in present,
    }


async def require_extension(ctx: Context, alias: str, what: str) -> None:
    if alias not in await extensions(ctx):
        raise NotFound(f"{what} is not available on this cloud")


async def floating_networks(ctx: Context) -> list[dict]:
    """External networks floating IPs and router gateways may use
    (``floating_network_list`` in the fork), cached for everyone."""
    rules = ctx.network_rules

    async def fetch():
        return await ctx.neutron.networks(**rules.floating_query_params())

    result = await ctx.cache.get_or_fetch(
        ctx.cache.global_key("networks", "floating"),
        fetch,
        ttl=NETWORKS_TTL,
        stale_ttl=NETWORKS_STALE,
        name="networks",
    )
    return result.value


async def _classic_and_shared(ctx: Context, purpose: str) -> list[dict]:
    """The classic placeholder and tagged shared networks, cached globally
    (the same for every user)."""
    rules = ctx.network_rules

    async def fetch():
        classic: list[dict] = []
        if rules.offers_classic(purpose):
            try:
                classic = [
                    await ctx.neutron.network(rules.classic_network_id or "")
                ]
            except Exception:
                classic = []
        shared: list[dict] = []
        params = rules.shared_query_params(purpose)
        if params is not None:
            shared = await ctx.neutron.networks(**params)
        return {"classic": classic, "shared": shared}

    result = await ctx.cache.get_or_fetch(
        ctx.cache.global_key("networks", purpose),
        fetch,
        ttl=NETWORKS_TTL,
        stale_ttl=NETWORKS_STALE,
        name="networks",
    )
    return [*result.value["classic"], *result.value["shared"]]


async def networks_for_purpose(
    ctx: Context, purpose: str, include_external: bool = False
) -> list[dict]:
    """Networks a user may pick for ``purpose``, classic first, with their
    subnets attached (``network_list_for_tenant`` in the fork). With
    ``include_external`` the floating networks follow, as the Networks
    panel lists them."""
    rules = ctx.network_rules
    tasks = [
        _classic_and_shared(ctx, purpose),
        ctx.neutron.networks(project_id=ctx.project_id, shared="false"),
        ctx.neutron.subnets(),
    ]
    if include_external:
        tasks.append(floating_networks(ctx))
    shared_nets, project_nets, subnets, *rest = await asyncio.gather(*tasks)
    external = [n for n in rest[0] if not n.get("shared")] if rest else []
    classic = [n for n in shared_nets if rules.is_classic(n["id"])]
    shared = [n for n in shared_nets if not rules.is_classic(n["id"])]
    ordered = rules.order(classic, shared, project_nets, external)
    by_network: dict[str, list[dict]] = {}
    for subnet in subnets:
        by_network.setdefault(subnet.get("network_id") or "", []).append(
            subnet
        )
    networks = [
        network_summary(ctx, n, by_network.get(n["id"], [])) for n in ordered
    ]
    if purpose == PURPOSE_BOOT:
        networks = rules.launch_candidates(networks)
    return networks


async def attachable_ports(ctx: Context) -> list[dict]:
    """Ports an instance may be attached to (no device, bootable network)."""
    networks, ports = await asyncio.gather(
        networks_for_purpose(ctx, PURPOSE_BOOT),
        ctx.neutron.ports(project_id=ctx.project_id),
    )
    names = {n["id"]: n["name"] for n in networks}
    usable = ctx.network_rules.attachable_ports(ports, set(names))
    return [
        {
            "id": p["id"],
            "name": p.get("name") or "",
            "network_id": p.get("network_id"),
            "network_name": names.get(p.get("network_id")),
            "mac_address": p.get("mac_address"),
            "fixed_ips": [
                ip.get("ip_address") for ip in p.get("fixed_ips") or []
            ],
            "status": p.get("status"),
        }
        for p in usable
    ]


async def quota(ctx: Context) -> dict:
    """Used and limit per neutron resource (``quotas/{id}/details``)."""
    details = await ctx.neutron.quota_details(ctx.project_id)
    result = {}
    for resource in QUOTA_RESOURCES:
        entry = details.get(resource)
        if not isinstance(entry, dict):
            continue
        result[resource] = {
            "used": entry.get("used") or 0,
            "reserved": entry.get("reserved") or 0,
            "limit": entry.get("limit", -1),
        }
    return result


def quota_left(quotas: dict, resource: str) -> bool:
    entry = quotas.get(resource)
    if not entry or entry["limit"] < 0:
        return True
    return entry["used"] + entry["reserved"] < entry["limit"]


async def availability_zones(ctx: Context, resource: str) -> list[str]:
    """Available zones for ``resource`` ('network' or 'router'). Filtered
    here: Nectar's neutron rejects the resource and state query filters."""
    zones = await ctx.neutron.availability_zones()
    return sorted(
        {
            z["name"]
            for z in zones
            if z.get("name")
            and z.get("resource") == resource
            and z.get("state", "available") == "available"
        }
    )


async def options(ctx: Context) -> dict:
    """What the network, subnet, port, router and floating IP forms need,
    gathered in parallel with per-section errors."""

    async def guarded(name, coro):
        try:
            return name, await coro, None
        except HiveError as exc:
            return name, None, {"error": exc.code, "message": exc.message}

    async def zones():
        flags = await extension_flags(ctx)
        network_zones, router_zones = await asyncio.gather(
            availability_zones(ctx, "network")
            if flags["network_availability_zone"]
            else asyncio.sleep(0, result=[]),
            availability_zones(ctx, "router")
            if flags["router_availability_zone"]
            else asyncio.sleep(0, result=[]),
        )
        return {"network": network_zones, "router": router_zones}

    async def pools():
        flags = await extension_flags(ctx)
        if not flags["subnet_allocation"]:
            return []
        return [
            {
                "id": p.get("id"),
                "name": p.get("name") or p.get("id"),
                "prefixes": p.get("prefixes") or [],
                "ip_version": p.get("ip_version"),
                "min_prefixlen": p.get("min_prefixlen"),
                "max_prefixlen": p.get("max_prefixlen"),
                "default_prefixlen": p.get("default_prefixlen"),
            }
            for p in await ctx.neutron.subnetpools()
        ]

    async def floating():
        return [
            {"id": n.get("id"), "name": n.get("name") or n.get("id")}
            for n in await floating_networks(ctx)
        ]

    results = await asyncio.gather(
        guarded("extensions", extension_flags(ctx)),
        guarded("availability_zones", zones()),
        guarded("subnetpools", pools()),
        guarded("floating_networks", floating()),
        guarded("quota", quota(ctx)),
    )
    settings = ctx.settings
    payload: dict = {
        "default_dns_nameservers": list(
            settings.subnet_default_dns_nameservers
        ),
        "enable_ipv6": settings.network_enable_ipv6,
        "errors": {},
    }
    for name, value, error in results:
        if error:
            payload["errors"][name] = error
        payload[name] = value
    return payload


# --- networks, subnets and ports ------------------------------------------


async def get_network(ctx: Context, network_id: str) -> dict:
    network, subnets, ports = await asyncio.gather(
        ctx.neutron.network(network_id),
        ctx.neutron.subnets(network_id=network_id),
        ctx.neutron.ports(network_id=network_id, project_id=ctx.project_id),
    )
    summary = network_summary(ctx, network, subnets)
    summary["subnets"] = [subnet_summary(s) for s in subnets]
    summary["ports"] = [port_summary(p, summary["name"]) for p in ports]
    return summary


async def create_network(ctx: Context, body: NetworkCreate) -> dict:
    """Create the network and, when asked, its first subnet; a failed
    subnet takes the new network with it (``CreateNetwork.handle``)."""
    fields: dict = {
        "name": body.name or "",
        "admin_state_up": body.admin_state_up,
    }
    if body.mtu:
        fields["mtu"] = body.mtu
    if body.availability_zone_hints:
        fields["availability_zone_hints"] = body.availability_zone_hints
    subnet_fields = None
    if body.subnet is not None:
        subnet_fields = subnet_body(
            body.subnet.model_dump(),
            ctx.settings.subnet_default_dns_nameservers,
            ctx.settings.network_enable_ipv6,
        )
    network = await ctx.neutron.create_network(fields)
    subnets: list[dict] = []
    if subnet_fields is not None:
        try:
            subnets = [
                await ctx.neutron.create_subnet(
                    {**subnet_fields, "network_id": network["id"]}
                )
            ]
        except HiveError:
            try:
                await ctx.neutron.delete_network(network["id"])
            except HiveError:
                pass
            raise
    return network_summary(ctx, network, subnets)


async def update_network(ctx: Context, network_id: str, fields: dict) -> dict:
    network = await ctx.neutron.update_network(network_id, fields)
    subnets = await ctx.neutron.subnets(network_id=network_id)
    return network_summary(ctx, network, subnets)


async def create_subnet(ctx: Context, body: SubnetCreate) -> dict:
    fields = subnet_body(
        body.model_dump(exclude={"network_id"}),
        ctx.settings.subnet_default_dns_nameservers,
        ctx.settings.network_enable_ipv6,
    )
    fields["network_id"] = body.network_id
    return subnet_summary(await ctx.neutron.create_subnet(fields))


async def update_subnet(
    ctx: Context, subnet_id: str, body: SubnetUpdate
) -> dict:
    fields = subnet_body(
        body.model_dump(),
        ctx.settings.subnet_default_dns_nameservers,
        ctx.settings.network_enable_ipv6,
        is_create=False,
    )
    if not fields:
        raise BadRequest("nothing to update")
    return subnet_summary(await ctx.neutron.update_subnet(subnet_id, fields))


async def get_port(ctx: Context, port_id: str) -> dict:
    port = await ctx.neutron.port(port_id)
    network_name = None
    try:
        network = await ctx.neutron.network(port.get("network_id") or "")
        network_name = network.get("name") or network.get("id")
    except HiveError:
        pass
    return port_summary(port, network_name)


async def create_port(ctx: Context, body: PortCreate) -> dict:
    """``CreatePort._construct_parameters`` without the VNIC and MAC
    learning fields Nectar does not offer."""
    fields: dict = {
        "network_id": body.network_id,
        "name": body.name or "",
        "admin_state_up": body.admin_state_up,
    }
    if body.device_id:
        fields["device_id"] = body.device_id
    if body.device_owner:
        fields["device_owner"] = body.device_owner
    if body.subnet_id:
        fields["fixed_ips"] = [{"subnet_id": body.subnet_id}]
    elif body.fixed_ip:
        fields["fixed_ips"] = [{"ip_address": body.fixed_ip}]
    if body.mac_address:
        fields["mac_address"] = body.mac_address
    if body.port_security_enabled is not None:
        fields["port_security_enabled"] = body.port_security_enabled
    if body.port_security_enabled is False:
        fields["security_groups"] = []
    elif body.security_groups is not None:
        fields["security_groups"] = body.security_groups
    return port_summary(await ctx.neutron.create_port(fields))


async def update_port(ctx: Context, port_id: str, body: PortUpdate) -> dict:
    fields = body.model_dump(exclude_none=True)
    if fields.get("port_security_enabled") is False:
        fields["security_groups"] = []
    if "port_security_enabled" in fields:
        # Neutron refuses an unchanged flag from a non-admin on some
        # ports; only send it when it changes (fork commit 1deb365c4).
        current = await ctx.neutron.port(port_id)
        if (
            current.get("port_security_enabled")
            == fields["port_security_enabled"]
        ):
            del fields["port_security_enabled"]
    if not fields:
        raise BadRequest("nothing to update")
    return port_summary(await ctx.neutron.update_port(port_id, fields))


# --- routers ---------------------------------------------------------------


async def list_routers(ctx: Context) -> list[dict]:
    routers, floating = await asyncio.gather(
        ctx.neutron.routers(project_id=ctx.project_id),
        floating_networks(ctx),
    )
    names = _names(floating)
    return [router_summary(r, names) for r in routers]


async def get_router(ctx: Context, router_id: str) -> dict:
    router, ports, floating = await asyncio.gather(
        ctx.neutron.router(router_id),
        ctx.neutron.ports(device_id=router_id),
        floating_networks(ctx),
    )
    names = _names(floating)
    summary = router_summary(router, names)
    network_ids = {p.get("network_id") for p in ports}
    network_names: dict[str, str] = dict(names)
    if network_ids - set(network_names):
        own = await ctx.neutron.networks(project_id=ctx.project_id)
        network_names.update(_names(own))
    summary["interfaces"] = [
        {
            **port_summary(p, network_names.get(p.get("network_id") or "")),
            "kind": (
                "gateway"
                if p.get("device_owner") == ROUTER_GATEWAY_OWNER
                else "interface"
                if p.get("device_owner") in ROUTER_INTERFACE_OWNERS
                else "ha"
                if p.get("device_owner") == ROUTER_HA_OWNER
                else "other"
            ),
        }
        for p in ports
    ]
    return summary


async def _check_floating_network(ctx: Context, network_id: str) -> None:
    ids = {n.get("id") for n in await floating_networks(ctx)}
    if network_id not in ids:
        raise BadRequest("the network is not available as a gateway")


async def create_router(ctx: Context, body: RouterCreate) -> dict:
    """``routers/forms.py:CreateForm.handle``: no DVR, HA or SNAT fields
    (the deployed settings and policy hide them)."""
    fields: dict = {
        "name": body.name or "",
        "admin_state_up": body.admin_state_up,
    }
    if body.external_network_id:
        await _check_floating_network(ctx, body.external_network_id)
        fields["external_gateway_info"] = {
            "network_id": body.external_network_id
        }
    if body.availability_zone_hints:
        fields["availability_zone_hints"] = body.availability_zone_hints
    router = await ctx.neutron.create_router(fields)
    return router_summary(router, _names(await floating_networks(ctx)))


async def update_router(ctx: Context, router_id: str, fields: dict) -> dict:
    router = await ctx.neutron.update_router(router_id, fields)
    return router_summary(router, _names(await floating_networks(ctx)))


async def delete_router(ctx: Context, router_id: str) -> None:
    """Detach every interface first, as Horizon's DeleteRouter does."""
    ports = await ctx.neutron.ports(
        device_id=router_id, device_owner="network:router_interface"
    )
    for port in ports:
        await ctx.neutron.router_remove_interface(
            router_id, {"port_id": port["id"]}
        )
    await ctx.neutron.delete_router(router_id)


async def set_gateway(ctx: Context, router_id: str, network_id: str) -> dict:
    await _check_floating_network(ctx, network_id)
    return await update_router(
        ctx, router_id, {"external_gateway_info": {"network_id": network_id}}
    )


async def clear_gateway(ctx: Context, router_id: str) -> dict:
    return await update_router(ctx, router_id, {"external_gateway_info": {}})


async def add_interface(
    ctx: Context, router_id: str, body: AddInterface
) -> dict:
    """``routers/ports/forms.py:AddInterface``: by subnet, or by a port
    created with the requested address (deleted again if the attach
    fails). The subnet must belong to one of the project's own networks."""
    networks, ports = await asyncio.gather(
        networks_for_purpose(ctx, PURPOSE_ROUTER),
        ctx.neutron.ports(device_id=router_id),
    )
    used = {
        ip.get("subnet_id") for p in ports for ip in p.get("fixed_ips") or []
    }
    candidates = ctx.network_rules.router_interface_subnets(networks, used)
    subnet = next((s for s in candidates if s["id"] == body.subnet_id), None)
    if subnet is None:
        raise BadRequest(
            "choose a subnet of one of your networks that has a gateway "
            "and is not already attached"
        )
    if body.ip_address:
        port = await ctx.neutron.create_port(
            {
                "network_id": subnet["network_id"],
                "fixed_ips": [
                    {"subnet_id": subnet["id"], "ip_address": body.ip_address}
                ],
            }
        )
        try:
            result = await ctx.neutron.router_add_interface(
                router_id, {"port_id": port["id"]}
            )
        except HiveError:
            try:
                await ctx.neutron.delete_port(port["id"])
            except HiveError:
                pass
            raise
        address = body.ip_address
    else:
        result = await ctx.neutron.router_add_interface(
            router_id, {"subnet_id": subnet["id"]}
        )
        address = None
        try:
            port = await ctx.neutron.port(result.get("port_id") or "")
            fixed = port.get("fixed_ips") or []
            address = fixed[0].get("ip_address") if fixed else None
        except HiveError:
            pass
    return {
        "status": "accepted",
        "port_id": result.get("port_id"),
        "subnet_id": subnet["id"],
        "ip_address": address,
    }


async def interface_candidates(ctx: Context, router_id: str) -> list[dict]:
    networks, ports = await asyncio.gather(
        networks_for_purpose(ctx, PURPOSE_ROUTER),
        ctx.neutron.ports(device_id=router_id),
    )
    used = {
        ip.get("subnet_id") for p in ports for ip in p.get("fixed_ips") or []
    }
    return ctx.network_rules.router_interface_subnets(networks, used)


async def remove_interface(ctx: Context, router_id: str, port_id: str) -> None:
    """A gateway port clears the gateway, any other port is detached
    (``routers/ports/tables.py:RemoveInterface``)."""
    port = await ctx.neutron.port(port_id)
    if port.get("device_owner") == ROUTER_GATEWAY_OWNER:
        await ctx.neutron.update_router(
            router_id, {"external_gateway_info": {}}
        )
        return
    await ctx.neutron.router_remove_interface(router_id, {"port_id": port_id})


async def set_routes(ctx: Context, router_id: str, routes: list[dict]) -> dict:
    return await update_router(
        ctx, router_id, {"routes": static_routes(routes)}
    )


# --- floating IPs ---------------------------------------------------------


async def _server_names(ctx: Context) -> dict[str, str]:
    try:
        return _names(await ctx.nova.servers_brief(limit=LIST_LIMIT))
    except HiveError:
        return {}


async def list_floating_ips(ctx: Context) -> list[dict]:
    """``FloatingIpManager.list``: the project's floating IPs with the
    instance behind each port and the pool's name."""
    fips, ports, floating, servers = await asyncio.gather(
        ctx.neutron.floatingips(project_id=ctx.project_id),
        ctx.neutron.ports(project_id=ctx.project_id),
        floating_networks(ctx),
        _server_names(ctx),
    )
    by_port = {p["id"]: p for p in ports}
    names = _names(floating)
    return [
        floating_ip_summary(
            f, by_port.get(f.get("port_id") or ""), servers, names
        )
        for f in fips
    ]


async def get_floating_ip(ctx: Context, fip_id: str) -> dict:
    fip, floating, servers = await asyncio.gather(
        ctx.neutron.floatingip(fip_id),
        floating_networks(ctx),
        _server_names(ctx),
    )
    port = None
    if fip.get("port_id"):
        try:
            port = await ctx.neutron.port(fip["port_id"])
        except HiveError:
            port = None
    return floating_ip_summary(fip, port, servers, _names(floating))


async def floating_ip_targets(
    ctx: Context, instance_id: str | None = None
) -> list[dict]:
    """``FloatingIpManager.list_targets``: port and address pairs behind a
    router with a floating gateway (or on a shared bootable network)."""
    rules = ctx.network_rules
    ports, routers, floating, servers, boot_networks = await asyncio.gather(
        ctx.neutron.ports(project_id=ctx.project_id),
        ctx.neutron.routers(project_id=ctx.project_id),
        floating_networks(ctx),
        _server_names(ctx),
        networks_for_purpose(ctx, PURPOSE_BOOT),
    )
    shared_subnets = {
        s["id"] for n in boot_networks if n["is_shared"] for s in n["subnets"]
    }
    reachable = rules.reachable_subnets(
        ports,
        routers,
        {n.get("id") for n in floating},
        shared_subnets,
        ctx.settings.network_fip_topology_check,
    )
    return rules.floating_targets(ports, servers, reachable, instance_id)


async def allocate_floating_ip(ctx: Context, body: FloatingIpAllocate) -> dict:
    """``FloatingIpAllocate.handle``: refuse at the quota, then allocate
    from a floating network."""
    quotas = {}
    try:
        quotas = await quota(ctx)
    except HiveError:
        pass
    if not quota_left(quotas, "floatingip"):
        raise QuotaExceeded(
            "you are already using all of your available floating IPs"
        )
    await _check_floating_network(ctx, body.floating_network_id)
    fields: dict = {"floating_network_id": body.floating_network_id}
    for key in (
        "floating_ip_address",
        "description",
        "dns_domain",
        "dns_name",
    ):
        value = getattr(body, key)
        if value:
            fields[key] = value
    fip = await ctx.neutron.create_floatingip(fields)
    return floating_ip_summary(
        fip, None, {}, _names(await floating_networks(ctx))
    )


async def associate_floating_ip(
    ctx: Context, fip_id: str, port_id: str, fixed_ip: str | None
) -> dict:
    fields: dict = {"port_id": port_id}
    if fixed_ip:
        fields["fixed_ip_address"] = fixed_ip
    fip = await ctx.neutron.update_floatingip(fip_id, fields)
    return floating_ip_summary(
        fip, None, {}, _names(await floating_networks(ctx))
    )


async def disassociate_floating_ip(ctx: Context, fip_id: str) -> dict:
    fip = await ctx.neutron.update_floatingip(fip_id, {"port_id": None})
    return floating_ip_summary(
        fip, None, {}, _names(await floating_networks(ctx))
    )


# --- port forwardings -----------------------------------------------------


async def list_port_forwardings(
    ctx: Context, fip_id: str | None = None
) -> list[dict]:
    """Every rule of the project's unassociated floating IPs, or one IP's."""
    await require_extension(ctx, PORT_FORWARDING_EXTENSION, "port forwarding")
    if fip_id:
        fip, rules = await asyncio.gather(
            ctx.neutron.floatingip(fip_id),
            ctx.neutron.port_forwardings(fip_id),
        )
        return [port_forwarding_summary(r, fip) for r in rules]
    fips = await ctx.neutron.floatingips(project_id=ctx.project_id)
    semaphore = asyncio.Semaphore(FAN_OUT)

    async def rules_for(fip: dict) -> list[dict]:
        async with semaphore:
            rules = await ctx.neutron.port_forwardings(fip["id"])
        return [port_forwarding_summary(r, fip) for r in rules]

    groups = await asyncio.gather(
        *(rules_for(f) for f in fips if not f.get("port_id"))
    )
    return [rule for group in groups for rule in group]


async def create_port_forwarding(
    ctx: Context, fip_id: str, body: PortForwardingCreate
) -> dict:
    await require_extension(ctx, PORT_FORWARDING_EXTENSION, "port forwarding")
    fields = port_forwarding_body(body.model_dump())
    rule = await ctx.neutron.create_port_forwarding(fip_id, fields)
    return port_forwarding_summary(rule, {"id": fip_id})


async def update_port_forwarding(
    ctx: Context, fip_id: str, rule_id: str, body: PortForwardingUpdate
) -> dict:
    await require_extension(ctx, PORT_FORWARDING_EXTENSION, "port forwarding")
    fields = port_forwarding_body(body.model_dump(exclude_none=True))
    if not fields:
        raise BadRequest("nothing to update")
    rule = await ctx.neutron.update_port_forwarding(fip_id, rule_id, fields)
    return port_forwarding_summary(rule, {"id": fip_id})


# --- trunks ---------------------------------------------------------------


async def list_trunks(ctx: Context) -> list[dict]:
    await require_extension(ctx, TRUNK_EXTENSION, "trunking")
    trunks, ports = await asyncio.gather(
        ctx.neutron.trunks(project_id=ctx.project_id),
        ctx.neutron.ports(project_id=ctx.project_id),
    )
    names = _names(ports)
    return [trunk_summary(t, names) for t in trunks]


async def get_trunk(ctx: Context, trunk_id: str) -> dict:
    await require_extension(ctx, TRUNK_EXTENSION, "trunking")
    trunk, ports = await asyncio.gather(
        ctx.neutron.trunk(trunk_id),
        ctx.neutron.ports(project_id=ctx.project_id),
    )
    return trunk_summary(trunk, _names(ports))


async def trunk_options(ctx: Context) -> dict:
    """Parent and subport candidates (``ports-extra.service.js``)."""
    await require_extension(ctx, TRUNK_EXTENSION, "trunking")
    ports, trunks, networks = await asyncio.gather(
        ctx.neutron.ports(project_id=ctx.project_id),
        ctx.neutron.trunks(project_id=ctx.project_id),
        networks_for_purpose(ctx, PURPOSE_BOOT),
    )
    rules = ctx.network_rules
    names = {n["id"]: n["name"] for n in networks}

    def shape(items):
        return [port_summary(p, names.get(p.get("network_id"))) for p in items]

    return {
        "parents": shape(rules.trunk_parent_candidates(ports, trunks)),
        "subports": shape(rules.trunk_subport_candidates(ports, trunks)),
    }


def _subport_fields(subports) -> list[dict]:
    fields = []
    for s in subports:
        entry: dict = {
            "port_id": s.port_id,
            "segmentation_type": s.segmentation_type,
        }
        if s.segmentation_type != "inherit":
            if s.segmentation_id is None:
                raise BadRequest("a VLAN segmentation id is required")
            entry["segmentation_id"] = s.segmentation_id
        fields.append(entry)
    return fields


async def create_trunk(ctx: Context, body: TrunkCreate) -> dict:
    await require_extension(ctx, TRUNK_EXTENSION, "trunking")
    fields: dict = {
        "name": body.name or "",
        "description": body.description or "",
        "admin_state_up": body.admin_state_up,
        "port_id": body.port_id,
        "sub_ports": _subport_fields(body.sub_ports),
    }
    return trunk_summary(await ctx.neutron.create_trunk(fields))


async def update_trunk(ctx: Context, trunk_id: str, fields: dict) -> dict:
    await require_extension(ctx, TRUNK_EXTENSION, "trunking")
    return trunk_summary(await ctx.neutron.update_trunk(trunk_id, fields))


async def add_subports(ctx: Context, trunk_id: str, subports) -> dict:
    await require_extension(ctx, TRUNK_EXTENSION, "trunking")
    trunk = await ctx.neutron.trunk_add_subports(
        trunk_id, _subport_fields(subports)
    )
    return trunk_summary(trunk)


async def remove_subports(
    ctx: Context, trunk_id: str, port_ids: list[str]
) -> dict:
    await require_extension(ctx, TRUNK_EXTENSION, "trunking")
    trunk = await ctx.neutron.trunk_remove_subports(
        trunk_id, [{"port_id": p} for p in port_ids]
    )
    return trunk_summary(trunk)


# --- topology -------------------------------------------------------------


async def topology(ctx: Context) -> dict:
    """What the Network Topology panel draws (``network_topology/views.py
    JSONView``), as a list for the SPA to lay out: the project's networks
    and the floating networks, routers, ports on those networks (no HA
    ports) and instances. Routers with a gateway get a synthetic port on
    the external network, as users cannot see the real gateway port."""

    async def servers():
        try:
            body = await ctx.nova.servers(limit=LIST_LIMIT)
        except HiveError:
            return []
        return [
            {
                "id": s.get("id"),
                "name": s.get("name") or s.get("id"),
                "status": s.get("status"),
            }
            for s in body.get("servers", [])
        ]

    async def routers():
        try:
            items = await ctx.neutron.routers(project_id=ctx.project_id)
        except HiveError:
            return []
        return [
            {
                "id": r.get("id"),
                "name": r.get("name") or r.get("id"),
                "status": r.get("status"),
                "admin_state_up": r.get("admin_state_up"),
                "external_network_id": (
                    r.get("external_gateway_info") or {}
                ).get("network_id"),
            }
            for r in items
        ]

    networks, router_items, ports, server_items = await asyncio.gather(
        networks_for_purpose(ctx, "any", include_external=True),
        routers(),
        ctx.neutron.ports(project_id=ctx.project_id),
        servers(),
    )
    network_ids = {n["id"] for n in networks}
    port_items = [
        {
            "id": p.get("id"),
            "name": p.get("name") or "",
            "network_id": p.get("network_id"),
            "device_id": p.get("device_id") or "",
            "device_owner": p.get("device_owner") or "",
            "status": p.get("status"),
            "fixed_ips": [
                {
                    "ip_address": ip.get("ip_address"),
                    "subnet_id": ip.get("subnet_id"),
                }
                for ip in p.get("fixed_ips") or []
            ],
        }
        for p in ports
        if p.get("device_owner") != ROUTER_HA_OWNER
        and p.get("network_id") in network_ids
    ]
    seen = {(p["network_id"], p["device_id"]) for p in port_items}
    for router in router_items:
        external = router["external_network_id"]
        if not external or (external, router["id"]) in seen:
            continue
        port_items.append(
            {
                "id": f"gateway-{router['id']}",
                "name": "",
                "network_id": external,
                "device_id": router["id"],
                "device_owner": ROUTER_GATEWAY_OWNER,
                "status": None,
                "fixed_ips": [],
            }
        )
    networks.sort(key=lambda n: (not n["is_external"], n["name"].lower()))
    return {
        "networks": networks,
        "routers": router_items,
        "ports": port_items,
        "servers": server_items,
    }


# --- security groups -------------------------------------------------------


def rule_summary(rule: dict) -> dict:
    return {
        "id": rule.get("id"),
        "direction": rule.get("direction"),
        "ethertype": rule.get("ethertype"),
        "protocol": rule.get("protocol"),
        "port_range_min": rule.get("port_range_min"),
        "port_range_max": rule.get("port_range_max"),
        "remote_ip_prefix": rule.get("remote_ip_prefix"),
        "remote_group_id": rule.get("remote_group_id"),
        "description": rule.get("description") or "",
        "open_to_the_world": secgroup_rules.is_open_to_the_world(rule),
    }


def security_group_summary(group: dict, with_rules: bool = True) -> dict:
    summary = {
        "id": group.get("id"),
        "name": group.get("name"),
        "description": group.get("description") or "",
        "project_id": group.get("project_id") or group.get("tenant_id"),
        "created_at": group.get("created_at"),
        "updated_at": group.get("updated_at"),
        "rule_count": len(group.get("security_group_rules") or []),
    }
    if with_rules:
        summary["rules"] = [
            rule_summary(r) for r in group.get("security_group_rules") or []
        ]
    return summary


async def list_security_groups(ctx: Context) -> list[dict]:
    groups = await ctx.neutron.security_groups(project_id=ctx.project_id)
    return [security_group_summary(g, with_rules=False) for g in groups]


async def get_security_group(ctx: Context, group_id: str) -> dict:
    return security_group_summary(await ctx.neutron.security_group(group_id))


def neutron_rule(group_id: str, body: dict) -> dict:
    """Translate a RuleCreate body (after presets) to a neutron rule."""
    rule = secgroup_rules.apply_preset(body)
    if rule.get("remote_ip_prefix") and rule.get("remote_group_id"):
        raise BadRequest("choose a remote CIDR or a remote group, not both")
    if not rule.get("remote_ip_prefix") and not rule.get("remote_group_id"):
        raise BadRequest(
            "a remote CIDR or a remote security group is required"
        )
    protocol = rule.get("protocol") or None
    payload: dict = {
        "security_group_id": group_id,
        "direction": rule.get("direction", "ingress"),
        "ethertype": rule.get("ethertype", "IPv4"),
        "protocol": protocol,
        "description": rule.get("description") or "",
    }
    if protocol in ("tcp", "udp", "icmp", "icmpv6", "ipv6-icmp"):
        low = rule.get("port_range_min")
        high = rule.get("port_range_max")
        if low is not None and low >= 0:
            payload["port_range_min"] = low
            payload["port_range_max"] = high if high is not None else low
    if rule.get("remote_ip_prefix"):
        payload["remote_ip_prefix"] = rule["remote_ip_prefix"]
    if rule.get("remote_group_id"):
        payload["remote_group_id"] = rule["remote_group_id"]
    return payload
