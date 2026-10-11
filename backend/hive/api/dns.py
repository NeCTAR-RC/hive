"""DNS (Designate) endpoints."""

from fastapi import APIRouter, Depends, Response

from hive.api.compute import get_context
from hive.schemas.dns import (
    RecordSetCreate,
    RecordSetUpdate,
    ZoneCreate,
    ZoneUpdate,
)
from hive.services.context import Context
from hive.services import dns

router = APIRouter(prefix="/dns", tags=["dns"])


@router.get("/zones")
async def list_zones(ctx: Context = Depends(get_context)):
    return await dns.list_zones(ctx)


@router.post("/zones", status_code=202)
async def create_zone(body: ZoneCreate, ctx: Context = Depends(get_context)):
    return await dns.create_zone(ctx, body)


@router.get("/zones/{zone_id}")
async def get_zone(zone_id: str, ctx: Context = Depends(get_context)):
    return await dns.get_zone(ctx, zone_id)


@router.patch("/zones/{zone_id}")
async def update_zone(
    zone_id: str, body: ZoneUpdate, ctx: Context = Depends(get_context)
):
    return await dns.update_zone(ctx, zone_id, body)


@router.delete("/zones/{zone_id}", status_code=204)
async def delete_zone(zone_id: str, ctx: Context = Depends(get_context)):
    await dns.delete_zone(ctx, zone_id)
    return Response(status_code=204)


@router.get("/zones/{zone_id}/recordsets")
async def list_recordsets(zone_id: str, ctx: Context = Depends(get_context)):
    return await dns.list_recordsets(ctx, zone_id)


@router.post("/zones/{zone_id}/recordsets", status_code=202)
async def create_recordset(
    zone_id: str, body: RecordSetCreate, ctx: Context = Depends(get_context)
):
    return await dns.create_recordset(ctx, zone_id, body)


@router.put("/zones/{zone_id}/recordsets/{recordset_id}")
async def update_recordset(
    zone_id: str,
    recordset_id: str,
    body: RecordSetUpdate,
    ctx: Context = Depends(get_context),
):
    return await dns.update_recordset(ctx, zone_id, recordset_id, body)


@router.delete("/zones/{zone_id}/recordsets/{recordset_id}", status_code=204)
async def delete_recordset(
    zone_id: str, recordset_id: str, ctx: Context = Depends(get_context)
):
    await dns.delete_recordset(ctx, zone_id, recordset_id)
    return Response(status_code=204)
