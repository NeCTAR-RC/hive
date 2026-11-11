"""DNS (Designate) endpoints."""

from fastapi import APIRouter, Response

from hive.deps import ContextDep
from hive.schemas.dns import (
    RecordSetCreate,
    RecordSetUpdate,
    ZoneCreate,
    ZoneUpdate,
)
from hive.schemas.responses.dns import (
    RecordSet,
    RecordSetsResponse,
    Zone,
    ZonesResponse,
)
from hive.services import dns

router = APIRouter(prefix="/dns", tags=["dns"])


@router.get("/zones")
async def list_zones(ctx: ContextDep) -> ZonesResponse:
    return await dns.list_zones(ctx)


@router.post("/zones", status_code=202)
async def create_zone(body: ZoneCreate, ctx: ContextDep) -> Zone:
    return await dns.create_zone(ctx, body)


@router.get("/zones/{zone_id}")
async def get_zone(zone_id: str, ctx: ContextDep) -> Zone:
    return await dns.get_zone(ctx, zone_id)


@router.patch("/zones/{zone_id}")
async def update_zone(zone_id: str, body: ZoneUpdate, ctx: ContextDep) -> Zone:
    return await dns.update_zone(ctx, zone_id, body)


@router.delete("/zones/{zone_id}", status_code=204)
async def delete_zone(zone_id: str, ctx: ContextDep) -> Response:
    await dns.delete_zone(ctx, zone_id)
    return Response(status_code=204)


@router.get("/zones/{zone_id}/recordsets")
async def list_recordsets(zone_id: str, ctx: ContextDep) -> RecordSetsResponse:
    return await dns.list_recordsets(ctx, zone_id)


@router.post("/zones/{zone_id}/recordsets", status_code=202)
async def create_recordset(
    zone_id: str, body: RecordSetCreate, ctx: ContextDep
) -> RecordSet:
    return await dns.create_recordset(ctx, zone_id, body)


@router.put("/zones/{zone_id}/recordsets/{recordset_id}")
async def update_recordset(
    zone_id: str, recordset_id: str, body: RecordSetUpdate, ctx: ContextDep
) -> RecordSet:
    return await dns.update_recordset(ctx, zone_id, recordset_id, body)


@router.delete("/zones/{zone_id}/recordsets/{recordset_id}", status_code=204)
async def delete_recordset(
    zone_id: str, recordset_id: str, ctx: ContextDep
) -> Response:
    await dns.delete_recordset(ctx, zone_id, recordset_id)
    return Response(status_code=204)
