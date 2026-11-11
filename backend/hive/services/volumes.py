"""Volumes, snapshots and backups: Cinder listings shaped for the SPA,
with the Nectar rules applied on create and restore."""

import asyncio

from hive.cache import policy
from hive.errors import BadRequest, HiveError, NotFound
from hive.nectar.images import ImageRules
from hive.schemas.responses import Accepted, AvailabilityZone
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
    VolumeUploadedToImage,
)
from hive.schemas.volumes import (
    MetadataUpdate,
    RetypeRequest,
    TransferAccept,
    TransferCreate,
    VolumeListQuery,
)
from hive.services import compute
from hive.services.context import Context
from hive.services.names import names as names_by_id
from hive.services.volume_types import has_zoned_types, volume_types
from hive.times import to_utc_iso


def volume_summary(volume: dict, has_snapshots: bool | None = None) -> dict:
    image_meta = volume.get("volume_image_metadata") or {}
    return {
        "id": volume.get("id"),
        "name": volume.get("name") or "",
        "description": volume.get("description"),
        "size_gb": volume.get("size"),
        "status": volume.get("status"),
        "volume_type": volume.get("volume_type"),
        "availability_zone": volume.get("availability_zone"),
        "bootable": str(volume.get("bootable")).lower() == "true",
        "encrypted": bool(volume.get("encrypted")),
        "multiattach": bool(volume.get("multiattach")),
        "attachments": [
            {
                "id": a.get("attachment_id") or a.get("id"),
                "server_id": a.get("server_id"),
                "device": a.get("device"),
                "attached_at": to_utc_iso(a.get("attached_at")),
            }
            for a in volume.get("attachments") or []
        ],
        "snapshot_id": volume.get("snapshot_id"),
        "source_volume_id": volume.get("source_volid"),
        "image": (
            {
                "id": image_meta.get("image_id"),
                "name": image_meta.get("image_name"),
            }
            if image_meta.get("image_id")
            else None
        ),
        "group_id": volume.get("group_id"),
        "metadata": volume.get("metadata") or {},
        "created_at": to_utc_iso(volume.get("created_at")),
        "updated_at": to_utc_iso(volume.get("updated_at")),
        "has_snapshots": has_snapshots,
        "fault": None,
    }


def snapshot_summary(
    snapshot: dict, volume_names: dict[str, str] | None = None
) -> dict:
    volume_id = snapshot.get("volume_id")
    return {
        "id": snapshot.get("id"),
        "name": snapshot.get("name") or "",
        "description": snapshot.get("description"),
        "size_gb": snapshot.get("size"),
        "status": snapshot.get("status"),
        "volume_id": volume_id,
        "volume_name": (volume_names or {}).get(volume_id or ""),
        "progress": snapshot.get("os-extended-snapshot-attributes:progress"),
        "group_snapshot_id": snapshot.get("group_snapshot_id"),
        "metadata": snapshot.get("metadata") or {},
        "created_at": to_utc_iso(snapshot.get("created_at")),
        "updated_at": to_utc_iso(snapshot.get("updated_at")),
    }


def backup_summary(
    backup: dict,
    volume_names: dict[str, str] | None = None,
    snapshot_names: dict[str, str] | None = None,
) -> dict:
    volume_id = backup.get("volume_id")
    snapshot_id = backup.get("snapshot_id")
    return {
        "id": backup.get("id"),
        "name": backup.get("name") or "",
        "description": backup.get("description"),
        "size_gb": backup.get("size"),
        "status": backup.get("status"),
        "availability_zone": backup.get("availability_zone"),
        "volume_id": volume_id,
        "volume_name": (volume_names or {}).get(volume_id or ""),
        "snapshot_id": snapshot_id,
        "snapshot_name": (snapshot_names or {}).get(snapshot_id or ""),
        "container": backup.get("container"),
        "is_incremental": bool(backup.get("is_incremental")),
        "has_dependent_backups": bool(backup.get("has_dependent_backups")),
        "data_timestamp": to_utc_iso(backup.get("data_timestamp")),
        "fail_reason": backup.get("fail_reason"),
        "created_at": to_utc_iso(backup.get("created_at")),
        "updated_at": to_utc_iso(backup.get("updated_at")),
    }


async def list_volumes(ctx: Context, query: VolumeListQuery) -> list[Volume]:
    volumes, snapshots = await asyncio.gather(
        ctx.cinder.volumes(**query.cinder_params()),
        ctx.cinder.snapshots(),
    )
    with_snapshots = {s.get("volume_id") for s in snapshots}
    return [
        Volume.model_validate(volume_summary(v, v.get("id") in with_snapshots))
        for v in volumes
    ]


def latest_fault(messages: list[dict]) -> dict | None:
    """The newest of a volume's user messages, as the volume's fault."""
    dated = [m for m in messages if m.get("user_message")]
    if not dated:
        return None
    newest = max(dated, key=lambda m: m.get("created_at") or "")
    return {
        "message": newest["user_message"],
        "created": to_utc_iso(newest.get("created_at")),
    }


async def volume_fault(ctx: Context, volume_id: str) -> dict | None:
    """Why the volume is in error, from Cinder's user messages (Horizon
    ``volumes/tabs.py`` VolumeMessagesTab). The messages are a hint, so
    failing to read them leaves the fault out rather than failing the
    page."""
    try:
        messages = await ctx.cinder.messages(resource_uuid=volume_id)
    except HiveError:
        return None
    return latest_fault(messages)


async def get_volume(ctx: Context, volume_id: str) -> Volume:
    volume, snapshots = await asyncio.gather(
        ctx.cinder.volume(volume_id),
        ctx.cinder.snapshots(volume_id=volume_id),
    )
    summary = volume_summary(volume, bool(snapshots))
    if str(volume.get("status") or "").startswith("error"):
        summary["fault"] = await volume_fault(ctx, volume_id)
    return Volume.model_validate(summary)


async def availability_zones(ctx: Context) -> list[AvailabilityZone]:
    result = await ctx.cached(policy.CINDER_AZS, ctx.cinder.availability_zones)
    zones = [
        {
            "name": z.get("zoneName"),
            "available": bool((z.get("zoneState") or {}).get("available")),
        }
        for z in result.value
    ]
    zones.sort(key=lambda z: z["name"] or "")
    return [AvailabilityZone.model_validate(z) for z in zones]


async def limits(ctx: Context) -> VolumeLimits:
    """Cinder's absolute limits; -1 stays "unlimited", and the negative
    "used" figures Cinder sometimes reports become 0 (Horizon
    ``api/cinder.py`` tenant_absolute_limits)."""
    out = {}
    for key, value in (await ctx.cinder.limits()).items():
        if (
            isinstance(value, (int, float))
            and value < 0
            and key.startswith("total")
            and key.endswith("Used")
        ):
            out[key] = 0
        else:
            out[key] = value
    return VolumeLimits.model_validate(out)


def picker_images(
    groups: dict[str, list[dict]], rules: ImageRules, project_id: str
) -> list[dict]:
    """Active images the volume source picker offers, by name."""
    items = []
    for key in ("private", "shared", "public", "community"):
        for image in groups.get(key, []):
            if image.get("status") != "active":
                continue
            if not rules.visible_in_picker(image, project_id, False):
                continue
            items.append(
                {
                    "id": image.get("id"),
                    "name": image.get("name"),
                    "size": image.get("size"),
                    "min_disk": image.get("min_disk") or 0,
                    "disk_format": image.get("disk_format"),
                    "is_snapshot": rules.is_snapshot(image),
                }
            )
    items.sort(key=lambda i: (i["name"] or "").lower())
    return items


async def create_options(ctx: Context) -> VolumeOptions:
    """Everything the create volume and restore forms need, gathered in
    parallel; a failed section carries ``error`` instead of failing the
    whole payload."""

    async def guarded(name, coro):
        try:
            return name, await coro, None
        except HiveError as exc:
            return name, None, {"error": exc.code, "message": exc.message}

    async def images_section():
        return picker_images(
            await compute.all_images(ctx), ctx.image_rules, ctx.project_id
        )

    async def snapshots_section():
        return [
            snapshot_summary(s)
            for s in await ctx.cinder.snapshots()
            if s.get("status") == "available"
        ]

    async def volumes_section():
        # Only available volumes can be cloned (Horizon
        # ``dashboards/project/volumes/forms.py:416-425``).
        return [
            volume_summary(v)
            for v in await ctx.cinder.volumes()
            if v.get("status") == "available"
        ]

    results = await asyncio.gather(
        guarded("availability_zones", availability_zones(ctx)),
        guarded("volume_types", volume_types(ctx)),
        guarded("images", images_section()),
        guarded("snapshots", snapshots_section()),
        guarded("volumes", volumes_section()),
        guarded("limits", limits(ctx)),
    )
    payload: dict = {"errors": {}}
    for name, value, error in results:
        if error:
            payload["errors"][name] = error
        if value is None:
            value = {} if name == "limits" else []
        payload[name] = value
    payload["has_zoned_types"] = has_zoned_types(payload["volume_types"])
    return VolumeOptions.model_validate(payload)


async def create_volume(ctx: Context, req) -> Volume:
    source = None
    if req.source:
        if req.source.type == "snapshot":
            source = await ctx.cinder.snapshot(req.source.id)
        elif req.source.type == "volume":
            source = await ctx.cinder.volume(req.source.id)
        else:
            source = await ctx.glance.image(req.source.id)
    body = ctx.volume_rules.create_body(req, source)
    return Volume.model_validate(
        volume_summary(await ctx.cinder.create_volume(body))
    )


async def delete_volume(ctx: Context, volume_id: str) -> None:
    await ctx.cinder.delete_volume(volume_id)


async def update_volume(ctx: Context, volume_id: str, req) -> Volume:
    fields = {
        key: value
        for key, value in (
            ("name", req.name),
            ("description", req.description),
        )
        if value is not None
    }
    if fields:
        await ctx.cinder.update_volume(volume_id, fields)
    if req.bootable is not None:
        await ctx.cinder.volume_action(
            volume_id, {"os-set_bootable": {"bootable": req.bootable}}
        )
    return await get_volume(ctx, volume_id)


async def set_volume_metadata(
    ctx: Context, volume_id: str, req: MetadataUpdate
) -> VolumeMetadataSaved:
    """Horizon's metadata modal sets the changed keys and deletes the
    removed ones (``api/rest/cinder.py`` VolumeMetadata.patch); Cinder's
    replace call does both in one request."""
    saved = await ctx.cinder.set_volume_metadata(volume_id, req.metadata)
    return VolumeMetadataSaved(metadata=saved or {})


async def retype_volume(
    ctx: Context, volume_id: str, req: RetypeRequest
) -> Accepted:
    """Horizon's RetypeForm (``volumes/forms.py``), with the Nectar rules
    in ``VolumeRules.retype_body``."""
    volume, types = await asyncio.gather(
        ctx.cinder.volume(volume_id),
        ctx.cached(policy.VOLUME_TYPES, ctx.cinder.volume_types),
    )
    body = ctx.volume_rules.retype_body(volume, types.value, req)
    await ctx.cinder.volume_action(volume_id, body)
    return Accepted(status="accepted")


async def create_transfer(
    ctx: Context, volume_id: str, req: TransferCreate
) -> VolumeTransferCreated:
    """Horizon's CreateTransferForm (``volumes/forms.py``); the reply
    carries the authorisation key, which Cinder never shows again."""
    transfer = await ctx.cinder.create_transfer(
        {"volume_id": volume_id, "name": req.name}
    )
    return VolumeTransferCreated.model_validate(
        {
            "id": transfer.get("id"),
            "name": transfer.get("name"),
            "volume_id": transfer.get("volume_id") or volume_id,
            "auth_key": transfer.get("auth_key"),
            "created_at": to_utc_iso(transfer.get("created_at")),
        }
    )


async def cancel_transfer(ctx: Context, volume_id: str) -> None:
    """Horizon's DeleteTransfer (``volumes/tables.py``), found by volume
    as Horizon's ``api/cinder.py`` volume_get does."""
    transfers = await ctx.cinder.transfers()
    transfer = next(
        (t for t in transfers if t.get("volume_id") == volume_id), None
    )
    if transfer is None:
        raise NotFound("No transfer is waiting for this volume")
    await ctx.cinder.delete_transfer(transfer["id"])


async def accept_transfer(
    ctx: Context, req: TransferAccept
) -> VolumeTransferAccepted:
    """Horizon's AcceptTransferForm (``volumes/forms.py``)."""
    transfer = await ctx.cinder.accept_transfer(req.transfer_id, req.auth_key)
    return VolumeTransferAccepted.model_validate(
        {
            "id": transfer.get("id") or req.transfer_id,
            "name": transfer.get("name"),
            "volume_id": transfer.get("volume_id"),
        }
    )


async def extend_volume(
    ctx: Context, volume_id: str, new_size: int
) -> VolumeExtended:
    volume = await ctx.cinder.volume(volume_id)
    current = int(volume.get("size") or 0)
    if new_size <= current:
        raise BadRequest(
            f"New size must be greater than the current size ({current} GB)"
        )
    await ctx.cinder.volume_action(
        volume_id, {"os-extend": {"new_size": new_size}}
    )
    return VolumeExtended.model_validate(
        {"status": "accepted", "size_gb": new_size}
    )


async def attach_volume(
    ctx: Context, volume_id: str, instance_id: str, device: str | None
) -> VolumeAttached:
    attachment = await ctx.nova.attach_volume(instance_id, volume_id, device)
    return VolumeAttached.model_validate(
        {
            "status": "accepted",
            "device": attachment.get("device"),
            "server_id": attachment.get("serverId") or instance_id,
        }
    )


async def detach_volume(
    ctx: Context, volume_id: str, instance_id: str
) -> Accepted:
    await ctx.nova.detach_volume(instance_id, volume_id)
    return Accepted(status="accepted")


async def upload_to_image(
    ctx: Context, volume_id: str, req
) -> VolumeUploadedToImage:
    reply = await ctx.cinder.volume_action(
        volume_id,
        {
            "os-volume_upload_image": {
                "image_name": req.image_name,
                "disk_format": req.disk_format,
                "container_format": "bare",
                "force": req.force,
            }
        },
    )
    data = reply.get("os-volume_upload_image") or {}
    await compute.invalidate_project_images(ctx)
    return VolumeUploadedToImage.model_validate(
        {
            "status": "accepted",
            "image_id": data.get("image_id"),
            "image_name": data.get("image_name"),
        }
    )


async def list_snapshots(ctx: Context) -> list[VolumeSnapshot]:
    snapshots, volumes = await asyncio.gather(
        ctx.cinder.snapshots(),
        ctx.cinder.volumes(),
    )
    names = names_by_id(volumes)
    return [
        VolumeSnapshot.model_validate(snapshot_summary(s, names))
        for s in snapshots
    ]


async def get_snapshot(ctx: Context, snapshot_id: str) -> VolumeSnapshot:
    snapshot = await ctx.cinder.snapshot(snapshot_id)
    names: dict[str, str] = {}
    if snapshot.get("volume_id"):
        try:
            volume = await ctx.cinder.volume(snapshot["volume_id"])
            names = names_by_id([volume])
        except HiveError:
            names = {}
    return VolumeSnapshot.model_validate(snapshot_summary(snapshot, names))


async def create_snapshot(ctx: Context, req) -> VolumeSnapshot:
    volume = await ctx.cinder.volume(req.volume_id)
    # Horizon's CreateSnapshotForm forces the snapshot of an attached volume.
    snapshot = await ctx.cinder.create_snapshot(
        {
            "volume_id": req.volume_id,
            "name": req.name or None,
            "description": req.description or None,
            "force": volume.get("status") == "in-use",
        }
    )
    return VolumeSnapshot.model_validate(
        snapshot_summary(snapshot, names_by_id([volume]))
    )


async def delete_snapshot(ctx: Context, snapshot_id: str) -> None:
    await ctx.cinder.delete_snapshot(snapshot_id)


async def update_snapshot(
    ctx: Context, snapshot_id: str, req
) -> VolumeSnapshot:
    await ctx.cinder.update_snapshot(snapshot_id, req.changes())
    return await get_snapshot(ctx, snapshot_id)


async def set_snapshot_metadata(
    ctx: Context, snapshot_id: str, req: MetadataUpdate
) -> VolumeMetadataSaved:
    """As ``set_volume_metadata``, for a snapshot (Horizon
    ``api/rest/cinder.py`` VolumeSnapshotMetadata.patch)."""
    saved = await ctx.cinder.set_snapshot_metadata(snapshot_id, req.metadata)
    return VolumeMetadataSaved(metadata=saved or {})


async def list_backups(ctx: Context) -> list[VolumeBackup]:
    backups, volumes, snapshots = await asyncio.gather(
        ctx.cinder.backups(),
        ctx.cinder.volumes(),
        ctx.cinder.snapshots(),
    )
    volume_names = names_by_id(volumes)
    snapshot_names = names_by_id(snapshots)
    return [
        VolumeBackup.model_validate(
            backup_summary(b, volume_names, snapshot_names)
        )
        for b in backups
    ]


async def get_backup(ctx: Context, backup_id: str) -> VolumeBackup:
    backup = await ctx.cinder.backup(backup_id)
    volume_names: dict[str, str] = {}
    snapshot_names: dict[str, str] = {}
    if backup.get("volume_id"):
        try:
            volume_names = names_by_id(
                [await ctx.cinder.volume(backup["volume_id"])]
            )
        except HiveError:
            volume_names = {}
    if backup.get("snapshot_id"):
        try:
            snapshot_names = names_by_id(
                [await ctx.cinder.snapshot(backup["snapshot_id"])]
            )
        except HiveError:
            snapshot_names = {}
    return VolumeBackup.model_validate(
        backup_summary(backup, volume_names, snapshot_names)
    )


async def create_backup(ctx: Context, req) -> VolumeBackup:
    volume = await ctx.cinder.volume(req.volume_id)
    # Horizon's CreateBackupForm forces the backup of an attached volume.
    backup = await ctx.cinder.create_backup(
        {
            "volume_id": req.volume_id,
            "name": req.name,
            "description": req.description or None,
            "container": req.container or None,
            "incremental": req.incremental,
            "force": volume.get("status") == "in-use",
            "snapshot_id": req.snapshot_id or None,
        }
    )
    return VolumeBackup.model_validate(
        backup_summary(backup, names_by_id([volume]))
    )


async def restore_backup(
    ctx: Context, backup_id: str, req
) -> RestoreResult | RestoreResultNewVolume:
    if req.volume_id:
        restore = await ctx.cinder.restore_backup(
            backup_id, {"volume_id": req.volume_id}
        )
        return RestoreResult.model_validate(
            {
                "status": "accepted",
                "backup_id": backup_id,
                "volume_id": restore.get("volume_id") or req.volume_id,
                "new_volume": False,
            }
        )
    backup = await ctx.cinder.backup(backup_id)
    body = ctx.volume_rules.restore_body(backup, req)
    volume = await ctx.cinder.create_volume(body)
    return RestoreResultNewVolume.model_validate(
        {
            "status": "accepted",
            "backup_id": backup_id,
            "volume_id": volume.get("id"),
            "new_volume": True,
            "volume": volume_summary(volume),
        }
    )


async def delete_backup(ctx: Context, backup_id: str, force: bool) -> None:
    """``force`` is Cinder's force-delete action, for a backup stuck in a
    transitional state."""
    await ctx.cinder.delete_backup(backup_id, force=force)
