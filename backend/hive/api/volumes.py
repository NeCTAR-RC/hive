"""Volume endpoints: volumes, snapshots and backups."""

from fastapi import APIRouter, Depends, Request, Response

from hive.api.compute import get_context
from hive.schemas.volumes import (
    AttachRequest,
    BackupCreate,
    DetachRequest,
    ExtendRequest,
    RestoreRequest,
    SnapshotCreate,
    SnapshotUpdate,
    UploadToImageRequest,
    VolumeCreate,
    VolumeUpdate,
)
from hive.services.context import Context
from hive.services import volumes

router = APIRouter(prefix="/volumes", tags=["volumes"])


# Fixed paths first, so they are not taken for a volume id.


@router.get("")
async def list_volumes(request: Request, ctx: Context = Depends(get_context)):
    return await volumes.list_volumes(ctx, dict(request.query_params))


@router.post("", status_code=202)
async def create_volume(
    body: VolumeCreate, ctx: Context = Depends(get_context)
):
    return await volumes.create_volume(ctx, body)


@router.get("/options")
async def create_options(ctx: Context = Depends(get_context)):
    return await volumes.create_options(ctx)


@router.get("/limits")
async def limits(ctx: Context = Depends(get_context)):
    return await volumes.limits(ctx)


@router.get("/availability-zones")
async def availability_zones(ctx: Context = Depends(get_context)):
    return {"items": await volumes.availability_zones(ctx)}


@router.get("/types")
async def volume_types(ctx: Context = Depends(get_context)):
    return {"items": await volumes.volume_types(ctx)}


# --- snapshots -----------------------------------------------------------------


@router.get("/snapshots")
async def list_snapshots(ctx: Context = Depends(get_context)):
    return await volumes.list_snapshots(ctx)


@router.post("/snapshots", status_code=202)
async def create_snapshot(
    body: SnapshotCreate, ctx: Context = Depends(get_context)
):
    return await volumes.create_snapshot(ctx, body)


@router.get("/snapshots/{snapshot_id}")
async def get_snapshot(snapshot_id: str, ctx: Context = Depends(get_context)):
    return await volumes.get_snapshot(ctx, snapshot_id)


@router.patch("/snapshots/{snapshot_id}")
async def update_snapshot(
    snapshot_id: str, body: SnapshotUpdate, ctx: Context = Depends(get_context)
):
    return await volumes.update_snapshot(ctx, snapshot_id, body)


@router.delete("/snapshots/{snapshot_id}", status_code=204)
async def delete_snapshot(
    snapshot_id: str, ctx: Context = Depends(get_context)
):
    await ctx.cinder.delete_snapshot(snapshot_id)
    return Response(status_code=204)


# --- backups -------------------------------------------------------------------


@router.get("/backups")
async def list_backups(ctx: Context = Depends(get_context)):
    return await volumes.list_backups(ctx)


@router.post("/backups", status_code=202)
async def create_backup(
    body: BackupCreate, ctx: Context = Depends(get_context)
):
    return await volumes.create_backup(ctx, body)


@router.get("/backups/{backup_id}")
async def get_backup(backup_id: str, ctx: Context = Depends(get_context)):
    return await volumes.get_backup(ctx, backup_id)


@router.delete("/backups/{backup_id}", status_code=204)
async def delete_backup(
    backup_id: str, force: bool = False, ctx: Context = Depends(get_context)
):
    await ctx.cinder.delete_backup(backup_id, force=force)
    return Response(status_code=204)


@router.post("/backups/{backup_id}/restore", status_code=202)
async def restore_backup(
    backup_id: str, body: RestoreRequest, ctx: Context = Depends(get_context)
):
    return await volumes.restore_backup(ctx, backup_id, body)


# --- one volume ----------------------------------------------------------------


@router.get("/{volume_id}")
async def get_volume(volume_id: str, ctx: Context = Depends(get_context)):
    return await volumes.get_volume(ctx, volume_id)


@router.patch("/{volume_id}")
async def update_volume(
    volume_id: str, body: VolumeUpdate, ctx: Context = Depends(get_context)
):
    return await volumes.update_volume(ctx, volume_id, body)


@router.delete("/{volume_id}", status_code=204)
async def delete_volume(volume_id: str, ctx: Context = Depends(get_context)):
    await ctx.cinder.delete_volume(volume_id)
    return Response(status_code=204)


@router.post("/{volume_id}/extend", status_code=202)
async def extend_volume(
    volume_id: str, body: ExtendRequest, ctx: Context = Depends(get_context)
):
    return await volumes.extend_volume(ctx, volume_id, body.new_size)


@router.post("/{volume_id}/attach", status_code=202)
async def attach_volume(
    volume_id: str, body: AttachRequest, ctx: Context = Depends(get_context)
):
    return await volumes.attach_volume(
        ctx, volume_id, body.instance_id, body.device
    )


@router.post("/{volume_id}/detach", status_code=202)
async def detach_volume(
    volume_id: str, body: DetachRequest, ctx: Context = Depends(get_context)
):
    return await volumes.detach_volume(ctx, volume_id, body.instance_id)


@router.post("/{volume_id}/upload-to-image", status_code=202)
async def upload_to_image(
    volume_id: str,
    body: UploadToImageRequest,
    ctx: Context = Depends(get_context),
):
    return await volumes.upload_to_image(ctx, volume_id, body)
