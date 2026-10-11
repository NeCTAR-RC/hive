"""Reservation (warre) rules, as ``warre-dashboard``.

- Limits: warre reports hours; the panel shows days
  (``maxDays = floor(maxHours / 24)``, ``totalDaysUsed = ceil(used / 24)``)
  and treats a negative limit as unlimited (``api/reservation.py:83-97``).
- Create is blocked when no reservations or no hours are left
  (``tables.py:136-170``); delete is blocked while ``PENDING_CREATE``
  (``tables.py:37-65``); launch needs ``ACTIVE`` (``tables.py:68-96``);
  calendar links need ``ACTIVE`` or ``ALLOCATED`` (``tables.py:124-133``).
- Extend needs ``ACTIVE``, hours left, and the flavour's maximum length
  reaching past the current end (``tables.py:99-121``); the eligible days
  are the smallest of the next free slot, the flavour maximum from today
  and the project's days left (``nectar_reservations.js:605-618``).
- Times: the dashboard runs in UTC. A reservation starts at 00:00 on the
  first day, or three minutes from now when that day is today, and ends at
  23:59 on the last day (``nectar_reservations.js:454-482``; Horizon's
  script stamps 23:59 on the day after the one shown, booking a day more
  than it displays, which Hive does not copy).
- Eligibility: the days must fit the project's and the flavour's limits,
  and the estimated SU (``rate * 24 * days``) plus the SU already used
  must fit the budget unless it is unlimited
  (``nectar_reservations.js:581-620, 727-793``).
- Calendar export follows ``calendar_export.py``.
"""

from datetime import date, datetime, timedelta, UTC
import math
from urllib.parse import urlencode

UNLIMITED = -1
CALENDAR_STATUSES = ("ACTIVE", "ALLOCATED")
START_LEAD_MINUTES = 3
LAST_MINUTE = (23, 59)

STATUS_HELP = {
    "PENDING_CREATE": "The reservation is being created and may still fail.",
    "ALLOCATED": "The reservation becomes active at its start time.",
    "ACTIVE": "The reservation is active: you can launch instances with it.",
    "COMPLETE": "The reservation has ended.",
    "ERROR": "The reservation could not be made.",
}


def _unlimited(value) -> bool:
    return value is None or value < 0


def limits_summary(absolute: dict) -> dict:
    max_hours = absolute.get("maxHours", 0) or 0
    hours_used = absolute.get("totalHoursUsed", 0) or 0
    max_reservations = absolute.get("maxReservations", 0) or 0
    reservations_used = absolute.get("totalReservationsUsed", 0) or 0
    max_days = None if _unlimited(max_hours) else math.floor(max_hours / 24)
    days_used = math.ceil(hours_used / 24)
    days_left = None if max_days is None else max(max_days - days_used, 0)
    reservations_left = (
        None
        if _unlimited(max_reservations)
        else max(max_reservations - reservations_used, 0)
    )
    hours_left = (
        None if _unlimited(max_hours) else max(max_hours - hours_used, 0)
    )
    return {
        "max_hours": None if _unlimited(max_hours) else max_hours,
        "hours_used": hours_used,
        "hours_left": hours_left,
        "max_days": max_days,
        "days_used": days_used,
        "days_left": days_left,
        "max_reservations": (
            None if _unlimited(max_reservations) else max_reservations
        ),
        "reservations_used": reservations_used,
        "reservations_left": reservations_left,
        "can_create": (days_left is None or days_left > 0)
        and (reservations_left is None or reservations_left > 0),
    }


def flavor_rate(flavor: dict) -> float | None:
    specs = flavor.get("extra_specs") or {}
    value = specs.get("nectar:rate")
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def flavor_max_days(flavor: dict) -> int:
    hours = flavor.get("max_length_hours") or 0
    return math.floor(hours / 24)


def flavor_summary(flavor: dict) -> dict:
    return {
        "id": flavor.get("id"),
        "name": flavor.get("name"),
        "description": flavor.get("description"),
        "category": flavor.get("category"),
        "availability_zone": flavor.get("availability_zone"),
        "vcpu": flavor.get("vcpu"),
        "memory_mb": flavor.get("memory_mb"),
        "disk_gb": flavor.get("disk_gb"),
        "ephemeral_gb": flavor.get("ephemeral_gb"),
        "max_length_hours": flavor.get("max_length_hours"),
        "max_days": flavor_max_days(flavor),
        "rate": flavor_rate(flavor),
        "is_public": flavor.get("is_public"),
        "active": flavor.get("active"),
        "slots": flavor.get("slots"),
        "start": flavor.get("start"),
        "end": flavor.get("end"),
    }


def parse_when(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        when = value
    else:
        try:
            when = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=UTC)
    return when.astimezone(UTC)


def can_extend(reservation: dict, limits: dict, now: datetime) -> bool:
    if reservation.get("status") != "ACTIVE":
        return False
    if limits.get("hours_left") is not None and limits["hours_left"] <= 0:
        return False
    end = parse_when(reservation.get("end"))
    flavor = reservation.get("flavor") or {}
    if end is None:
        return False
    max_end = now + timedelta(hours=(flavor.get("max_length_hours") or 0) - 23)
    return max_end.date() > end.date()


def reservation_actions(
    reservation: dict, limits: dict, now: datetime
) -> list[str]:
    status = reservation.get("status")
    actions = []
    if status == "ACTIVE":
        actions.append("launch")
    if can_extend(reservation, limits, now):
        actions.append("extend")
    if status in CALENDAR_STATUSES:
        actions.append("calendar")
    if status != "PENDING_CREATE":
        actions.append("delete")
    return actions


def selected_days(start: date, end: date) -> int:
    return (end - start).days + 1


def reservation_times(
    start: date, end: date, now: datetime
) -> tuple[datetime, datetime]:
    now = now.astimezone(UTC)
    if start == now.date():
        begin = now + timedelta(minutes=START_LEAD_MINUTES)
    else:
        begin = datetime(start.year, start.month, start.day, tzinfo=UTC)
    finish = datetime(end.year, end.month, end.day, *LAST_MINUTE, tzinfo=UTC)
    return begin.replace(microsecond=0), finish


def extend_end(end: date) -> datetime:
    return datetime(end.year, end.month, end.day, *LAST_MINUTE, tzinfo=UTC)


def eligibility(
    *,
    days: int,
    days_left: int | None,
    flavor_days: int,
    rate: float | None,
    su_used: float | None,
    su_budget: float | None,
) -> dict:
    reasons = []
    max_days = (
        flavor_days if days_left is None else min(days_left, flavor_days)
    )
    if days <= 0:
        reasons.append("Choose at least one day.")
    elif days > max_days:
        reasons.append(
            f"The flavour can be reserved for at most {max_days} days"
            " with your project's remaining limit."
        )
    estimate = None
    if rate:
        estimate = round(rate * 24 * max(days, 0), 2)
        if (
            su_budget is not None
            and su_budget != UNLIMITED
            and su_budget > 0
            and (estimate + (su_used or 0)) / su_budget > 1
        ):
            reasons.append(
                "The number of selected days exceeds your project's usage"
                " limit. If you require more, please amend your allocation."
            )
    return {
        "eligible": not reasons,
        "reasons": reasons,
        "max_days": max_days,
        "su_estimate": estimate,
    }


def extend_window(
    reservation: dict,
    slot: dict | None,
    limits: dict,
    now: datetime,
) -> dict:
    """How far an active reservation can be extended."""
    end = parse_when(reservation.get("end"))
    flavor = reservation.get("flavor") or {}
    if end is None:
        return {"available": False, "eligible_days": 0, "max_end": None}
    slot_start = parse_when((slot or {}).get("start"))
    slot_end = parse_when((slot or {}).get("end"))
    if slot_start is None or slot_end is None:
        return {"available": False, "eligible_days": 0, "max_end": None}
    if slot_start.date() > end.date() + timedelta(days=1):
        return {"available": False, "eligible_days": 0, "max_end": None}
    available = (slot_end.date() - end.date()).days
    remaining = (
        now.astimezone(UTC).date()
        + timedelta(days=flavor_max_days(flavor))
        - end.date()
    ).days
    candidates = [available, remaining]
    if limits.get("days_left") is not None:
        candidates.append(limits["days_left"])
    eligible = max(min(candidates), 0)
    max_end = end.date() + timedelta(days=eligible) if eligible else None
    return {
        "available": eligible > 0,
        "eligible_days": eligible,
        "min_end": (end.date() + timedelta(days=1)).isoformat(),
        "max_end": max_end.isoformat() if max_end else None,
    }


# --- calendar export (calendar_export.py) --------------------------------

PRODID = "-//Australian Research Data Commons//Nectar Reservation Service//EN"


def _flavor_name(reservation: dict) -> str:
    return (reservation.get("flavor") or {}).get("name") or ""


def _summary(reservation: dict) -> str:
    return f"Nectar reservation: {_flavor_name(reservation)}"


def _description(reservation: dict, detail_url: str) -> str:
    return (
        f"Nectar reservation {reservation.get('id')} "
        f"({_flavor_name(reservation)}).\n"
        f"Reservation details: {detail_url}"
    )


def _ics_escape(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _fold(line: str) -> list[str]:
    out = []
    while len(line.encode()) > 75:
        cut = 75
        while len(line[:cut].encode()) > 75:
            cut -= 1
        out.append(line[:cut])
        line = " " + line[cut:]
    out.append(line)
    return out


def _stamp(when: datetime) -> str:
    return when.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def ics_text(
    reservation: dict, detail_url: str, host: str, now: datetime
) -> str:
    start = parse_when(reservation.get("start")) or now
    end = parse_when(reservation.get("end")) or start
    lines = [
        "BEGIN:VCALENDAR",
        f"PRODID:{PRODID}",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        f"UID:nectar-reservation-{reservation.get('id')}@{host}",
        f"DTSTAMP:{_stamp(now)}",
        f"DTSTART:{_stamp(start)}",
        f"DTEND:{_stamp(end)}",
        f"SUMMARY:{_ics_escape(_summary(reservation))}",
        f"DESCRIPTION:{_ics_escape(_description(reservation, detail_url))}",
        f"URL:{detail_url}",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "DESCRIPTION:Nectar reservation starts in 1 hour",
        "TRIGGER:-PT1H",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    folded = [piece for line in lines for piece in _fold(line)]
    return "\r\n".join(folded) + "\r\n"


def google_calendar_url(reservation: dict, detail_url: str) -> str:
    start = parse_when(reservation.get("start"))
    end = parse_when(reservation.get("end"))
    params = {
        "action": "TEMPLATE",
        "text": _summary(reservation),
        "dates": f"{_stamp(start)}/{_stamp(end)}" if start and end else "",
        "details": _description(reservation, detail_url),
    }
    return "https://calendar.google.com/calendar/render?" + urlencode(params)


def outlook_calendar_url(
    reservation: dict, detail_url: str, personal: bool = False
) -> str:
    start = parse_when(reservation.get("start"))
    end = parse_when(reservation.get("end"))
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    params = {
        "path": "/calendar/action/compose",
        "rru": "addevent",
        "subject": _summary(reservation),
        "startdt": start.strftime(fmt) if start else "",
        "enddt": end.strftime(fmt) if end else "",
        "body": _description(reservation, detail_url),
    }
    host = "outlook.live.com" if personal else "outlook.office.com"
    return f"https://{host}/calendar/0/deeplink/compose?" + urlencode(params)
