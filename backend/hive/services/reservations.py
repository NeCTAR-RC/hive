"""Reservations (warre): list, create, extend, delete and export."""

import asyncio
from datetime import date, datetime, time, timedelta, UTC

from hive.clients.nectar import WarreClient
from hive.errors import BadRequest, Conflict, HiveError
from hive.nectar import reservations as rules
from hive.services import allocation_summary as allocation_service
from hive.services.context import Context

SLOT_WINDOW_DAYS = 90
# How far ahead the free-slot search may look; well past any flavour's
# maximum length, and far from ``date.max``.
SLOT_HORIZON_DAYS = 730
FAN_OUT = 8


def _now() -> datetime:
    """The clock, in one place so tests can freeze it."""
    return datetime.now(UTC)


def _warre(ctx: Context) -> WarreClient:
    return WarreClient(ctx.http, ctx.settings, ctx.scoped)


def detail_url(ctx: Context, reservation_id: str) -> str:
    return (
        f"{ctx.settings.public_url.rstrip('/')}/reservations/{reservation_id}"
    )


def reservation_summary(
    reservation: dict, limits: dict, now: datetime
) -> dict:
    status = reservation.get("status")
    return {
        "id": reservation.get("id"),
        "status": status,
        "status_help": rules.STATUS_HELP.get(status or "", ""),
        "status_reason": reservation.get("status_reason"),
        "start": reservation.get("start"),
        "end": reservation.get("end"),
        "created_at": reservation.get("created_at"),
        "instance_count": reservation.get("instance_count"),
        "compute_flavor": reservation.get("compute_flavor"),
        "flavor": rules.flavor_summary(reservation.get("flavor") or {}),
        "actions": rules.reservation_actions(reservation, limits, now),
    }


async def _limits(ctx: Context) -> dict:
    return rules.limits_summary(await _warre(ctx).limits())


async def _budget(ctx: Context) -> tuple[float | None, float | None]:
    """SU used and budget for the eligibility check; unknown when the
    allocation summary is unavailable (the check is then skipped)."""
    try:
        result = await allocation_service.allocation_summary(
            ctx.http, ctx.settings, ctx.cache, ctx.scoped
        )
    except HiveError:
        return None, None
    value = result.value
    return value.get("su_used"), value.get("su_budget")


async def list_reservations(ctx: Context) -> dict:
    warre = _warre(ctx)
    items, absolute = await asyncio.gather(
        warre.reservations(), warre.limits()
    )
    limits = rules.limits_summary(absolute)
    now = _now()
    rows = [reservation_summary(r, limits, now) for r in items]
    rows.sort(key=lambda r: str(r.get("start") or ""), reverse=True)
    return {"items": rows, "limits": limits}


async def get_reservation(ctx: Context, reservation_id: str) -> dict:
    warre = _warre(ctx)
    reservation, absolute = await asyncio.gather(
        warre.reservation(reservation_id), warre.limits()
    )
    limits = rules.limits_summary(absolute)
    now = _now()
    summary = reservation_summary(reservation, limits, now)
    url = detail_url(ctx, reservation_id)
    summary["calendar"] = {
        "google": rules.google_calendar_url(reservation, url),
        "outlook": rules.outlook_calendar_url(reservation, url),
        "outlook_personal": rules.outlook_calendar_url(
            reservation, url, personal=True
        ),
    }
    summary["detail_url"] = url
    return summary


async def options(ctx: Context) -> dict:
    warre = _warre(ctx)
    flavors, absolute = await asyncio.gather(warre.flavors(), warre.limits())
    try:
        windows = await warre.maintenance_windows()
    except HiveError:
        windows = []
    su_used, su_budget = await _budget(ctx)
    summaries = [rules.flavor_summary(f) for f in flavors]
    return {
        "limits": rules.limits_summary(absolute),
        "flavors": summaries,
        "categories": sorted(
            {f["category"] for f in summaries if f["category"]}
        ),
        "availability_zones": sorted(
            {
                f["availability_zone"]
                for f in summaries
                if f["availability_zone"]
            }
        ),
        "maintenance_windows": [
            {
                "id": w.get("id"),
                "start": w.get("start"),
                "end": w.get("end"),
                "note": w.get("note"),
                "flavors": [
                    {"id": f.get("id"), "name": f.get("name")}
                    for f in (w.get("flavors") or [])
                ],
            }
            for w in windows
        ],
        "su_used": su_used,
        "su_budget": su_budget,
        "today": _now().date().isoformat(),
    }


async def slots(
    ctx: Context,
    category: str | None,
    availability_zone: str | None,
    start: date | None,
    end: date | None,
) -> dict:
    """Free slots per flavour over the window of whole days ``start`` to
    ``end`` inclusive (Horizon's ``/api/warre/flavor-slots/``,
    ``api/rest/reservation.py:23-53``), each reduced to the days it can be
    reserved for.

    Warre reads a ``start`` date as midnight on that day and defaults to
    now (``api/v1/resources/flavor.py:195-208``), so only a future start
    is sent: asking from midnight today returns slots that have already
    passed. The end is sent as midnight after the last day so that day is
    covered in full.
    """
    warre = _warre(ctx)
    params = {}
    if category:
        params["category"] = category
    if availability_zone:
        params["availability_zone"] = availability_zone
    now = _now()
    today = now.date()
    horizon = today + timedelta(days=SLOT_HORIZON_DAYS)
    start = max(start or today, today)
    if start > horizon:
        raise BadRequest(
            f"Free slots can only be searched up to {SLOT_HORIZON_DAYS} days"
            " ahead."
        )
    if end is not None and end < start:
        raise BadRequest("The end date must not be before the start date.")
    end = min(end or start + timedelta(days=SLOT_WINDOW_DAYS), horizon)
    flavors = await warre.flavors(**params)
    sent_start = start.isoformat() if start > today else None
    sent_end = (end + timedelta(days=1)).isoformat()
    window_start = (
        datetime.combine(start, time.min, UTC) if sent_start else now
    )
    window_end = datetime.combine(end + timedelta(days=1), time.min, UTC)
    semaphore = asyncio.Semaphore(FAN_OUT)

    async def fetch(flavor: dict) -> list[dict]:
        async with semaphore:
            try:
                free = await warre.free_slots(
                    flavor["id"], sent_start, sent_end
                )
            except HiveError:
                return []
        found = []
        for slot in free:
            days = rules.slot_days(
                rules.parse_when(slot.get("start")) or window_start,
                rules.parse_when(slot.get("end")) or window_end,
                now,
            )
            if days is None:
                continue
            found.append(
                {
                    "flavor_id": flavor["id"],
                    "start": slot.get("start"),
                    "end": slot.get("end"),
                    "first_day": days[0].isoformat(),
                    "last_day": days[1].isoformat(),
                }
            )
        return found

    groups = await asyncio.gather(*(fetch(f) for f in flavors if f.get("id")))
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "flavors": [rules.flavor_summary(f) for f in flavors],
        "slots": [slot for group in groups for slot in group],
    }


async def create_reservation(
    ctx: Context, flavor_id: str, start: date, end: date
) -> dict:
    now = _now()
    if start < now.date():
        raise BadRequest("The reservation cannot start in the past.")
    if end < start:
        raise BadRequest("The end date must not be before the start date.")
    warre = _warre(ctx)
    flavor, absolute = await asyncio.gather(
        warre.flavor(flavor_id), warre.limits()
    )
    limits = rules.limits_summary(absolute)
    if not limits["can_create"]:
        raise Conflict(
            "You can't create a reservation because your project limits"
            " have been reached."
        )
    su_used, su_budget = await _budget(ctx)
    check = rules.eligibility(
        days=rules.selected_days(start, end),
        days_left=limits["days_left"],
        flavor_days=rules.flavor_max_days(flavor),
        rate=rules.flavor_rate(flavor),
        su_used=su_used,
        su_budget=su_budget,
    )
    if not check["eligible"]:
        raise BadRequest(" ".join(check["reasons"]))
    begin, finish = rules.reservation_times(start, end, now)
    created = await warre.create_reservation(
        {
            "flavor_id": flavor_id,
            "start": begin.isoformat(),
            "end": finish.isoformat(),
            "instance_count": 1,
        }
    )
    if not created.get("flavor"):
        created["flavor"] = flavor
    return reservation_summary(created, limits, now)


async def _extend_window(
    ctx: Context, reservation_id: str
) -> tuple[dict, dict, datetime, dict]:
    """The reservation, its limits, the clock and how far it can be
    extended, from the free slot that continues it."""
    warre = _warre(ctx)
    reservation, absolute = await asyncio.gather(
        warre.reservation(reservation_id), warre.limits()
    )
    limits = rules.limits_summary(absolute)
    now = _now()
    closed = {"available": False, "eligible_days": 0, "max_end": None}
    if not rules.can_extend(reservation, limits, now):
        return reservation, limits, now, closed
    end = rules.parse_when(reservation.get("end")) or now
    flavor = reservation.get("flavor") or {}
    free = await warre.free_slots(
        flavor.get("id") or "",
        end.date().isoformat(),
        (
            end.date() + timedelta(days=rules.flavor_max_days(flavor))
        ).isoformat(),
    )
    window = rules.extend_window(
        reservation, rules.adjacent_slot(free, end), limits, now
    )
    return reservation, limits, now, window


async def extend_options(ctx: Context, reservation_id: str) -> dict:
    _, _, _, window = await _extend_window(ctx, reservation_id)
    return window


async def extend_reservation(
    ctx: Context, reservation_id: str, end: date
) -> dict:
    """Extend to ``end``, which must lie in the window ``extend_options``
    offers (``nectar_reservations.js:605-618``): warre would otherwise
    accept an end past the free slot, the flavour maximum or the
    project's days left."""
    reservation, limits, now, window = await _extend_window(
        ctx, reservation_id
    )
    if not rules.can_extend(reservation, limits, now):
        raise Conflict("This reservation cannot be extended.")
    current = rules.parse_when(reservation.get("end"))
    new_end = rules.extend_end(end)
    if current is not None and new_end <= current:
        raise BadRequest("New end must be greater than current end.")
    if not window["available"] or not window["max_end"]:
        raise Conflict(
            "The flavour is not free after this reservation, so it cannot"
            " be extended."
        )
    if end > date.fromisoformat(window["max_end"]):
        raise BadRequest(
            f"The reservation can be extended to {window['max_end']} at the"
            " latest."
        )
    updated = await _warre(ctx).update_reservation(
        reservation_id, {"end": new_end.isoformat()}
    )
    if not updated.get("flavor"):
        updated = {**reservation, **updated}
    return reservation_summary(updated, limits, now)


async def delete_reservation(ctx: Context, reservation_id: str) -> None:
    warre = _warre(ctx)
    reservation = await warre.reservation(reservation_id)
    if reservation.get("status") == "PENDING_CREATE":
        raise Conflict(
            "A reservation that is still being created cannot be deleted."
        )
    await warre.delete_reservation(reservation_id)


async def calendar(ctx: Context, reservation_id: str, host: str) -> str:
    reservation = await _warre(ctx).reservation(reservation_id)
    if reservation.get("status") not in rules.CALENDAR_STATUSES:
        raise Conflict(
            "Only allocated or active reservations have a calendar entry."
        )
    return rules.ics_text(
        reservation, detail_url(ctx, reservation_id), host, _now()
    )
