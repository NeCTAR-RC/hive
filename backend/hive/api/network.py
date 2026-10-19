"""Network endpoints: networks, subnets and ports, routers, floating IPs
and their port forwardings, trunks, the topology payload, and the security
groups compute shares."""

from fastapi import APIRouter, Depends, Response

from hive.deps import get_context
from hive.errors import BadRequest, NotFound
from hive.nectar import secgroups as secgroup_rules
from hive.nectar.networks import PURPOSE_ANY, PURPOSE_BOOT, PURPOSE_ROUTER
from hive.schemas.compute import (
    RuleCreate,
    SecurityGroupCreate,
    SecurityGroupUpdate,
)
from hive.schemas.network import (
    AddInterface,
    FloatingIpAllocate,
    FloatingIpAssociate,
    NetworkCreate,
    NetworkUpdate,
    PortCreate,
    PortForwardingCreate,
    PortForwardingUpdate,
    PortUpdate,
    RouterCreate,
    RouterUpdate,
    SetGateway,
    StaticRoutes,
    SubnetCreate,
    SubnetUpdate,
    SubportIds,
    Subports,
    TrunkCreate,
    TrunkUpdate,
)
from hive.services.context import Context
from hive.services import network

router = APIRouter(prefix="/network", tags=["network"])

PURPOSES = {PURPOSE_BOOT, PURPOSE_ROUTER, PURPOSE_ANY}


# --- reference data ------------------------------------------------------------


@router.get("/options")
async def options(ctx: Context = Depends(get_context)):
    return await network.options(ctx)


@router.get("/extensions")
async def extensions(ctx: Context = Depends(get_context)):
    return await network.extension_flags(ctx)


@router.get("/quota")
async def quota(ctx: Context = Depends(get_context)):
    return await network.quota(ctx)


@router.get("/topology")
async def topology(ctx: Context = Depends(get_context)):
    return await network.topology(ctx)


# --- networks ------------------------------------------------------------------


@router.get("/networks")
async def list_networks(
    purpose: str = PURPOSE_ANY,
    external: bool = False,
    ctx: Context = Depends(get_context),
):
    if purpose not in PURPOSES:
        raise BadRequest(f"purpose must be one of {sorted(PURPOSES)}")
    return {
        "items": await network.networks_for_purpose(
            ctx, purpose, include_external=external
        )
    }


@router.post("/networks", status_code=201)
async def create_network(
    body: NetworkCreate, ctx: Context = Depends(get_context)
):
    return await network.create_network(ctx, body)


@router.get("/networks/{network_id}")
async def get_network(network_id: str, ctx: Context = Depends(get_context)):
    return await network.get_network(ctx, network_id)


@router.patch("/networks/{network_id}")
async def update_network(
    network_id: str, body: NetworkUpdate, ctx: Context = Depends(get_context)
):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise BadRequest("nothing to update")
    return await network.update_network(ctx, network_id, fields)


@router.delete("/networks/{network_id}", status_code=204)
async def delete_network(network_id: str, ctx: Context = Depends(get_context)):
    await ctx.neutron.delete_network(network_id)
    return Response(status_code=204)


# --- subnets -------------------------------------------------------------------


@router.post("/subnets", status_code=201)
async def create_subnet(
    body: SubnetCreate, ctx: Context = Depends(get_context)
):
    return await network.create_subnet(ctx, body)


@router.get("/subnets/{subnet_id}")
async def get_subnet(subnet_id: str, ctx: Context = Depends(get_context)):
    return network.subnet_summary(await ctx.neutron.subnet(subnet_id))


@router.patch("/subnets/{subnet_id}")
async def update_subnet(
    subnet_id: str, body: SubnetUpdate, ctx: Context = Depends(get_context)
):
    return await network.update_subnet(ctx, subnet_id, body)


@router.delete("/subnets/{subnet_id}", status_code=204)
async def delete_subnet(subnet_id: str, ctx: Context = Depends(get_context)):
    await ctx.neutron.delete_subnet(subnet_id)
    return Response(status_code=204)


# --- ports ---------------------------------------------------------------------


@router.get("/ports")
async def list_ports(
    purpose: str = PURPOSE_BOOT, ctx: Context = Depends(get_context)
):
    if purpose != PURPOSE_BOOT:
        raise BadRequest("only purpose=boot is supported")
    return {"items": await network.attachable_ports(ctx)}


@router.post("/ports", status_code=201)
async def create_port(body: PortCreate, ctx: Context = Depends(get_context)):
    return await network.create_port(ctx, body)


@router.get("/ports/{port_id}")
async def get_port(port_id: str, ctx: Context = Depends(get_context)):
    return await network.get_port(ctx, port_id)


@router.patch("/ports/{port_id}")
async def update_port(
    port_id: str, body: PortUpdate, ctx: Context = Depends(get_context)
):
    return await network.update_port(ctx, port_id, body)


@router.delete("/ports/{port_id}", status_code=204)
async def delete_port(port_id: str, ctx: Context = Depends(get_context)):
    await ctx.neutron.delete_port(port_id)
    return Response(status_code=204)


# --- routers -------------------------------------------------------------------


@router.get("/routers")
async def list_routers(ctx: Context = Depends(get_context)):
    return {"items": await network.list_routers(ctx)}


@router.post("/routers", status_code=201)
async def create_router(
    body: RouterCreate, ctx: Context = Depends(get_context)
):
    return await network.create_router(ctx, body)


@router.get("/routers/{router_id}")
async def get_router(router_id: str, ctx: Context = Depends(get_context)):
    return await network.get_router(ctx, router_id)


@router.patch("/routers/{router_id}")
async def update_router(
    router_id: str, body: RouterUpdate, ctx: Context = Depends(get_context)
):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise BadRequest("nothing to update")
    return await network.update_router(ctx, router_id, fields)


@router.delete("/routers/{router_id}", status_code=204)
async def delete_router(router_id: str, ctx: Context = Depends(get_context)):
    await network.delete_router(ctx, router_id)
    return Response(status_code=204)


@router.put("/routers/{router_id}/gateway")
async def set_gateway(
    router_id: str, body: SetGateway, ctx: Context = Depends(get_context)
):
    return await network.set_gateway(ctx, router_id, body.network_id)


@router.delete("/routers/{router_id}/gateway")
async def clear_gateway(router_id: str, ctx: Context = Depends(get_context)):
    return await network.clear_gateway(ctx, router_id)


@router.get("/routers/{router_id}/interface-candidates")
async def interface_candidates(
    router_id: str, ctx: Context = Depends(get_context)
):
    return {"items": await network.interface_candidates(ctx, router_id)}


@router.post("/routers/{router_id}/interfaces", status_code=202)
async def add_interface(
    router_id: str, body: AddInterface, ctx: Context = Depends(get_context)
):
    return await network.add_interface(ctx, router_id, body)


@router.delete("/routers/{router_id}/interfaces/{port_id}", status_code=204)
async def remove_interface(
    router_id: str, port_id: str, ctx: Context = Depends(get_context)
):
    await network.remove_interface(ctx, router_id, port_id)
    return Response(status_code=204)


@router.put("/routers/{router_id}/routes")
async def set_routes(
    router_id: str, body: StaticRoutes, ctx: Context = Depends(get_context)
):
    return await network.set_routes(
        ctx, router_id, [r.model_dump() for r in body.routes]
    )


# --- floating IPs --------------------------------------------------------------


@router.get("/floating-ips")
async def list_floating_ips(ctx: Context = Depends(get_context)):
    return {"items": await network.list_floating_ips(ctx)}


@router.post("/floating-ips", status_code=201)
async def allocate_floating_ip(
    body: FloatingIpAllocate, ctx: Context = Depends(get_context)
):
    return await network.allocate_floating_ip(ctx, body)


@router.get("/floating-ips/targets")
async def floating_ip_targets(
    instance_id: str | None = None, ctx: Context = Depends(get_context)
):
    return {"items": await network.floating_ip_targets(ctx, instance_id)}


@router.get("/floating-ips/{fip_id}")
async def get_floating_ip(fip_id: str, ctx: Context = Depends(get_context)):
    return await network.get_floating_ip(ctx, fip_id)


@router.post("/floating-ips/{fip_id}/associate")
async def associate_floating_ip(
    fip_id: str, body: FloatingIpAssociate, ctx: Context = Depends(get_context)
):
    return await network.associate_floating_ip(
        ctx, fip_id, body.port_id, body.fixed_ip_address
    )


@router.post("/floating-ips/{fip_id}/disassociate")
async def disassociate_floating_ip(
    fip_id: str, ctx: Context = Depends(get_context)
):
    return await network.disassociate_floating_ip(ctx, fip_id)


@router.delete("/floating-ips/{fip_id}", status_code=204)
async def release_floating_ip(
    fip_id: str, ctx: Context = Depends(get_context)
):
    await ctx.neutron.delete_floatingip(fip_id)
    return Response(status_code=204)


# --- port forwardings ----------------------------------------------------------


@router.get("/port-forwardings")
async def list_port_forwardings(
    floating_ip_id: str | None = None, ctx: Context = Depends(get_context)
):
    return {"items": await network.list_port_forwardings(ctx, floating_ip_id)}


@router.post("/floating-ips/{fip_id}/port-forwardings", status_code=201)
async def create_port_forwarding(
    fip_id: str,
    body: PortForwardingCreate,
    ctx: Context = Depends(get_context),
):
    return await network.create_port_forwarding(ctx, fip_id, body)


@router.patch("/floating-ips/{fip_id}/port-forwardings/{rule_id}")
async def update_port_forwarding(
    fip_id: str,
    rule_id: str,
    body: PortForwardingUpdate,
    ctx: Context = Depends(get_context),
):
    return await network.update_port_forwarding(ctx, fip_id, rule_id, body)


@router.delete(
    "/floating-ips/{fip_id}/port-forwardings/{rule_id}", status_code=204
)
async def delete_port_forwarding(
    fip_id: str, rule_id: str, ctx: Context = Depends(get_context)
):
    await ctx.neutron.delete_port_forwarding(fip_id, rule_id)
    return Response(status_code=204)


# --- trunks --------------------------------------------------------------------


@router.get("/trunks")
async def list_trunks(ctx: Context = Depends(get_context)):
    return {"items": await network.list_trunks(ctx)}


@router.post("/trunks", status_code=201)
async def create_trunk(body: TrunkCreate, ctx: Context = Depends(get_context)):
    return await network.create_trunk(ctx, body)


@router.get("/trunks/options")
async def trunk_options(ctx: Context = Depends(get_context)):
    return await network.trunk_options(ctx)


@router.get("/trunks/{trunk_id}")
async def get_trunk(trunk_id: str, ctx: Context = Depends(get_context)):
    return await network.get_trunk(ctx, trunk_id)


@router.patch("/trunks/{trunk_id}")
async def update_trunk(
    trunk_id: str, body: TrunkUpdate, ctx: Context = Depends(get_context)
):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise BadRequest("nothing to update")
    return await network.update_trunk(ctx, trunk_id, fields)


@router.delete("/trunks/{trunk_id}", status_code=204)
async def delete_trunk(trunk_id: str, ctx: Context = Depends(get_context)):
    await ctx.neutron.delete_trunk(trunk_id)
    return Response(status_code=204)


@router.post("/trunks/{trunk_id}/subports")
async def add_subports(
    trunk_id: str, body: Subports, ctx: Context = Depends(get_context)
):
    return await network.add_subports(ctx, trunk_id, body.sub_ports)


@router.post("/trunks/{trunk_id}/subports/remove")
async def remove_subports(
    trunk_id: str, body: SubportIds, ctx: Context = Depends(get_context)
):
    return await network.remove_subports(ctx, trunk_id, body.port_ids)


# --- security groups -----------------------------------------------------------


@router.get("/security-group-presets")
async def presets():
    return {
        "items": secgroup_rules.PRESETS,
        "default_remote_cidr": secgroup_rules.DEFAULT_REMOTE_CIDR,
    }


@router.get("/security-groups")
async def list_security_groups(ctx: Context = Depends(get_context)):
    return {"items": await network.list_security_groups(ctx)}


@router.post("/security-groups", status_code=201)
async def create_security_group(
    body: SecurityGroupCreate, ctx: Context = Depends(get_context)
):
    group = await ctx.neutron.create_security_group(
        {"name": body.name, "description": body.description}
    )
    return network.security_group_summary(group)


@router.get("/security-groups/{group_id}")
async def get_security_group(
    group_id: str, ctx: Context = Depends(get_context)
):
    return await network.get_security_group(ctx, group_id)


@router.patch("/security-groups/{group_id}")
async def update_security_group(
    group_id: str,
    body: SecurityGroupUpdate,
    ctx: Context = Depends(get_context),
):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise BadRequest("nothing to update")
    group = await ctx.neutron.update_security_group(group_id, fields)
    return network.security_group_summary(group)


@router.delete("/security-groups/{group_id}", status_code=204)
async def delete_security_group(
    group_id: str, ctx: Context = Depends(get_context)
):
    await ctx.neutron.delete_security_group(group_id)
    return Response(status_code=204)


@router.post("/security-groups/{group_id}/rules", status_code=201)
async def create_rule(
    group_id: str, body: RuleCreate, ctx: Context = Depends(get_context)
):
    payload = network.neutron_rule(group_id, body.model_dump())
    rule = await ctx.neutron.create_security_group_rule(payload)
    return network.rule_summary(rule)


@router.delete("/security-groups/{group_id}/rules/{rule_id}", status_code=204)
async def delete_rule(
    group_id: str, rule_id: str, ctx: Context = Depends(get_context)
):
    group = await ctx.neutron.security_group(group_id)
    if not any(
        r.get("id") == rule_id for r in group.get("security_group_rules") or []
    ):
        raise NotFound("the rule is not in this security group")
    await ctx.neutron.delete_security_group_rule(rule_id)
    return Response(status_code=204)
