"""Load balancers (Octavia)."""

from fastapi import APIRouter, Depends, Response

from hive.api.compute import get_context
from hive.schemas.loadbalancer import (
    FloatingIpAssociate,
    L7PolicyCreate,
    L7PolicyUpdate,
    L7RuleSpec,
    L7RuleUpdate,
    ListenerCreate,
    ListenerUpdate,
    LoadBalancerCreate,
    LoadBalancerUpdate,
    MemberSpec,
    MembersReplace,
    MemberUpdate,
    MonitorCreate,
    MonitorUpdate,
    PoolCreate,
    PoolUpdate,
)
from hive.services.context import Context
from hive.services import loadbalancer

router = APIRouter(prefix="/load-balancers", tags=["load-balancers"])


@router.get("")
async def list_load_balancers(ctx: Context = Depends(get_context)):
    return await loadbalancer.list_load_balancers(ctx)


@router.post("", status_code=202)
async def create_load_balancer(
    body: LoadBalancerCreate, ctx: Context = Depends(get_context)
):
    return await loadbalancer.create_load_balancer(ctx, body)


@router.get("/options")
async def options(ctx: Context = Depends(get_context)):
    return await loadbalancer.options(ctx)


@router.get("/{lb_id}")
async def get_load_balancer(lb_id: str, ctx: Context = Depends(get_context)):
    return await loadbalancer.get_load_balancer(ctx, lb_id)


@router.get("/{lb_id}/tree")
async def load_balancer_tree(lb_id: str, ctx: Context = Depends(get_context)):
    return await loadbalancer.load_balancer_tree(ctx, lb_id)


@router.patch("/{lb_id}")
async def update_load_balancer(
    lb_id: str, body: LoadBalancerUpdate, ctx: Context = Depends(get_context)
):
    return await loadbalancer.update_load_balancer(
        ctx, lb_id, body.model_dump()
    )


@router.delete("/{lb_id}", status_code=204)
async def delete_load_balancer(
    lb_id: str, ctx: Context = Depends(get_context)
):
    await loadbalancer.delete_load_balancer(ctx, lb_id)
    return Response(status_code=204)


@router.post("/{lb_id}/failover", status_code=202)
async def failover(lb_id: str, ctx: Context = Depends(get_context)):
    await loadbalancer.failover_load_balancer(ctx, lb_id)
    return {"id": lb_id}


@router.post("/{lb_id}/floating-ip")
async def associate_floating_ip(
    lb_id: str, body: FloatingIpAssociate, ctx: Context = Depends(get_context)
):
    return await loadbalancer.associate_floating_ip(
        ctx, lb_id, body.floating_ip_id, body.pool_id
    )


@router.delete("/{lb_id}/floating-ip")
async def disassociate_floating_ip(
    lb_id: str, ctx: Context = Depends(get_context)
):
    return await loadbalancer.disassociate_floating_ip(ctx, lb_id)


# --- listeners -----------------------------------------------------------------


@router.post("/listeners", status_code=202)
async def create_listener(
    body: ListenerCreate, ctx: Context = Depends(get_context)
):
    return await loadbalancer.create_listener(
        ctx, body.loadbalancer_id, body, body.pool, body.members, body.monitor
    )


@router.patch("/listeners/{listener_id}")
async def update_listener(
    listener_id: str, body: ListenerUpdate, ctx: Context = Depends(get_context)
):
    return await loadbalancer.update_listener(
        ctx, listener_id, body.model_dump()
    )


@router.delete("/listeners/{listener_id}", status_code=204)
async def delete_listener(
    listener_id: str, ctx: Context = Depends(get_context)
):
    await loadbalancer.delete_listener(ctx, listener_id)
    return Response(status_code=204)


# --- pools and members ---------------------------------------------------------


@router.post("/pools", status_code=202)
async def create_pool(body: PoolCreate, ctx: Context = Depends(get_context)):
    return await loadbalancer.create_pool(
        ctx,
        body.loadbalancer_id,
        body.listener_id,
        body,
        body.members,
        body.monitor,
    )


@router.patch("/pools/{pool_id}")
async def update_pool(
    pool_id: str, body: PoolUpdate, ctx: Context = Depends(get_context)
):
    return await loadbalancer.update_pool(ctx, pool_id, body.model_dump())


@router.delete("/pools/{pool_id}", status_code=204)
async def delete_pool(pool_id: str, ctx: Context = Depends(get_context)):
    await loadbalancer.delete_pool(ctx, pool_id)
    return Response(status_code=204)


@router.put("/{lb_id}/pools/{pool_id}/members")
async def replace_members(
    lb_id: str,
    pool_id: str,
    body: MembersReplace,
    ctx: Context = Depends(get_context),
):
    return await loadbalancer.replace_members(
        ctx, lb_id, pool_id, body.members
    )


@router.post("/{lb_id}/pools/{pool_id}/members", status_code=202)
async def add_member(
    lb_id: str,
    pool_id: str,
    body: MemberSpec,
    ctx: Context = Depends(get_context),
):
    return await loadbalancer.add_member(ctx, lb_id, pool_id, body)


@router.patch("/pools/{pool_id}/members/{member_id}")
async def update_member(
    pool_id: str,
    member_id: str,
    body: MemberUpdate,
    ctx: Context = Depends(get_context),
):
    return await loadbalancer.update_member(
        ctx, pool_id, member_id, body.model_dump()
    )


@router.delete("/pools/{pool_id}/members/{member_id}", status_code=204)
async def delete_member(
    pool_id: str, member_id: str, ctx: Context = Depends(get_context)
):
    await loadbalancer.delete_member(ctx, pool_id, member_id)
    return Response(status_code=204)


# --- health monitors -----------------------------------------------------------


@router.post("/monitors", status_code=202)
async def create_monitor(
    body: MonitorCreate, ctx: Context = Depends(get_context)
):
    return await loadbalancer.create_monitor(ctx, body.pool_id, body)


@router.patch("/monitors/{monitor_id}")
async def update_monitor(
    monitor_id: str, body: MonitorUpdate, ctx: Context = Depends(get_context)
):
    return await loadbalancer.update_monitor(
        ctx, monitor_id, body.model_dump()
    )


@router.delete("/monitors/{monitor_id}", status_code=204)
async def delete_monitor(monitor_id: str, ctx: Context = Depends(get_context)):
    await loadbalancer.delete_monitor(ctx, monitor_id)
    return Response(status_code=204)


# --- L7 ------------------------------------------------------------------------


@router.post("/l7policies", status_code=202)
async def create_l7_policy(
    body: L7PolicyCreate, ctx: Context = Depends(get_context)
):
    return await loadbalancer.create_l7_policy(ctx, body.listener_id, body)


@router.get("/l7policies/{policy_id}")
async def get_l7_policy(policy_id: str, ctx: Context = Depends(get_context)):
    return await loadbalancer.get_l7_policy(ctx, policy_id)


@router.patch("/l7policies/{policy_id}")
async def update_l7_policy(
    policy_id: str, body: L7PolicyUpdate, ctx: Context = Depends(get_context)
):
    return await loadbalancer.update_l7_policy(
        ctx, policy_id, body.model_dump()
    )


@router.delete("/l7policies/{policy_id}", status_code=204)
async def delete_l7_policy(
    policy_id: str, ctx: Context = Depends(get_context)
):
    await loadbalancer.delete_l7_policy(ctx, policy_id)
    return Response(status_code=204)


@router.post("/l7policies/{policy_id}/rules", status_code=202)
async def create_l7_rule(
    policy_id: str, body: L7RuleSpec, ctx: Context = Depends(get_context)
):
    return await loadbalancer.create_l7_rule(ctx, policy_id, body)


@router.patch("/l7policies/{policy_id}/rules/{rule_id}")
async def update_l7_rule(
    policy_id: str,
    rule_id: str,
    body: L7RuleUpdate,
    ctx: Context = Depends(get_context),
):
    return await loadbalancer.update_l7_rule(
        ctx, policy_id, rule_id, body.model_dump()
    )


@router.delete("/l7policies/{policy_id}/rules/{rule_id}", status_code=204)
async def delete_l7_rule(
    policy_id: str, rule_id: str, ctx: Context = Depends(get_context)
):
    await loadbalancer.delete_l7_rule(ctx, policy_id, rule_id)
    return Response(status_code=204)
