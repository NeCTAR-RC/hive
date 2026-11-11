"""Compute endpoints: instances, flavours, images, key pairs, server
groups, availability zones, limits and the launch wizard data."""

from typing import Annotated

from fastapi import APIRouter, Query, Request, Response

from hive.deps import ContextDep
from hive.schemas.compute import (
    ConsoleRequest,
    ImageCreate,
    ImageUpdate,
    KeypairCreate,
    LaunchRequest,
    ServerGroupCreate,
    ServerListQuery,
    ServerUpdate,
)
from hive.schemas.instance_actions import InstanceActionRequest
from hive.schemas.responses import AvailabilityZone, Items, Paginated
from hive.schemas.responses.compute import (
    ActionResult,
    ComputeLimits,
    ConsoleOutput,
    Flavor,
    Image,
    Instance,
    InstanceAction,
    InstanceDetail,
    InstancePort,
    InstanceVolume,
    KeyPair,
    KeyPairCreated,
    KeyPairDetail,
    LaunchOptions,
    LaunchResult,
    RemoteConsole,
    ServerGroup,
    ServerPassword,
)
from hive.services import compute, instance_actions

router = APIRouter(prefix="/compute", tags=["compute"])


@router.get("/instances")
async def list_instances(
    query: Annotated[ServerListQuery, Query()], ctx: ContextDep
) -> Paginated[Instance]:
    return await compute.list_instances(ctx, query)


@router.get("/launch-options")
async def launch_options(ctx: ContextDep) -> LaunchOptions:
    return await compute.launch_options(ctx)


@router.post("/instances", status_code=202)
async def launch(body: LaunchRequest, ctx: ContextDep) -> LaunchResult:
    return await compute.launch(ctx, body)


@router.get("/instances/{server_id}")
async def get_instance(server_id: str, ctx: ContextDep) -> InstanceDetail:
    return await compute.get_instance(ctx, server_id)


@router.patch("/instances/{server_id}")
async def update_instance(
    server_id: str, body: ServerUpdate, ctx: ContextDep
) -> Instance:
    return await compute.update_instance(ctx, server_id, body)


@router.delete("/instances/{server_id}", status_code=204)
async def delete_instance(server_id: str, ctx: ContextDep) -> Response:
    await compute.delete_instance(ctx, server_id)
    return Response(status_code=204)


@router.get("/instances/{server_id}/volumes")
async def instance_volumes(
    server_id: str, ctx: ContextDep
) -> Items[InstanceVolume]:
    items = await compute.instance_volumes(ctx, server_id)
    return Items[InstanceVolume](items=items)


@router.get("/instances/{server_id}/ports")
async def instance_ports(
    server_id: str, ctx: ContextDep
) -> Items[InstancePort]:
    items = await compute.instance_ports(ctx, server_id)
    return Items[InstancePort](items=items)


@router.get("/instances/{server_id}/action-log")
async def instance_action_log(
    server_id: str, ctx: ContextDep
) -> Items[InstanceAction]:
    items = await compute.instance_action_log(ctx, server_id)
    return Items[InstanceAction](items=items)


@router.get("/instances/{server_id}/console-output")
async def console_output(
    server_id: str,
    ctx: ContextDep,
    length: Annotated[int | None, Query(ge=1, le=100000)] = None,
) -> ConsoleOutput:
    return await compute.console_output(ctx, server_id, length)


@router.post("/instances/{server_id}/console")
async def console(
    server_id: str, ctx: ContextDep, body: ConsoleRequest | None = None
) -> RemoteConsole:
    kind = body.type if body else "novnc"
    return await compute.remote_console(ctx, server_id, kind)


@router.get("/instances/{server_id}/password")
async def server_password(server_id: str, ctx: ContextDep) -> ServerPassword:
    return await compute.server_password(ctx, server_id)


@router.get("/instances/{server_id}/resize-flavors")
async def resize_flavors(server_id: str, ctx: ContextDep) -> Items[Flavor]:
    return Items[Flavor](items=await compute.resize_flavors(ctx, server_id))


@router.post("/instances/{server_id}/actions", status_code=202)
async def instance_action(
    server_id: str, body: InstanceActionRequest, ctx: ContextDep
) -> ActionResult:
    return await instance_actions.perform(ctx, server_id, body)


@router.get("/flavors")
async def flavors(ctx: ContextDep) -> Items[Flavor]:
    return Items[Flavor](items=await compute.flavors(ctx))


@router.get("/availability-zones")
async def availability_zones(ctx: ContextDep) -> Items[AvailabilityZone]:
    items = await compute.availability_zones(ctx)
    return Items[AvailabilityZone](items=items)


@router.get("/limits")
async def limits(ctx: ContextDep) -> ComputeLimits:
    return await compute.limits(ctx)


@router.get("/images")
async def list_images(
    ctx: ContextDep,
    visibility: str | None = None,
    q: str | None = None,
    snapshots: bool = False,
) -> Items[Image]:
    items = await compute.list_images(ctx, visibility, q, snapshots)
    return Items[Image](items=items)


@router.post("/images", status_code=201)
async def create_image(body: ImageCreate, ctx: ContextDep) -> Image:
    return await compute.create_image(ctx, body)


@router.put("/images/{image_id}/file")
async def upload_image_file(
    image_id: str, request: Request, ctx: ContextDep
) -> Image:
    length = request.headers.get("content-length")
    return await compute.upload_image_file(
        ctx, image_id, request.stream(), length
    )


@router.get("/images/{image_id}")
async def get_image(image_id: str, ctx: ContextDep) -> Image:
    return await compute.get_image(ctx, image_id)


@router.patch("/images/{image_id}")
async def update_image(
    image_id: str, body: ImageUpdate, ctx: ContextDep
) -> Image:
    return await compute.update_image(ctx, image_id, body)


@router.delete("/images/{image_id}", status_code=204)
async def delete_image(image_id: str, ctx: ContextDep) -> Response:
    await compute.delete_image(ctx, image_id)
    return Response(status_code=204)


@router.get("/keypairs")
async def list_keypairs(ctx: ContextDep) -> Items[KeyPair]:
    return Items[KeyPair](items=await compute.list_keypairs(ctx))


@router.post("/keypairs", status_code=201)
async def create_keypair(
    body: KeypairCreate, ctx: ContextDep
) -> KeyPairCreated:
    return await compute.create_keypair(ctx, body)


@router.get("/keypairs/{name}")
async def get_keypair(name: str, ctx: ContextDep) -> KeyPairDetail:
    return await compute.get_keypair(ctx, name)


@router.delete("/keypairs/{name}", status_code=204)
async def delete_keypair(name: str, ctx: ContextDep) -> Response:
    await compute.delete_keypair(ctx, name)
    return Response(status_code=204)


@router.get("/server-groups")
async def list_server_groups(ctx: ContextDep) -> Items[ServerGroup]:
    return Items[ServerGroup](items=await compute.list_server_groups(ctx))


@router.post("/server-groups", status_code=201)
async def create_server_group(
    body: ServerGroupCreate, ctx: ContextDep
) -> ServerGroup:
    return await compute.create_server_group(ctx, body)


@router.delete("/server-groups/{group_id}", status_code=204)
async def delete_server_group(group_id: str, ctx: ContextDep) -> Response:
    await compute.delete_server_group(ctx, group_id)
    return Response(status_code=204)
