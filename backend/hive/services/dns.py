"""DNS (Designate): zones and record sets."""

import asyncio
import contextlib

from hive.clients.designate import DesignateClient
from hive.errors import BadRequest, Conflict, HiveError, QuotaExceeded
from hive.nectar import dns as rules
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
from hive.services.context import Context


def _designate(ctx: Context) -> DesignateClient:
    return DesignateClient(ctx.http, ctx.settings, ctx.scoped)


async def quotas(ctx: Context) -> dict:
    return await _designate(ctx).quotas()


async def list_zones(ctx: Context) -> ZonesResponse:
    zones = await _designate(ctx).zones()
    items = [rules.zone_summary(z) for z in zones]
    items.sort(key=lambda z: z["name"] or "")
    quota = {}
    # The quota only decorates the list; the zones matter more.
    with contextlib.suppress(HiveError):
        quota = await quotas(ctx)
    return ZonesResponse.model_validate(
        {
            "items": items,
            "quota": quota,
            "record_types": list(rules.RECORD_TYPES),
        }
    )


async def get_zone(ctx: Context, zone_id: str) -> Zone:
    return Zone.model_validate(
        rules.zone_summary(await _designate(ctx).zone(zone_id))
    )


async def create_zone(ctx: Context, data: ZoneCreate) -> Zone:
    designate = _designate(ctx)
    try:
        quota, zones = await asyncio.gather(
            designate.quotas(), designate.zones()
        )
    except HiveError:
        # The pre-check only gives a clearer message; Designate enforces
        # the quota itself.
        quota, zones = {}, []
    limit = quota.get("zones")
    if isinstance(limit, int) and limit >= 0 and len(zones) >= limit:
        raise QuotaExceeded(f"This project may have at most {limit} zones.")
    created = await designate.create_zone(
        rules.zone_body(
            data.name,
            data.email,
            data.ttl,
            data.description,
            data.type,
            data.masters,
        )
    )
    return Zone.model_validate(rules.zone_summary(created))


async def update_zone(ctx: Context, zone_id: str, data: ZoneUpdate) -> Zone:
    fields: dict = {}
    if data.email is not None:
        if not rules.EMAIL.match(data.email):
            raise BadRequest("Enter a valid contact email address.")
        fields["email"] = data.email
    if data.ttl is not None:
        fields["ttl"] = data.ttl
    if data.description is not None:
        fields["description"] = data.description
    if data.masters is not None:
        fields["masters"] = data.masters
    if not fields:
        return await get_zone(ctx, zone_id)
    updated = await _designate(ctx).update_zone(zone_id, fields)
    return Zone.model_validate(rules.zone_summary(updated))


async def delete_zone(ctx: Context, zone_id: str) -> None:
    designate = _designate(ctx)
    zone = await designate.zone(zone_id)
    if rules.is_transitional(zone):
        raise Conflict(
            "The zone is busy; wait for the pending change to finish."
        )
    await designate.delete_zone(zone_id)


async def list_recordsets(ctx: Context, zone_id: str) -> RecordSetsResponse:
    designate = _designate(ctx)
    zone = await designate.zone(zone_id)
    zone_name = zone.get("name") or ""
    recordsets = await designate.recordsets(zone_id)
    items = [rules.recordset_summary(r, zone_name) for r in recordsets]
    items.sort(
        key=lambda r: (
            (r["name"] or "") != zone_name,
            r["name"] or "",
            r["type"] or "",
        )
    )
    return RecordSetsResponse.model_validate(
        {"zone": rules.zone_summary(zone), "items": items}
    )


async def create_recordset(
    ctx: Context, zone_id: str, data: RecordSetCreate
) -> RecordSet:
    designate = _designate(ctx)
    zone = await designate.zone(zone_id)
    zone_name = zone.get("name") or ""
    name = rules.recordset_name(zone_name, data.name)
    records = (
        rules.quote_txt(data.records)
        if data.type in ("TXT", "SPF")
        else data.records
    )
    rules.validate_recordset(zone_name, name, data.type, records, data.ttl)
    created = await designate.create_recordset(
        zone_id,
        rules.recordset_body(
            name, data.type, records, data.ttl, data.description
        ),
    )
    return RecordSet.model_validate(
        rules.recordset_summary(created, zone_name)
    )


async def update_recordset(
    ctx: Context, zone_id: str, recordset_id: str, data: RecordSetUpdate
) -> RecordSet:
    designate = _designate(ctx)
    zone = await designate.zone(zone_id)
    zone_name = zone.get("name") or ""
    current = await designate.recordset(zone_id, recordset_id)
    if not rules.can_edit_recordset(current, zone_name):
        raise Conflict(
            "This record set is managed by the DNS service and cannot be changed."
        )
    rtype = current.get("type") or ""
    records = (
        rules.quote_txt(data.records)
        if rtype in ("TXT", "SPF")
        else data.records
    )
    rules.validate_recordset(
        zone_name, current.get("name") or "", rtype, records, data.ttl
    )
    fields: dict = {"records": [r.strip() for r in records]}
    # An explicit ``"ttl": null`` goes to Designate as null, which restores
    # the zone's default TTL; an omitted ttl leaves the current one.
    if "ttl" in data.model_fields_set:
        fields["ttl"] = data.ttl
    if data.description is not None:
        fields["description"] = data.description
    updated = await designate.update_recordset(zone_id, recordset_id, fields)
    return RecordSet.model_validate(
        rules.recordset_summary(updated, zone_name)
    )


async def delete_recordset(
    ctx: Context, zone_id: str, recordset_id: str
) -> None:
    designate = _designate(ctx)
    zone = await designate.zone(zone_id)
    current = await designate.recordset(zone_id, recordset_id)
    if not rules.can_edit_recordset(current, zone.get("name") or ""):
        raise Conflict(
            "This record set is managed by the DNS service and cannot be deleted."
        )
    await designate.delete_recordset(zone_id, recordset_id)
