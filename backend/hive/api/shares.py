"""Share (Manila) endpoints."""

from fastapi import APIRouter, Depends, Response

from hive.api.compute import get_context
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
from hive.services import shares

router = APIRouter(prefix="/shares", tags=["shares"])
Ctx = Depends(get_context)


@router.get("/options")
async def options(ctx: Context = Ctx):
    return await shares.options(ctx)


@router.get("/shares")
async def list_shares(ctx: Context = Ctx):
    return await shares.list_shares(ctx)


@router.post("/shares", status_code=202)
async def create_share(body: ShareCreate, ctx: Context = Ctx):
    return await shares.create_share(ctx, body)


@router.get("/shares/{share_id}")
async def get_share(share_id: str, ctx: Context = Ctx):
    return await shares.get_share(ctx, share_id)


@router.patch("/shares/{share_id}")
async def update_share(share_id: str, body: ShareUpdate, ctx: Context = Ctx):
    return await shares.update_share(ctx, share_id, body)


@router.delete("/shares/{share_id}", status_code=204)
async def delete_share(share_id: str, ctx: Context = Ctx):
    await shares.delete_share(ctx, share_id)
    return Response(status_code=204)


@router.put("/shares/{share_id}/metadata")
async def set_metadata(share_id: str, body: ShareMetadata, ctx: Context = Ctx):
    return await shares.set_metadata(ctx, share_id, body)


@router.post("/shares/{share_id}/resize", status_code=202)
async def resize_share(share_id: str, body: ShareResize, ctx: Context = Ctx):
    return await shares.resize_share(ctx, share_id, body)


@router.post("/shares/{share_id}/revert", status_code=202)
async def revert_share(share_id: str, body: ShareRevert, ctx: Context = Ctx):
    return await shares.revert_share(ctx, share_id, body)


@router.get("/shares/{share_id}/access")
async def list_access(share_id: str, ctx: Context = Ctx):
    return await shares.list_access(ctx, share_id)


@router.post("/shares/{share_id}/access", status_code=202)
async def allow_access(
    share_id: str, body: AccessRuleCreate, ctx: Context = Ctx
):
    return await shares.allow_access(ctx, share_id, body)


@router.delete("/shares/{share_id}/access/{access_id}", status_code=204)
async def deny_access(share_id: str, access_id: str, ctx: Context = Ctx):
    await shares.deny_access(ctx, share_id, access_id)
    return Response(status_code=204)


@router.get("/snapshots")
async def list_snapshots(ctx: Context = Ctx):
    return await shares.list_snapshots(ctx)


@router.post("/snapshots", status_code=202)
async def create_snapshot(body: SnapshotCreate, ctx: Context = Ctx):
    return await shares.create_snapshot(ctx, body)


@router.get("/snapshots/{snapshot_id}")
async def get_snapshot(snapshot_id: str, ctx: Context = Ctx):
    return await shares.get_snapshot(ctx, snapshot_id)


@router.patch("/snapshots/{snapshot_id}")
async def update_snapshot(
    snapshot_id: str, body: SnapshotUpdate, ctx: Context = Ctx
):
    return await shares.update_snapshot(ctx, snapshot_id, body)


@router.delete("/snapshots/{snapshot_id}", status_code=204)
async def delete_snapshot(snapshot_id: str, ctx: Context = Ctx):
    await shares.delete_snapshot(ctx, snapshot_id)
    return Response(status_code=204)


@router.post("/snapshots/{snapshot_id}/access", status_code=202)
async def snapshot_allow_access(
    snapshot_id: str, body: SnapshotAccessCreate, ctx: Context = Ctx
):
    return await shares.snapshot_allow_access(ctx, snapshot_id, body)


@router.delete("/snapshots/{snapshot_id}/access/{access_id}", status_code=204)
async def snapshot_deny_access(
    snapshot_id: str, access_id: str, ctx: Context = Ctx
):
    await shares.snapshot_deny_access(ctx, snapshot_id, access_id)
    return Response(status_code=204)


@router.get("/security-services")
async def list_security_services(ctx: Context = Ctx):
    return await shares.list_security_services(ctx)


@router.post("/security-services", status_code=201)
async def create_security_service(
    body: SecurityServiceCreate, ctx: Context = Ctx
):
    return await shares.create_security_service(ctx, body)


@router.get("/security-services/{service_id}")
async def get_security_service(service_id: str, ctx: Context = Ctx):
    return await shares.get_security_service(ctx, service_id)


@router.patch("/security-services/{service_id}")
async def update_security_service(
    service_id: str, body: SecurityServiceUpdate, ctx: Context = Ctx
):
    return await shares.update_security_service(ctx, service_id, body)


@router.delete("/security-services/{service_id}", status_code=204)
async def delete_security_service(service_id: str, ctx: Context = Ctx):
    await shares.delete_security_service(ctx, service_id)
    return Response(status_code=204)


@router.get("/groups")
async def list_share_groups(ctx: Context = Ctx):
    return await shares.list_share_groups(ctx)


@router.post("/groups", status_code=202)
async def create_share_group(body: ShareGroupCreate, ctx: Context = Ctx):
    return await shares.create_share_group(ctx, body)


@router.get("/groups/{group_id}")
async def get_share_group(group_id: str, ctx: Context = Ctx):
    return await shares.get_share_group(ctx, group_id)


@router.patch("/groups/{group_id}")
async def update_share_group(
    group_id: str, body: ShareGroupUpdate, ctx: Context = Ctx
):
    return await shares.update_share_group(ctx, group_id, body)


@router.delete("/groups/{group_id}", status_code=204)
async def delete_share_group(group_id: str, ctx: Context = Ctx):
    await shares.delete_share_group(ctx, group_id)
    return Response(status_code=204)


@router.get("/group-snapshots")
async def list_share_group_snapshots(ctx: Context = Ctx):
    return await shares.list_share_group_snapshots(ctx)


@router.post("/group-snapshots", status_code=202)
async def create_share_group_snapshot(
    body: ShareGroupSnapshotCreate, ctx: Context = Ctx
):
    return await shares.create_share_group_snapshot(ctx, body)


@router.get("/group-snapshots/{snapshot_id}")
async def get_share_group_snapshot(snapshot_id: str, ctx: Context = Ctx):
    return await shares.get_share_group_snapshot(ctx, snapshot_id)


@router.patch("/group-snapshots/{snapshot_id}")
async def update_share_group_snapshot(
    snapshot_id: str, body: ShareGroupUpdate, ctx: Context = Ctx
):
    return await shares.update_share_group_snapshot(ctx, snapshot_id, body)


@router.delete("/group-snapshots/{snapshot_id}", status_code=204)
async def delete_share_group_snapshot(snapshot_id: str, ctx: Context = Ctx):
    await shares.delete_share_group_snapshot(ctx, snapshot_id)
    return Response(status_code=204)
