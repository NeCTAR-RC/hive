"""Compute endpoints: instances, flavours, images, key pairs, server
groups, availability zones, limits and the launch wizard data."""

from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, Response

from hive.deps import get_context
from hive.errors import BadRequest, PayloadTooLarge
from hive.schemas.compute import (
    ActionRequest,
    ConsoleRequest,
    ImageCreate,
    ImageUpdate,
    KeypairCreate,
    LaunchRequest,
    ServerGroupCreate,
    ServerUpdate,
)
from hive.services import compute
from hive.services.context import Context

router = APIRouter(prefix="/compute", tags=["compute"])


# --- instances ---------------------------------------------------------------


@router.get("/instances")
async def list_instances(
    request: Request,
    limit: int = Query(default=50, ge=1, le=1000),
    marker: str | None = Query(default=None, max_length=255),
    sort_key: str | None = Query(default=None, max_length=64),
    sort_dir: Literal["asc", "desc"] = "desc",
    ctx: Context = Depends(get_context),
):
    # The nova filters stay pass-through (``compute.SERVER_FILTERS``).
    query = {
        key: value
        for key, value in request.query_params.items()
        if key in compute.SERVER_FILTERS
    }
    query.update(
        limit=limit, marker=marker, sort_key=sort_key, sort_dir=sort_dir
    )
    return await compute.list_instances(ctx, query)


@router.get("/launch-options")
async def launch_options(ctx: Context = Depends(get_context)):
    return await compute.launch_options(ctx)


@router.post("/instances", status_code=202)
async def launch(body: LaunchRequest, ctx: Context = Depends(get_context)):
    return await compute.launch(ctx, body)


@router.get("/instances/{server_id}")
async def get_instance(server_id: str, ctx: Context = Depends(get_context)):
    return await compute.get_instance(ctx, server_id)


@router.patch("/instances/{server_id}")
async def update_instance(
    server_id: str, body: ServerUpdate, ctx: Context = Depends(get_context)
):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise BadRequest("nothing to update")
    server = await ctx.nova.update_server(server_id, fields)
    return compute.server_summary(ctx, server)


@router.delete("/instances/{server_id}", status_code=204)
async def delete_instance(server_id: str, ctx: Context = Depends(get_context)):
    await ctx.nova.delete_server(server_id)
    return Response(status_code=204)


@router.get("/instances/{server_id}/volumes")
async def instance_volumes(
    server_id: str, ctx: Context = Depends(get_context)
):
    return {"items": await compute.instance_volumes(ctx, server_id)}


@router.get("/instances/{server_id}/ports")
async def instance_ports(server_id: str, ctx: Context = Depends(get_context)):
    return {"items": await compute.instance_ports(ctx, server_id)}


@router.get("/instances/{server_id}/action-log")
async def instance_action_log(
    server_id: str, ctx: Context = Depends(get_context)
):
    return {"items": await compute.instance_action_log(ctx, server_id)}


@router.get("/instances/{server_id}/console-output")
async def console_output(
    server_id: str,
    length: int | None = Query(default=None, ge=1, le=100000),
    ctx: Context = Depends(get_context),
):
    return {"output": await ctx.nova.console_output(server_id, length)}


@router.post("/instances/{server_id}/console")
async def console(
    server_id: str,
    body: ConsoleRequest | None = None,
    ctx: Context = Depends(get_context),
):
    kind = body.type if body else "novnc"
    console = await ctx.nova.remote_console(server_id, kind)
    return {"url": console.get("url"), "type": console.get("type")}


@router.get("/instances/{server_id}/password")
async def server_password(server_id: str, ctx: Context = Depends(get_context)):
    """The encrypted admin password; decryption with the key pair's
    private key happens in the browser, as in Horizon."""
    return {"encrypted_password": await ctx.nova.server_password(server_id)}


@router.get("/instances/{server_id}/resize-flavors")
async def resize_flavors(server_id: str, ctx: Context = Depends(get_context)):
    return {"items": await compute.resize_flavors(ctx, server_id)}


@router.post("/instances/{server_id}/actions/{action}", status_code=202)
async def instance_action(
    server_id: str,
    action: str,
    body: ActionRequest | None = None,
    ctx: Context = Depends(get_context),
):
    payload = body.model_dump(exclude_none=True) if body else {}
    return await compute.perform_action(ctx, server_id, action, payload)


# --- reference data ------------------------------------------------------------


@router.get("/flavors")
async def flavors(ctx: Context = Depends(get_context)):
    return {"items": await compute.flavors(ctx)}


@router.get("/availability-zones")
async def availability_zones(ctx: Context = Depends(get_context)):
    return {"items": await compute.availability_zones(ctx)}


@router.get("/limits")
async def limits(ctx: Context = Depends(get_context)):
    return await ctx.nova.limits()


# --- images -------------------------------------------------------------------


@router.get("/images")
async def list_images(
    visibility: str | None = None,
    q: str | None = None,
    snapshots: bool = False,
    ctx: Context = Depends(get_context),
):
    groups = await compute.all_images(ctx)
    rules = ctx.image_rules
    wanted = [visibility] if visibility else list(groups)
    items = []
    needle = (q or "").strip().lower()
    for key in wanted:
        for image in groups.get(key, []):
            if rules.is_snapshot(image) != snapshots:
                continue
            if needle and needle not in (image.get("name") or "").lower():
                continue
            if not rules.visible_in_picker(
                image, ctx.project_id, bool(needle)
            ):
                continue
            items.append(rules.summary(image, ctx.project_id))
    items.sort(key=lambda i: (i["name"] or "").lower())
    return {"items": items}


@router.post("/images", status_code=201)
async def create_image(body: ImageCreate, ctx: Context = Depends(get_context)):
    rules = ctx.image_rules
    fields: dict = {
        **rules.create_defaults(),
        "name": body.name,
        "disk_format": body.disk_format,
        "container_format": body.container_format,
        "min_disk": body.min_disk,
        "min_ram": body.min_ram,
        "protected": body.protected,
    }
    if body.visibility:
        fields["visibility"] = body.visibility
    for key, value in body.properties.items():
        if not rules.is_custom_property(key):
            raise BadRequest(f"'{key}' is a reserved property")
        fields[key] = value
    image = await ctx.glance.create_image(fields)
    if body.source_url:
        await ctx.glance.import_image(image["id"], body.source_url)
    await compute.invalidate_project_images(ctx, image.get("visibility"))
    return rules.summary(image, ctx.project_id)


@router.put("/images/{image_id}/file")
async def upload_image_file(
    image_id: str, request: Request, ctx: Context = Depends(get_context)
):
    """Stream an image file from the browser to glance.

    The SPA creates the image record first (POST /images without a
    source_url) and then PUTs the bytes here; glance makes the image
    active once they land. Horizon's "File" source does the same through
    its own web server (HORIZON_IMAGES_UPLOAD_MODE=legacy).
    """
    length = request.headers.get("content-length")
    if not length or not length.isdigit():
        raise BadRequest("Content-Length is required")
    size = int(length)
    limit = ctx.settings.image_upload_max_bytes
    if size > limit:
        raise PayloadTooLarge(
            f"image files are limited to {limit // 1024**3} GB",
            extra={"limit": limit},
        )
    if size == 0:
        raise BadRequest("the file is empty")
    await ctx.glance.upload_image_file(
        image_id, request.stream(), size, ctx.settings.image_upload_timeout
    )
    await compute.invalidate_project_images(ctx)
    return ctx.image_rules.summary(
        await ctx.glance.image(image_id), ctx.project_id
    )


@router.get("/images/{image_id}")
async def get_image(image_id: str, ctx: Context = Depends(get_context)):
    return ctx.image_rules.summary(
        await ctx.glance.image(image_id), ctx.project_id
    )


@router.patch("/images/{image_id}")
async def update_image(
    image_id: str, body: ImageUpdate, ctx: Context = Depends(get_context)
):
    rules = ctx.image_rules
    patch = []
    for key in ("name", "visibility", "min_disk", "min_ram", "protected"):
        value = getattr(body, key)
        if value is not None:
            patch.append({"op": "replace", "path": f"/{key}", "value": value})
    for key, value in (body.properties or {}).items():
        if not rules.is_custom_property(key):
            raise BadRequest(f"'{key}' is a reserved property")
        if value is None:
            patch.append({"op": "remove", "path": f"/{key}"})
        else:
            patch.append({"op": "add", "path": f"/{key}", "value": value})
    if not patch:
        raise BadRequest("nothing to update")
    image = await ctx.glance.patch_image(image_id, patch)
    # A visibility change moves the image between listings: drop the
    # global public and community ones it may have left or joined too.
    await compute.invalidate_project_images(
        ctx, *(("public", "community") if body.visibility else ())
    )
    return rules.summary(image, ctx.project_id)


@router.delete("/images/{image_id}", status_code=204)
async def delete_image(image_id: str, ctx: Context = Depends(get_context)):
    await ctx.glance.delete_image(image_id)
    await compute.invalidate_project_images(ctx)
    return Response(status_code=204)


# --- key pairs and server groups ------------------------------------------------


@router.get("/keypairs")
async def list_keypairs(ctx: Context = Depends(get_context)):
    return {
        "items": [
            {
                "name": k.get("name"),
                "type": k.get("type"),
                "fingerprint": k.get("fingerprint"),
                "public_key": k.get("public_key"),
            }
            for k in await ctx.nova.keypairs()
        ]
    }


@router.post("/keypairs", status_code=201)
async def create_keypair(
    body: KeypairCreate, ctx: Context = Depends(get_context)
):
    fields: dict = {"name": body.name, "type": body.type}
    if body.public_key:
        fields["public_key"] = body.public_key
    keypair = await ctx.nova.create_keypair(fields)
    return {
        "name": keypair.get("name"),
        "type": keypair.get("type"),
        "fingerprint": keypair.get("fingerprint"),
        "public_key": keypair.get("public_key"),
        # Only ever returned here, once, for a generated key pair.
        "private_key": keypair.get("private_key"),
    }


@router.get("/keypairs/{name}")
async def get_keypair(name: str, ctx: Context = Depends(get_context)):
    keypair = await ctx.nova.keypair(name)
    return {
        "name": keypair.get("name"),
        "type": keypair.get("type"),
        "fingerprint": keypair.get("fingerprint"),
        "public_key": keypair.get("public_key"),
        "created_at": keypair.get("created_at"),
    }


@router.delete("/keypairs/{name}", status_code=204)
async def delete_keypair(name: str, ctx: Context = Depends(get_context)):
    await ctx.nova.delete_keypair(name)
    return Response(status_code=204)


@router.get("/server-groups")
async def list_server_groups(ctx: Context = Depends(get_context)):
    return {
        "items": [
            {
                "id": g.get("id"),
                "name": g.get("name"),
                "policy": g.get("policy"),
                "members": g.get("members") or [],
            }
            for g in await ctx.nova.server_groups()
        ]
    }


@router.post("/server-groups", status_code=201)
async def create_server_group(
    body: ServerGroupCreate, ctx: Context = Depends(get_context)
):
    group = await ctx.nova.create_server_group(
        {"name": body.name, "policy": body.policy}
    )
    return {
        "id": group.get("id"),
        "name": group.get("name"),
        "policy": group.get("policy"),
        "members": group.get("members") or [],
    }


@router.delete("/server-groups/{group_id}", status_code=204)
async def delete_server_group(
    group_id: str, ctx: Context = Depends(get_context)
):
    await ctx.nova.delete_server_group(group_id)
    return Response(status_code=204)
