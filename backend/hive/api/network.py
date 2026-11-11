"""Network endpoints: networks, subnets and ports, routers, floating IPs
and their port forwardings, trunks, the topology payload, and the security
groups compute shares."""

from typing import Literal

from fastapi import APIRouter, Request, Response

from hive.deps import ContextDep
from hive.nectar.networks import PURPOSE_ANY, PURPOSE_BOOT
from hive.schemas.compute import (
    RuleCreate,
    SecurityGroupCreate,
    SecurityGroupUpdate,
)
from hive.schemas.network import (
    AddInterface,
    AllowedAddressPairs,
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
from hive.schemas.responses import Items
from hive.schemas.responses.network import (
    AddInterfaceResult,
    AttachablePort,
    FloatingIp,
    FloatingIpTarget,
    InterfaceCandidate,
    MyAddress,
    Network,
    NetworkDetail,
    NetworkExtensions,
    NetworkOptions,
    NetworkQuota,
    Port,
    PortForwarding,
    Router,
    RouterDetail,
    RulePresets,
    SecurityGroup,
    SecurityGroupDetail,
    SecurityGroupRule,
    SubnetDetail,
    Topology,
    Trunk,
    TrunkOptions,
)
from hive.services import network

router = APIRouter(prefix="/network", tags=["network"])

# Which networks a picker wants (``nectar.networks``).
Purpose = Literal["boot", "router", "any"]


@router.get("/options")
async def options(ctx: ContextDep) -> NetworkOptions:
    return await network.options(ctx)


@router.get("/extensions")
async def extensions(ctx: ContextDep) -> NetworkExtensions:
    return await network.extension_flags(ctx)


@router.get("/quota")
async def quota(ctx: ContextDep) -> NetworkQuota:
    return await network.quota(ctx)


@router.get("/my-address")
async def my_address(
    request: Request,
    ctx: ContextDep,  # noqa: ARG001 - signed-in users only
) -> MyAddress:
    """The browser's address as the ingress reports it (uvicorn reads
    X-Forwarded-For from ``HIVE_FORWARDED_ALLOW_IPS``), for the rule form's
    "Use my address"."""
    return network.my_address(request.client.host if request.client else None)


@router.get("/topology")
async def topology(ctx: ContextDep) -> Topology:
    return await network.topology(ctx)


@router.get("/networks")
async def list_networks(
    ctx: ContextDep, purpose: Purpose = PURPOSE_ANY, external: bool = False
) -> Items[Network]:
    # ``external`` is the Networks panel's listing, which also needs to
    # know which networks still hold ports.
    items = await network.networks_for_purpose(
        ctx, purpose, include_external=external, count_ports=external
    )
    return Items[Network](items=items)


@router.post("/networks", status_code=201)
async def create_network(body: NetworkCreate, ctx: ContextDep) -> Network:
    return await network.create_network(ctx, body)


@router.get("/networks/{network_id}")
async def get_network(network_id: str, ctx: ContextDep) -> NetworkDetail:
    return await network.get_network(ctx, network_id)


@router.patch("/networks/{network_id}")
async def update_network(
    network_id: str, body: NetworkUpdate, ctx: ContextDep
) -> Network:
    return await network.update_network(ctx, network_id, body)


@router.delete("/networks/{network_id}", status_code=204)
async def delete_network(network_id: str, ctx: ContextDep) -> Response:
    await network.delete_network(ctx, network_id)
    return Response(status_code=204)


@router.post("/subnets", status_code=201)
async def create_subnet(body: SubnetCreate, ctx: ContextDep) -> SubnetDetail:
    return await network.create_subnet(ctx, body)


@router.get("/subnets/{subnet_id}")
async def get_subnet(subnet_id: str, ctx: ContextDep) -> SubnetDetail:
    return await network.get_subnet(ctx, subnet_id)


@router.patch("/subnets/{subnet_id}")
async def update_subnet(
    subnet_id: str, body: SubnetUpdate, ctx: ContextDep
) -> SubnetDetail:
    return await network.update_subnet(ctx, subnet_id, body)


@router.delete("/subnets/{subnet_id}", status_code=204)
async def delete_subnet(subnet_id: str, ctx: ContextDep) -> Response:
    await network.delete_subnet(ctx, subnet_id)
    return Response(status_code=204)


@router.get("/ports")
async def list_ports(
    ctx: ContextDep,
    purpose: Literal["boot"] = PURPOSE_BOOT,  # noqa: ARG001 - the only one
) -> Items[AttachablePort]:
    return Items[AttachablePort](items=await network.attachable_ports(ctx))


@router.post("/ports", status_code=201)
async def create_port(body: PortCreate, ctx: ContextDep) -> Port:
    return await network.create_port(ctx, body)


@router.get("/ports/{port_id}")
async def get_port(port_id: str, ctx: ContextDep) -> Port:
    return await network.get_port(ctx, port_id)


@router.patch("/ports/{port_id}")
async def update_port(port_id: str, body: PortUpdate, ctx: ContextDep) -> Port:
    return await network.update_port(ctx, port_id, body)


@router.put("/ports/{port_id}/allowed-address-pairs")
async def set_allowed_address_pairs(
    port_id: str, body: AllowedAddressPairs, ctx: ContextDep
) -> Port:
    return await network.set_allowed_address_pairs(
        ctx, port_id, [p.model_dump() for p in body.pairs]
    )


@router.delete("/ports/{port_id}", status_code=204)
async def delete_port(port_id: str, ctx: ContextDep) -> Response:
    await network.delete_port(ctx, port_id)
    return Response(status_code=204)


@router.get("/routers")
async def list_routers(ctx: ContextDep) -> Items[Router]:
    return Items[Router](items=await network.list_routers(ctx))


@router.post("/routers", status_code=201)
async def create_router(body: RouterCreate, ctx: ContextDep) -> Router:
    return await network.create_router(ctx, body)


@router.get("/routers/{router_id}")
async def get_router(router_id: str, ctx: ContextDep) -> RouterDetail:
    return await network.get_router(ctx, router_id)


@router.patch("/routers/{router_id}")
async def update_router(
    router_id: str, body: RouterUpdate, ctx: ContextDep
) -> Router:
    return await network.update_router(ctx, router_id, body)


@router.delete("/routers/{router_id}", status_code=204)
async def delete_router(router_id: str, ctx: ContextDep) -> Response:
    await network.delete_router(ctx, router_id)
    return Response(status_code=204)


@router.put("/routers/{router_id}/gateway")
async def set_gateway(
    router_id: str, body: SetGateway, ctx: ContextDep
) -> Router:
    return await network.set_gateway(ctx, router_id, body.network_id)


@router.delete("/routers/{router_id}/gateway")
async def clear_gateway(router_id: str, ctx: ContextDep) -> Router:
    return await network.clear_gateway(ctx, router_id)


@router.get("/routers/{router_id}/interface-candidates")
async def interface_candidates(
    router_id: str, ctx: ContextDep
) -> Items[InterfaceCandidate]:
    return Items[InterfaceCandidate](
        items=await network.interface_candidates(ctx, router_id)
    )


@router.post("/routers/{router_id}/interfaces", status_code=202)
async def add_interface(
    router_id: str, body: AddInterface, ctx: ContextDep
) -> AddInterfaceResult:
    return await network.add_interface(ctx, router_id, body)


@router.delete("/routers/{router_id}/interfaces/{port_id}", status_code=204)
async def remove_interface(
    router_id: str, port_id: str, ctx: ContextDep
) -> Response:
    await network.remove_interface(ctx, router_id, port_id)
    return Response(status_code=204)


@router.put("/routers/{router_id}/routes")
async def set_routes(
    router_id: str, body: StaticRoutes, ctx: ContextDep
) -> Router:
    return await network.set_routes(
        ctx, router_id, [r.model_dump() for r in body.routes]
    )


@router.get("/floating-ips")
async def list_floating_ips(ctx: ContextDep) -> Items[FloatingIp]:
    return Items[FloatingIp](items=await network.list_floating_ips(ctx))


@router.post("/floating-ips", status_code=201)
async def allocate_floating_ip(
    body: FloatingIpAllocate, ctx: ContextDep
) -> FloatingIp:
    return await network.allocate_floating_ip(ctx, body)


@router.get("/floating-ips/targets")
async def floating_ip_targets(
    ctx: ContextDep, instance_id: str | None = None
) -> Items[FloatingIpTarget]:
    return Items[FloatingIpTarget](
        items=await network.floating_ip_targets(ctx, instance_id)
    )


@router.get("/floating-ips/{fip_id}")
async def get_floating_ip(fip_id: str, ctx: ContextDep) -> FloatingIp:
    return await network.get_floating_ip(ctx, fip_id)


@router.post("/floating-ips/{fip_id}/associate")
async def associate_floating_ip(
    fip_id: str, body: FloatingIpAssociate, ctx: ContextDep
) -> FloatingIp:
    return await network.associate_floating_ip(
        ctx, fip_id, body.port_id, body.fixed_ip_address
    )


@router.post("/floating-ips/{fip_id}/disassociate")
async def disassociate_floating_ip(fip_id: str, ctx: ContextDep) -> FloatingIp:
    return await network.disassociate_floating_ip(ctx, fip_id)


@router.delete("/floating-ips/{fip_id}", status_code=204)
async def release_floating_ip(fip_id: str, ctx: ContextDep) -> Response:
    await network.release_floating_ip(ctx, fip_id)
    return Response(status_code=204)


@router.get("/port-forwardings")
async def list_port_forwardings(
    ctx: ContextDep, floating_ip_id: str | None = None
) -> Items[PortForwarding]:
    return Items[PortForwarding](
        items=await network.list_port_forwardings(ctx, floating_ip_id)
    )


@router.post("/floating-ips/{fip_id}/port-forwardings", status_code=201)
async def create_port_forwarding(
    fip_id: str, body: PortForwardingCreate, ctx: ContextDep
) -> PortForwarding:
    return await network.create_port_forwarding(ctx, fip_id, body)


@router.patch("/floating-ips/{fip_id}/port-forwardings/{rule_id}")
async def update_port_forwarding(
    fip_id: str, rule_id: str, body: PortForwardingUpdate, ctx: ContextDep
) -> PortForwarding:
    return await network.update_port_forwarding(ctx, fip_id, rule_id, body)


@router.delete(
    "/floating-ips/{fip_id}/port-forwardings/{rule_id}", status_code=204
)
async def delete_port_forwarding(
    fip_id: str, rule_id: str, ctx: ContextDep
) -> Response:
    await network.delete_port_forwarding(ctx, fip_id, rule_id)
    return Response(status_code=204)


@router.get("/trunks")
async def list_trunks(ctx: ContextDep) -> Items[Trunk]:
    return Items[Trunk](items=await network.list_trunks(ctx))


@router.post("/trunks", status_code=201)
async def create_trunk(body: TrunkCreate, ctx: ContextDep) -> Trunk:
    return await network.create_trunk(ctx, body)


@router.get("/trunks/options")
async def trunk_options(ctx: ContextDep) -> TrunkOptions:
    return await network.trunk_options(ctx)


@router.get("/trunks/{trunk_id}")
async def get_trunk(trunk_id: str, ctx: ContextDep) -> Trunk:
    return await network.get_trunk(ctx, trunk_id)


@router.patch("/trunks/{trunk_id}")
async def update_trunk(
    trunk_id: str, body: TrunkUpdate, ctx: ContextDep
) -> Trunk:
    return await network.update_trunk(ctx, trunk_id, body)


@router.delete("/trunks/{trunk_id}", status_code=204)
async def delete_trunk(trunk_id: str, ctx: ContextDep) -> Response:
    await network.delete_trunk(ctx, trunk_id)
    return Response(status_code=204)


@router.post("/trunks/{trunk_id}/subports")
async def add_subports(
    trunk_id: str, body: Subports, ctx: ContextDep
) -> Trunk:
    return await network.add_subports(ctx, trunk_id, body.sub_ports)


@router.post("/trunks/{trunk_id}/subports/remove")
async def remove_subports(
    trunk_id: str, body: SubportIds, ctx: ContextDep
) -> Trunk:
    return await network.remove_subports(ctx, trunk_id, body.port_ids)


@router.get("/security-group-presets")
async def presets() -> RulePresets:
    return network.rule_presets()


@router.get("/security-groups")
async def list_security_groups(ctx: ContextDep) -> Items[SecurityGroup]:
    return Items[SecurityGroup](items=await network.list_security_groups(ctx))


@router.post("/security-groups", status_code=201)
async def create_security_group(
    body: SecurityGroupCreate, ctx: ContextDep
) -> SecurityGroupDetail:
    return await network.create_security_group(ctx, body)


@router.get("/security-groups/{group_id}")
async def get_security_group(
    group_id: str, ctx: ContextDep
) -> SecurityGroupDetail:
    return await network.get_security_group(ctx, group_id)


@router.patch("/security-groups/{group_id}")
async def update_security_group(
    group_id: str, body: SecurityGroupUpdate, ctx: ContextDep
) -> SecurityGroupDetail:
    return await network.update_security_group(ctx, group_id, body)


@router.delete("/security-groups/{group_id}", status_code=204)
async def delete_security_group(group_id: str, ctx: ContextDep) -> Response:
    await network.delete_security_group(ctx, group_id)
    return Response(status_code=204)


@router.post("/security-groups/{group_id}/rules", status_code=201)
async def create_rule(
    group_id: str, body: RuleCreate, ctx: ContextDep
) -> SecurityGroupRule:
    return await network.create_rule(ctx, group_id, body)


@router.delete("/security-groups/{group_id}/rules/{rule_id}", status_code=204)
async def delete_rule(
    group_id: str,
    rule_id: str,
    ctx: ContextDep,
) -> Response:
    await network.delete_rule(ctx, group_id, rule_id)
    return Response(status_code=204)
