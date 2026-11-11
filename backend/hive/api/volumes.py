"""Volume endpoints: volumes, snapshots and backups."""

from typing import Annotated

from fastapi import APIRouter, Query, Response

from hive.deps import ContextDep
from hive.schemas.responses import Accepted, AvailabilityZone, Items
from hive.schemas.responses.volumes import (
    RestoreResult,
    RestoreResultNewVolume,
    Volume,
    VolumeAttached,
    VolumeBackup,
    VolumeExtended,
    VolumeLimits,
    VolumeMetadataSaved,
    VolumeOptions,
    VolumeSnapshot,
    VolumeTransferAccepted,
    VolumeTransferCreated,
    VolumeType,
    VolumeUploadedToImage,
)
from hive.schemas.volumes import (
    AttachRequest,
    DetachRequest,
    ExtendRequest,
    MetadataUpdate,
    RestoreRequest,
    RetypeRequest,
    TransferAccept,
    TransferCreate,
    UploadToImageRequest,
    VolumeBackupCreate,
    VolumeCreate,
    VolumeListQuery,
    VolumeSnapshotCreate,
    VolumeSnapshotUpdate,
    VolumeUpdate,
)
from hive.services import volume_types as volume_types_service
from hive.services import volumes

router = APIRouter(prefix="/volumes", tags=["volumes"])


# Fixed paths first, so they are not taken for a volume id.


@router.get("")
async def list_volumes(
    query: Annotated[VolumeListQuery, Query()], ctx: ContextDep
) -> Items[Volume]:
    return Items[Volume](items=await volumes.list_volumes(ctx, query))


@router.post("", status_code=202)
async def create_volume(body: VolumeCreate, ctx: ContextDep) -> Volume:
    return await volumes.create_volume(ctx, body)


@router.get("/options")
async def create_options(ctx: ContextDep) -> VolumeOptions:
    return await volumes.create_options(ctx)


@router.get("/limits")
async def limits(ctx: ContextDep) -> VolumeLimits:
    return await volumes.limits(ctx)


@router.get("/availability-zones")
async def availability_zones(ctx: ContextDep) -> Items[AvailabilityZone]:
    return Items[AvailabilityZone](items=await volumes.availability_zones(ctx))


@router.get("/types")
async def volume_types(ctx: ContextDep) -> Items[VolumeType]:
    return Items[VolumeType](
        items=await volume_types_service.volume_types(ctx)
    )


@router.post("/transfers/accept")
async def accept_transfer(
    body: TransferAccept, ctx: ContextDep
) -> VolumeTransferAccepted:
    return await volumes.accept_transfer(ctx, body)


@router.get("/snapshots")
async def list_snapshots(ctx: ContextDep) -> Items[VolumeSnapshot]:
    return Items[VolumeSnapshot](items=await volumes.list_snapshots(ctx))


@router.post("/snapshots", status_code=202)
async def create_snapshot(
    body: VolumeSnapshotCreate, ctx: ContextDep
) -> VolumeSnapshot:
    return await volumes.create_snapshot(ctx, body)


@router.get("/snapshots/{snapshot_id}")
async def get_snapshot(snapshot_id: str, ctx: ContextDep) -> VolumeSnapshot:
    return await volumes.get_snapshot(ctx, snapshot_id)


@router.patch("/snapshots/{snapshot_id}")
async def update_snapshot(
    snapshot_id: str, body: VolumeSnapshotUpdate, ctx: ContextDep
) -> VolumeSnapshot:
    return await volumes.update_snapshot(ctx, snapshot_id, body)


@router.put("/snapshots/{snapshot_id}/metadata")
async def set_snapshot_metadata(
    snapshot_id: str, body: MetadataUpdate, ctx: ContextDep
) -> VolumeMetadataSaved:
    return await volumes.set_snapshot_metadata(ctx, snapshot_id, body)


@router.delete("/snapshots/{snapshot_id}", status_code=204)
async def delete_snapshot(snapshot_id: str, ctx: ContextDep) -> Response:
    await volumes.delete_snapshot(ctx, snapshot_id)
    return Response(status_code=204)


@router.get("/backups")
async def list_backups(ctx: ContextDep) -> Items[VolumeBackup]:
    return Items[VolumeBackup](items=await volumes.list_backups(ctx))


@router.post("/backups", status_code=202)
async def create_backup(
    body: VolumeBackupCreate, ctx: ContextDep
) -> VolumeBackup:
    return await volumes.create_backup(ctx, body)


@router.get("/backups/{backup_id}")
async def get_backup(backup_id: str, ctx: ContextDep) -> VolumeBackup:
    return await volumes.get_backup(ctx, backup_id)


@router.delete("/backups/{backup_id}", status_code=204)
async def delete_backup(
    backup_id: str, ctx: ContextDep, force: bool = False
) -> Response:
    await volumes.delete_backup(ctx, backup_id, force)
    return Response(status_code=204)


@router.post("/backups/{backup_id}/restore", status_code=202)
async def restore_backup(
    backup_id: str, body: RestoreRequest, ctx: ContextDep
) -> RestoreResult | RestoreResultNewVolume:
    return await volumes.restore_backup(ctx, backup_id, body)


@router.get("/{volume_id}")
async def get_volume(volume_id: str, ctx: ContextDep) -> Volume:
    return await volumes.get_volume(ctx, volume_id)


@router.patch("/{volume_id}")
async def update_volume(
    volume_id: str, body: VolumeUpdate, ctx: ContextDep
) -> Volume:
    return await volumes.update_volume(ctx, volume_id, body)


@router.delete("/{volume_id}", status_code=204)
async def delete_volume(volume_id: str, ctx: ContextDep) -> Response:
    await volumes.delete_volume(ctx, volume_id)
    return Response(status_code=204)


@router.put("/{volume_id}/metadata")
async def set_volume_metadata(
    volume_id: str, body: MetadataUpdate, ctx: ContextDep
) -> VolumeMetadataSaved:
    return await volumes.set_volume_metadata(ctx, volume_id, body)


@router.post("/{volume_id}/retype", status_code=202)
async def retype_volume(
    volume_id: str, body: RetypeRequest, ctx: ContextDep
) -> Accepted:
    return await volumes.retype_volume(ctx, volume_id, body)


@router.post("/{volume_id}/transfer", status_code=201)
async def create_transfer(
    volume_id: str, body: TransferCreate, ctx: ContextDep
) -> VolumeTransferCreated:
    return await volumes.create_transfer(ctx, volume_id, body)


@router.delete("/{volume_id}/transfer", status_code=204)
async def cancel_transfer(volume_id: str, ctx: ContextDep) -> Response:
    await volumes.cancel_transfer(ctx, volume_id)
    return Response(status_code=204)


@router.post("/{volume_id}/extend", status_code=202)
async def extend_volume(
    volume_id: str, body: ExtendRequest, ctx: ContextDep
) -> VolumeExtended:
    return await volumes.extend_volume(ctx, volume_id, body.new_size)


@router.post("/{volume_id}/attach", status_code=202)
async def attach_volume(
    volume_id: str, body: AttachRequest, ctx: ContextDep
) -> VolumeAttached:
    return await volumes.attach_volume(
        ctx, volume_id, body.instance_id, body.device
    )


@router.post("/{volume_id}/detach", status_code=202)
async def detach_volume(
    volume_id: str, body: DetachRequest, ctx: ContextDep
) -> Accepted:
    return await volumes.detach_volume(ctx, volume_id, body.instance_id)


@router.post("/{volume_id}/upload-to-image", status_code=202)
async def upload_to_image(
    volume_id: str, body: UploadToImageRequest, ctx: ContextDep
) -> VolumeUploadedToImage:
    return await volumes.upload_to_image(ctx, volume_id, body)
