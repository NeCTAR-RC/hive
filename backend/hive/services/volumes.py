"""Volumes, snapshots and backups: Cinder listings shaped for the SPA,
with the Nectar rules applied on create and restore."""

import asyncio

from hive.errors import BadRequest, HiveError
from hive.services import compute
from hive.services.context import Context

AZ_TTL = 600
AZ_STALE = 3600
TYPES_TTL = 600
TYPES_STALE = 3600
# As Horizon (API_RESULT_LIMIT 1000): one listing, paged in the browser.
LIST_LIMIT = 1000


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
                "attached_at": a.get("attached_at"),
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
        "created_at": volume.get("created_at"),
        "updated_at": volume.get("updated_at"),
        "has_snapshots": has_snapshots,
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
        "volume_name": (volume_names or {}).get(volume_id),
        "progress": snapshot.get("os-extended-snapshot-attributes:progress"),
        "group_snapshot_id": snapshot.get("group_snapshot_id"),
        "metadata": snapshot.get("metadata") or {},
        "created_at": snapshot.get("created_at"),
        "updated_at": snapshot.get("updated_at"),
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
        "volume_name": (volume_names or {}).get(volume_id),
        "snapshot_id": snapshot_id,
        "snapshot_name": (snapshot_names or {}).get(snapshot_id),
        "container": backup.get("container"),
        "is_incremental": bool(backup.get("is_incremental")),
        "has_dependent_backups": bool(backup.get("has_dependent_backups")),
        "data_timestamp": backup.get("data_timestamp"),
        "fail_reason": backup.get("fail_reason"),
        "created_at": backup.get("created_at"),
        "updated_at": backup.get("updated_at"),
    }


def _names(items: list[dict]) -> dict[str, str]:
    names: dict[str, str] = {}
    for item in items:
        if item.get("id"):
            names[str(item["id"])] = item.get("name") or ""
    return names


# --- volumes -------------------------------------------------------------------


async def list_volumes(ctx: Context, query: dict) -> dict:
    params: dict = {"limit": LIST_LIMIT}
    for key in ("status", "name", "bootable", "availability_zone"):
        if query.get(key):
            params[key] = query[key]
    volumes, snapshots = await asyncio.gather(
        ctx.cinder.volumes(**params),
        ctx.cinder.snapshots(limit=LIST_LIMIT),
    )
    with_snapshots = {s.get("volume_id") for s in snapshots}
    return {
        "items": [
            volume_summary(v, v.get("id") in with_snapshots) for v in volumes
        ]
    }


async def get_volume(ctx: Context, volume_id: str) -> dict:
    volume, snapshots = await asyncio.gather(
        ctx.cinder.volume(volume_id),
        ctx.cinder.snapshots(volume_id=volume_id, limit=LIST_LIMIT),
    )
    return volume_summary(volume, bool(snapshots))


async def availability_zones(ctx: Context) -> list[dict]:
    result = await ctx.cache.get_or_fetch(
        ctx.cache.global_key("cinder-azs"),
        ctx.cinder.availability_zones,
        ttl=AZ_TTL,
        stale_ttl=AZ_STALE,
        name="volume-azs",
    )
    zones = [
        {
            "name": z.get("zoneName"),
            "available": bool((z.get("zoneState") or {}).get("available")),
        }
        for z in result.value
    ]
    zones.sort(key=lambda z: z["name"] or "")
    return zones


async def volume_types(ctx: Context) -> list[dict]:
    result = await ctx.cache.get_or_fetch(
        ctx.cache.global_key("cinder-types"),
        ctx.cinder.volume_types,
        ttl=TYPES_TTL,
        stale_ttl=TYPES_STALE,
        name="volume-types",
    )
    rules = ctx.volume_rules
    types = [rules.type_summary(t) for t in result.value]
    types.sort(key=lambda t: (t["name"] or "").lower())
    return types


async def limits(ctx: Context) -> dict:
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
    return out


async def create_options(ctx: Context) -> dict:
    """Everything the create volume and restore forms need, gathered in
    parallel; a failed section carries ``error`` instead of failing the
    whole payload."""

    async def guarded(name, coro):
        try:
            return name, await coro, None
        except HiveError as exc:
            return name, None, {"error": exc.code, "message": exc.message}

    async def images_section():
        groups = await compute.all_images(ctx)
        rules = ctx.image_rules
        items = []
        for key in ("private", "shared", "public", "community"):
            for image in groups.get(key, []):
                if image.get("status") != "active":
                    continue
                if not rules.visible_in_picker(image, ctx.project_id, False):
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

    async def snapshots_section():
        return [
            snapshot_summary(s)
            for s in await ctx.cinder.snapshots(limit=LIST_LIMIT)
            if s.get("status") == "available"
        ]

    async def volumes_section():
        return [
            volume_summary(v)
            for v in await ctx.cinder.volumes(limit=LIST_LIMIT)
            if v.get("status") in ("available", "in-use")
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
    payload["has_zoned_types"] = any(
        t.get("zones") for t in payload["volume_types"]
    )
    return payload


async def create_volume(ctx: Context, req) -> dict:
    source = None
    if req.source:
        if req.source.type == "snapshot":
            source = await ctx.cinder.snapshot(req.source.id)
        elif req.source.type == "volume":
            source = await ctx.cinder.volume(req.source.id)
        else:
            source = await ctx.glance.image(req.source.id)
    body = ctx.volume_rules.create_body(req, source)
    return volume_summary(await ctx.cinder.create_volume(body))


async def update_volume(ctx: Context, volume_id: str, req) -> dict:
    fields = {
        key: value
        for key, value in (
            ("name", req.name),
            ("description", req.description),
        )
        if value is not None
    }
    if not fields and req.bootable is None:
        raise BadRequest("nothing to update")
    if fields:
        await ctx.cinder.update_volume(volume_id, fields)
    if req.bootable is not None:
        await ctx.cinder.volume_action(
            volume_id, {"os-set_bootable": {"bootable": req.bootable}}
        )
    return await get_volume(ctx, volume_id)


async def extend_volume(ctx: Context, volume_id: str, new_size: int) -> dict:
    volume = await ctx.cinder.volume(volume_id)
    current = int(volume.get("size") or 0)
    if new_size <= current:
        raise BadRequest(
            f"New size must be greater than the current size ({current} GB)"
        )
    await ctx.cinder.volume_action(
        volume_id, {"os-extend": {"new_size": new_size}}
    )
    return {"status": "accepted", "size_gb": new_size}


async def attach_volume(
    ctx: Context, volume_id: str, instance_id: str, device: str | None
) -> dict:
    attachment = await ctx.nova.attach_volume(instance_id, volume_id, device)
    return {
        "status": "accepted",
        "device": attachment.get("device"),
        "server_id": attachment.get("serverId") or instance_id,
    }


async def detach_volume(ctx: Context, volume_id: str, instance_id: str):
    await ctx.nova.detach_volume(instance_id, volume_id)
    return {"status": "accepted"}


async def upload_to_image(ctx: Context, volume_id: str, req) -> dict:
    resp = await ctx.cinder.volume_action(
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
    data = (resp.json() or {}).get("os-volume_upload_image", {})
    await compute.invalidate_project_images(ctx)
    return {
        "status": "accepted",
        "image_id": data.get("image_id"),
        "image_name": data.get("image_name"),
    }


# --- snapshots -----------------------------------------------------------------


async def list_snapshots(ctx: Context) -> dict:
    snapshots, volumes = await asyncio.gather(
        ctx.cinder.snapshots(limit=LIST_LIMIT),
        ctx.cinder.volumes(limit=LIST_LIMIT),
    )
    names = _names(volumes)
    return {"items": [snapshot_summary(s, names) for s in snapshots]}


async def get_snapshot(ctx: Context, snapshot_id: str) -> dict:
    snapshot = await ctx.cinder.snapshot(snapshot_id)
    names: dict[str, str] = {}
    if snapshot.get("volume_id"):
        try:
            volume = await ctx.cinder.volume(snapshot["volume_id"])
            names = _names([volume])
        except HiveError:
            names = {}
    return snapshot_summary(snapshot, names)


async def create_snapshot(ctx: Context, req) -> dict:
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
    return snapshot_summary(snapshot, _names([volume]))


async def update_snapshot(ctx: Context, snapshot_id: str, req) -> dict:
    fields = req.model_dump(exclude_none=True)
    if not fields:
        raise BadRequest("nothing to update")
    await ctx.cinder.update_snapshot(snapshot_id, fields)
    return await get_snapshot(ctx, snapshot_id)


# --- backups -------------------------------------------------------------------


async def list_backups(ctx: Context) -> dict:
    backups, volumes, snapshots = await asyncio.gather(
        ctx.cinder.backups(limit=LIST_LIMIT),
        ctx.cinder.volumes(limit=LIST_LIMIT),
        ctx.cinder.snapshots(limit=LIST_LIMIT),
    )
    volume_names = _names(volumes)
    snapshot_names = _names(snapshots)
    return {
        "items": [
            backup_summary(b, volume_names, snapshot_names) for b in backups
        ]
    }


async def get_backup(ctx: Context, backup_id: str) -> dict:
    backup = await ctx.cinder.backup(backup_id)
    volume_names: dict[str, str] = {}
    snapshot_names: dict[str, str] = {}
    if backup.get("volume_id"):
        try:
            volume_names = _names(
                [await ctx.cinder.volume(backup["volume_id"])]
            )
        except HiveError:
            volume_names = {}
    if backup.get("snapshot_id"):
        try:
            snapshot_names = _names(
                [await ctx.cinder.snapshot(backup["snapshot_id"])]
            )
        except HiveError:
            snapshot_names = {}
    return backup_summary(backup, volume_names, snapshot_names)


async def create_backup(ctx: Context, req) -> dict:
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
    return backup_summary(backup, _names([volume]))


async def restore_backup(ctx: Context, backup_id: str, req) -> dict:
    if req.volume_id:
        restore = await ctx.cinder.restore_backup(
            backup_id, {"volume_id": req.volume_id}
        )
        return {
            "status": "accepted",
            "backup_id": backup_id,
            "volume_id": restore.get("volume_id") or req.volume_id,
            "new_volume": False,
        }
    backup = await ctx.cinder.backup(backup_id)
    body = ctx.volume_rules.restore_body(backup, req)
    volume = await ctx.cinder.create_volume(body)
    return {
        "status": "accepted",
        "backup_id": backup_id,
        "volume_id": volume.get("id"),
        "new_volume": True,
        "volume": volume_summary(volume),
    }
