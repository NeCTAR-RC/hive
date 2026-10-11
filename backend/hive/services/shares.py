"""Share (Manila): shares, snapshots, access rules, security services,
share groups and share group snapshots."""

import asyncio

from hive.clients.manila import ManilaClient
from hive.errors import BadRequest, Conflict, QuotaExceeded
from hive.nectar import shares as rules
from hive.schemas.shares import (
    AccessRuleCreate,
    SecurityServiceCreate,
    SecurityServiceUpdate,
    ShareCreate,
    ShareGroupCreate,
    ShareGroupSnapshotCreate,
    ShareGroupUpdate,
    ShareMetadata,
    ShareResize,
    ShareRevert,
    ShareUpdate,
    SnapshotAccessCreate,
    SnapshotCreate,
    SnapshotUpdate,
)
from hive.services.context import Context

STATIC_TTL = 600
STATIC_STALE = 3600


def _manila(ctx: Context) -> ManilaClient:
    return ManilaClient(ctx.http, ctx.settings, ctx.scoped)


async def limits(ctx: Context) -> dict:
    return await _manila(ctx).limits()


async def _share_types(ctx: Context) -> list[dict]:
    async def fetch():
        return [
            rules.share_type_summary(t)
            for t in await _manila(ctx).share_types()
        ]

    result = await ctx.cache.get_or_fetch(
        ctx.cache.project_key(ctx.project_id, "share-types"),
        fetch,
        ttl=STATIC_TTL,
        stale_ttl=STATIC_STALE,
        name="share-types",
    )
    return result.value


async def _zones(ctx: Context) -> list[str]:
    async def fetch():
        zones = await _manila(ctx).availability_zones()
        return sorted(z.get("name") for z in zones if z.get("name"))

    result = await ctx.cache.get_or_fetch(
        ctx.cache.global_key("manila-azs"),
        fetch,
        ttl=STATIC_TTL,
        stale_ttl=STATIC_STALE,
        name="manila-azs",
    )
    return result.value


async def options(ctx: Context) -> dict:
    """Pickers for the create forms plus the quota state behind the create
    and snapshot buttons."""
    manila = _manila(ctx)
    types, zones, quota, snapshots, groups, group_types = await asyncio.gather(
        _share_types(ctx),
        _zones(ctx),
        manila.limits(),
        manila.snapshots(),
        manila.share_groups(),
        manila.share_group_types(),
    )
    protocols = list(ctx.settings.manila_share_protocols)
    can_create, create_reason = rules.can_create(quota)
    can_snapshot, snapshot_reason = rules.can_snapshot(quota)
    return {
        "protocols": protocols,
        "share_types": [
            t for t in types if not t["driver_handles_share_servers"]
        ],
        "availability_zones": zones,
        "snapshots": [
            {
                "id": s.get("id"),
                "name": s.get("name"),
                "size": s.get("size"),
                "share_id": s.get("share_id"),
            }
            for s in snapshots
            if (s.get("status") or "").lower() == "available"
        ],
        "share_groups": [
            {
                "id": g.get("id"),
                "name": g.get("name"),
                "availability_zone": g.get("availability_zone"),
            }
            for g in groups
            if (g.get("status") or "").lower() == "available"
        ],
        "share_group_types": [
            {
                "id": t.get("id"),
                "name": t.get("name"),
                "share_types": t.get("share_types") or [],
                "group_specs": t.get("group_specs") or {},
            }
            for t in group_types
        ],
        "quota": quota,
        "can_create": can_create,
        "create_reason": create_reason,
        "can_snapshot": can_snapshot,
        "snapshot_reason": snapshot_reason,
        "access_types": list(rules.ACCESS_TYPES),
        "access_levels": list(rules.ACCESS_LEVELS),
        "security_service_types": list(rules.SECURITY_SERVICE_TYPES),
    }


# --- shares --------------------------------------------------------------------


async def list_shares(ctx: Context) -> dict:
    manila = _manila(ctx)
    shares, snapshots, quota = await asyncio.gather(
        manila.shares(), manila.snapshots(), manila.limits()
    )
    with_snapshot = {s.get("share_id") for s in snapshots}
    items = [
        rules.share_summary(s, s.get("id") in with_snapshot) for s in shares
    ]
    items.sort(key=lambda s: (s["name"] or "").lower())
    can_create, reason = rules.can_create(quota)
    return {
        "items": items,
        "quota": quota,
        "can_create": can_create,
        "create_reason": reason,
    }


async def get_share(ctx: Context, share_id: str) -> dict:
    manila = _manila(ctx)
    share, access, locations, snapshots = await asyncio.gather(
        manila.share(share_id),
        manila.access_rules(share_id),
        manila.export_locations(share_id),
        manila.snapshots(share_id=share_id),
    )
    return rules.share_detail(share, access, locations, bool(snapshots))


async def create_share(ctx: Context, data: ShareCreate) -> dict:
    manila = _manila(ctx)
    quota = await manila.limits()
    allowed, reason = rules.can_create(quota)
    if not allowed:
        raise QuotaExceeded(reason or "Quota exceeded.")
    snapshot = (
        await manila.snapshot(data.snapshot_id) if data.snapshot_id else None
    )
    problem = rules.validate_create(
        protocol=data.protocol,
        protocols=ctx.settings.manila_share_protocols,
        size=data.size,
        share_type=data.share_type,
        snapshot=snapshot,
    )
    if problem:
        raise BadRequest(problem)
    try:
        metadata = rules.parse_metadata(data.metadata)
    except ValueError as exc:
        raise BadRequest(str(exc)) from exc
    body = rules.create_body(
        name=data.name,
        description=data.description,
        protocol=data.protocol,
        size=data.size,
        share_type=data.share_type,
        availability_zone=data.availability_zone,
        snapshot_id=data.snapshot_id,
        share_group_id=data.share_group_id,
        metadata=metadata,
        is_public=data.is_public,
    )
    created = await manila.create_share(body)
    return rules.share_summary(created)


async def update_share(ctx: Context, share_id: str, data: ShareUpdate) -> dict:
    manila = _manila(ctx)
    share = await manila.share(share_id)
    if (share.get("status") or "").lower() not in rules.SHARE_EDITABLE:
        raise Conflict("The share can only be edited while it is available.")
    fields: dict = {}
    if data.name is not None:
        fields["display_name"] = data.name
    if data.description is not None:
        fields["display_description"] = data.description
    if data.is_public is not None:
        fields["is_public"] = data.is_public
    updated = await manila.update_share(share_id, fields) if fields else share
    return rules.share_summary(updated or share)


async def set_metadata(
    ctx: Context, share_id: str, data: ShareMetadata
) -> dict:
    """The edit metadata form (``forms.py:292-322``): ``key=value`` lines
    are set; keys left out are removed."""
    manila = _manila(ctx)
    try:
        wanted = rules.parse_metadata(data.metadata)
    except ValueError as exc:
        raise BadRequest(str(exc)) from exc
    current = await manila.share_metadata(share_id)
    removed = [k for k in current if k not in wanted]
    if wanted:
        await manila.set_share_metadata(share_id, wanted)
    for key in removed:
        await manila.delete_share_metadata(share_id, key)
    return {"metadata": wanted}


async def resize_share(ctx: Context, share_id: str, data: ShareResize) -> dict:
    manila = _manila(ctx)
    share, quota = await asyncio.gather(
        manila.share(share_id), manila.limits()
    )
    if (share.get("status") or "").lower() != "available":
        raise Conflict("The share can only be resized while it is available.")
    current = int(share.get("size") or 0)
    problem = rules.validate_resize(current, data.size, quota)
    if problem:
        raise BadRequest(problem)
    if data.size > current:
        await manila.extend_share(share_id, data.size)
    else:
        await manila.shrink_share(share_id, data.size)
    return {"id": share_id, "size": data.size}


async def revert_share(ctx: Context, share_id: str, data: ShareRevert) -> dict:
    manila = _manila(ctx)
    share, snapshots = await asyncio.gather(
        manila.share(share_id), manila.snapshots(share_id=share_id)
    )
    if (
        not share.get("revert_to_snapshot_support")
        or (share.get("status") or "").lower() != "available"
    ):
        raise Conflict("The share cannot be reverted right now.")
    newest = rules.newest_snapshot(snapshots)
    if not newest or newest.get("id") != data.snapshot_id:
        raise BadRequest("Only the newest snapshot can be reverted to.")
    await manila.revert_share(share_id, data.snapshot_id)
    return {"id": share_id, "snapshot_id": data.snapshot_id}


async def delete_share(ctx: Context, share_id: str) -> None:
    manila = _manila(ctx)
    share, snapshots = await asyncio.gather(
        manila.share(share_id), manila.snapshots(share_id=share_id)
    )
    if "delete" not in rules.share_actions(share, bool(snapshots)):
        if snapshots:
            raise Conflict("Delete the share's snapshots first.")
        raise Conflict("The share cannot be deleted while it is busy.")
    await manila.delete_share(share_id)


async def list_access(ctx: Context, share_id: str) -> dict:
    manila = _manila(ctx)
    share, access = await asyncio.gather(
        manila.share(share_id), manila.access_rules(share_id)
    )
    return {
        "share": rules.share_summary(share),
        "items": [rules.access_summary(r) for r in access],
        "can_add": (share.get("status") or "").lower() in rules.SHARE_EDITABLE,
    }


async def allow_access(
    ctx: Context, share_id: str, data: AccessRuleCreate
) -> dict:
    manila = _manila(ctx)
    problem = rules.validate_access(
        data.access_type, data.access_to, data.access_level
    )
    if problem:
        raise BadRequest(problem)
    share = await manila.share(share_id)
    if (share.get("status") or "").lower() not in rules.SHARE_EDITABLE:
        raise Conflict(
            "Access rules can only be added while the share is available."
        )
    rule = await manila.allow_access(
        share_id,
        {
            "access_type": data.access_type,
            "access_to": data.access_to.strip(),
            "access_level": data.access_level,
        },
    )
    return rules.access_summary(rule)


async def deny_access(ctx: Context, share_id: str, access_id: str) -> None:
    await _manila(ctx).deny_access(share_id, access_id)


# --- snapshots -----------------------------------------------------------------


async def list_snapshots(ctx: Context) -> dict:
    manila = _manila(ctx)
    snapshots, shares, quota = await asyncio.gather(
        manila.snapshots(), manila.shares(), manila.limits()
    )
    by_id = {s.get("id"): s for s in shares}
    items = [
        rules.snapshot_summary(s, by_id.get(s.get("share_id")))
        for s in snapshots
    ]
    items.sort(key=lambda s: (s["name"] or "").lower())
    return {"items": items, "quota": quota}


async def get_snapshot(ctx: Context, snapshot_id: str) -> dict:
    manila = _manila(ctx)
    snapshot = await manila.snapshot(snapshot_id)
    share = (
        await manila.share(snapshot["share_id"])
        if snapshot.get("share_id")
        else None
    )
    detail = rules.snapshot_summary(snapshot, share)
    detail["mount_snapshot_support"] = bool(
        (share or {}).get("mount_snapshot_support")
    )
    if detail["mount_snapshot_support"]:
        locations, access = await asyncio.gather(
            manila.get_json(f"/snapshots/{snapshot_id}/export-locations"),
            manila.get_json(f"/snapshots/{snapshot_id}/access-list"),
        )
        detail["export_locations"] = (locations or {}).get(
            "share_snapshot_export_locations", []
        )
        detail["access_rules"] = (access or {}).get("snapshot_access_list", [])
    return detail


async def create_snapshot(ctx: Context, data: SnapshotCreate) -> dict:
    manila = _manila(ctx)
    share, quota = await asyncio.gather(
        manila.share(data.share_id), manila.limits()
    )
    allowed, reason = rules.can_snapshot(quota)
    if not allowed:
        raise QuotaExceeded(reason or "Quota exceeded.")
    if "snapshot" not in rules.share_actions(share, False):
        raise Conflict("The share cannot be snapshotted right now.")
    created = await manila.create_snapshot(
        {
            "share_id": data.share_id,
            "force": False,
            "name": data.name,
            "description": data.description or "",
            "metadata": {},
        }
    )
    return rules.snapshot_summary(created, share)


async def update_snapshot(
    ctx: Context, snapshot_id: str, data: SnapshotUpdate
) -> dict:
    fields: dict = {}
    if data.name is not None:
        fields["display_name"] = data.name
    if data.description is not None:
        fields["display_description"] = data.description
    manila = _manila(ctx)
    updated = (
        await manila.update_snapshot(snapshot_id, fields)
        if fields
        else await manila.snapshot(snapshot_id)
    )
    return rules.snapshot_summary(updated, None)


async def delete_snapshot(ctx: Context, snapshot_id: str) -> None:
    manila = _manila(ctx)
    snapshot = await manila.snapshot(snapshot_id)
    if "delete" not in rules.snapshot_actions(snapshot, None):
        raise Conflict("The snapshot cannot be deleted while it is busy.")
    await manila.delete_snapshot(snapshot_id)


async def snapshot_allow_access(
    ctx: Context, snapshot_id: str, data: SnapshotAccessCreate
) -> dict:
    problem = rules.validate_access(data.access_type, data.access_to, "rw")
    if problem:
        raise BadRequest(problem)
    body = await _manila(ctx)._action(
        f"/snapshots/{snapshot_id}",
        {
            "allow_access": {
                "access_type": data.access_type,
                "access_to": data.access_to.strip(),
            }
        },
    )
    return body.get("snapshot_access", body)


async def snapshot_deny_access(
    ctx: Context, snapshot_id: str, access_id: str
) -> None:
    await _manila(ctx)._action(
        f"/snapshots/{snapshot_id}", {"deny_access": {"access_id": access_id}}
    )


# --- security services ---------------------------------------------------------


async def list_security_services(ctx: Context) -> dict:
    services = await _manila(ctx).security_services()
    items = [rules.security_service_summary(s) for s in services]
    items.sort(key=lambda s: (s["name"] or "").lower())
    return {"items": items, "types": list(rules.SECURITY_SERVICE_TYPES)}


async def get_security_service(ctx: Context, service_id: str) -> dict:
    return rules.security_service_summary(
        await _manila(ctx).security_service(service_id)
    )


async def create_security_service(
    ctx: Context, data: SecurityServiceCreate
) -> dict:
    created = await _manila(ctx).create_security_service(
        rules.security_service_body(data.model_dump())
    )
    return rules.security_service_summary(created)


async def update_security_service(
    ctx: Context, service_id: str, data: SecurityServiceUpdate
) -> dict:
    fields = {k: v for k, v in data.model_dump().items() if v is not None}
    manila = _manila(ctx)
    updated = (
        await manila.update_security_service(service_id, fields)
        if fields
        else None
    )
    return rules.security_service_summary(
        updated or await manila.security_service(service_id)
    )


async def delete_security_service(ctx: Context, service_id: str) -> None:
    await _manila(ctx).delete_security_service(service_id)


# --- share groups --------------------------------------------------------------


async def list_share_groups(ctx: Context) -> dict:
    groups = await _manila(ctx).share_groups()
    items = [rules.group_summary(g) for g in groups]
    items.sort(key=lambda g: (g["name"] or "").lower())
    return {"items": items}


async def get_share_group(ctx: Context, group_id: str) -> dict:
    manila = _manila(ctx)
    group, members, types = await asyncio.gather(
        manila.share_group(group_id),
        manila.shares(share_group_id=group_id),
        _share_types(ctx),
    )
    detail = rules.group_summary(group)
    by_id = {t["id"]: t for t in types}
    detail["share_types_detail"] = [
        by_id.get(t, {"id": t, "name": t}) for t in detail["share_types"]
    ]
    detail["members"] = [rules.share_summary(s) for s in members]
    return detail


async def create_share_group(ctx: Context, data: ShareGroupCreate) -> dict:
    manila = _manila(ctx)
    if not data.snapshot_id and not data.share_group_type_id:
        raise BadRequest("Select a share group type.")
    body = rules.group_body(
        name=data.name,
        description=data.description,
        share_group_type_id=data.share_group_type_id,
        share_types=data.share_types,
        availability_zone=data.availability_zone,
        snapshot_id=data.snapshot_id,
    )
    return rules.group_summary(await manila.create_share_group(body))


async def update_share_group(
    ctx: Context, group_id: str, data: ShareGroupUpdate
) -> dict:
    manila = _manila(ctx)
    group = await manila.share_group(group_id)
    if "edit" not in rules.group_actions(group):
        raise Conflict(
            "The share group can only be edited while it is available."
        )
    fields = {k: v for k, v in data.model_dump().items() if v is not None}
    updated = (
        await manila.update_share_group(group_id, fields) if fields else group
    )
    return rules.group_summary(updated or group)


async def delete_share_group(ctx: Context, group_id: str) -> None:
    manila = _manila(ctx)
    group = await manila.share_group(group_id)
    if "delete" not in rules.group_actions(group):
        raise Conflict("The share group cannot be deleted while it is busy.")
    await manila.delete_share_group(group_id)


async def list_share_group_snapshots(ctx: Context) -> dict:
    manila = _manila(ctx)
    snapshots, groups = await asyncio.gather(
        manila.share_group_snapshots(), manila.share_groups()
    )
    by_id = {g.get("id"): g for g in groups}
    items = [
        rules.group_snapshot_summary(s, by_id.get(s.get("share_group_id")))
        for s in snapshots
    ]
    items.sort(key=lambda s: (s["name"] or "").lower())
    return {"items": items}


async def get_share_group_snapshot(ctx: Context, snapshot_id: str) -> dict:
    manila = _manila(ctx)
    snapshot = await manila.share_group_snapshot(snapshot_id)
    group = (
        await manila.share_group(snapshot["share_group_id"])
        if snapshot.get("share_group_id")
        else None
    )
    return rules.group_snapshot_summary(snapshot, group)


async def create_share_group_snapshot(
    ctx: Context, data: ShareGroupSnapshotCreate
) -> dict:
    manila = _manila(ctx)
    group = await manila.share_group(data.share_group_id)
    if "snapshot" not in rules.group_actions(group):
        raise Conflict("The share group cannot be snapshotted right now.")
    fields: dict = {"share_group_id": data.share_group_id, "name": data.name}
    if data.description:
        fields["description"] = data.description
    created = await manila.create_share_group_snapshot(fields)
    return rules.group_snapshot_summary(created, group)


async def update_share_group_snapshot(
    ctx: Context, snapshot_id: str, data: ShareGroupUpdate
) -> dict:
    manila = _manila(ctx)
    fields = {k: v for k, v in data.model_dump().items() if v is not None}
    updated = (
        await manila.update_share_group_snapshot(snapshot_id, fields)
        if fields
        else None
    )
    return rules.group_snapshot_summary(
        updated or await manila.share_group_snapshot(snapshot_id), None
    )


async def delete_share_group_snapshot(ctx: Context, snapshot_id: str) -> None:
    manila = _manila(ctx)
    snapshot = await manila.share_group_snapshot(snapshot_id)
    if "delete" not in rules.group_snapshot_actions(snapshot):
        raise Conflict(
            "The share group snapshot cannot be deleted while it is busy."
        )
    await manila.delete_share_group_snapshot(snapshot_id)
