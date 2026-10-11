"""DNS (Designate): zones and record sets."""

from hive.clients.designate import DesignateClient
from hive.errors import BadRequest, Conflict, QuotaExceeded
from hive.nectar import dns as rules
from hive.schemas.dns import RecordSetCreate, RecordSetUpdate, ZoneCreate, ZoneUpdate
from hive.services.context import Context


def _designate(ctx: Context) -> DesignateClient:
    return DesignateClient(ctx.http, ctx.settings, ctx.scoped)


async def quotas(ctx: Context) -> dict:
    return await _designate(ctx).quotas()


async def list_zones(ctx: Context) -> dict:
    zones = await _designate(ctx).zones()
    items = [rules.zone_summary(z) for z in zones]
    items.sort(key=lambda z: z["name"] or "")
    quota = {}
    try:
        quota = await quotas(ctx)
    except Exception:  # noqa: BLE001 - quota is decoration
        quota = {}
    return {"items": items, "quota": quota, "record_types": list(rules.RECORD_TYPES)}


async def get_zone(ctx: Context, zone_id: str) -> dict:
    return rules.zone_summary(await _designate(ctx).zone(zone_id))


async def create_zone(ctx: Context, data: ZoneCreate) -> dict:
    problem = rules.validate_zone(data.name, data.email, data.ttl, data.type, data.masters)
    if problem:
        raise BadRequest(problem)
    designate = _designate(ctx)
    try:
        quota = await designate.quotas()
        zones = await designate.zones()
        limit = quota.get("zones")
        if isinstance(limit, int) and limit >= 0 and len(zones) >= limit:
            raise QuotaExceeded(f"This project may have at most {limit} zones.")
    except QuotaExceeded:
        raise
    except Exception:  # noqa: BLE001 - the server enforces the quota anyway
        pass
    created = await designate.create_zone(
        rules.zone_body(data.name, data.email, data.ttl, data.description, data.type, data.masters)
    )
    return rules.zone_summary(created)


async def update_zone(ctx: Context, zone_id: str, data: ZoneUpdate) -> dict:
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
    return rules.zone_summary(updated)


async def delete_zone(ctx: Context, zone_id: str) -> None:
    designate = _designate(ctx)
    zone = await designate.zone(zone_id)
    if rules.is_transitional(zone):
        raise Conflict("The zone is busy; wait for the pending change to finish.")
    await designate.delete_zone(zone_id)


async def list_recordsets(ctx: Context, zone_id: str) -> dict:
    designate = _designate(ctx)
    zone = await designate.zone(zone_id)
    zone_name = zone.get("name") or ""
    recordsets = await designate.recordsets(zone_id)
    items = [rules.recordset_summary(r, zone_name) for r in recordsets]
    items.sort(key=lambda r: ((r["name"] or "") != zone_name, r["name"] or "", r["type"] or ""))
    return {"zone": rules.zone_summary(zone), "items": items}


async def create_recordset(ctx: Context, zone_id: str, data: RecordSetCreate) -> dict:
    designate = _designate(ctx)
    zone = await designate.zone(zone_id)
    zone_name = zone.get("name") or ""
    name = rules.recordset_name(zone_name, data.name)
    records = rules.quote_txt(data.records) if data.type in ("TXT", "SPF") else data.records
    problem = rules.validate_recordset(zone_name, name, data.type, records, data.ttl)
    if problem:
        raise BadRequest(problem)
    created = await designate.create_recordset(
        zone_id, rules.recordset_body(name, data.type, records, data.ttl, data.description)
    )
    return rules.recordset_summary(created, zone_name)


async def update_recordset(ctx: Context, zone_id: str, recordset_id: str, data: RecordSetUpdate) -> dict:
    designate = _designate(ctx)
    zone = await designate.zone(zone_id)
    zone_name = zone.get("name") or ""
    current = await designate.recordset(zone_id, recordset_id)
    if not rules.can_edit_recordset(current, zone_name):
        raise Conflict("This record set is managed by the DNS service and cannot be changed.")
    rtype = current.get("type") or ""
    records = rules.quote_txt(data.records) if rtype in ("TXT", "SPF") else data.records
    problem = rules.validate_recordset(zone_name, current.get("name") or "", rtype, records, data.ttl)
    if problem:
        raise BadRequest(problem)
    fields: dict = {"records": [r.strip() for r in records]}
    if data.ttl is not None:
        fields["ttl"] = data.ttl
    if data.description is not None:
        fields["description"] = data.description
    updated = await designate.update_recordset(zone_id, recordset_id, fields)
    return rules.recordset_summary(updated, zone_name)


async def delete_recordset(ctx: Context, zone_id: str, recordset_id: str) -> None:
    designate = _designate(ctx)
    zone = await designate.zone(zone_id)
    current = await designate.recordset(zone_id, recordset_id)
    if not rules.can_edit_recordset(current, zone.get("name") or ""):
        raise Conflict("This record set is managed by the DNS service and cannot be deleted.")
    await designate.delete_recordset(zone_id, recordset_id)
