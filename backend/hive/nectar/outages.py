"""Langstroth outage selection, as ``nectar_dashboard/api/rest/langstroth.py``.

The langstroth API cannot express "ongoing OR recently ended" in one
filtered query, so three disjoint queries are issued (active; starting
within 14 days; ended within the last day) and merged by id.
"""

from datetime import datetime, timedelta

UPCOMING_DAYS = 14
RECENT_DAYS = 1

FIELDS = (
    "id",
    "title",
    "description",
    "severity",
    "scheduled",
    "scheduled_display",
    "status_display",
    "start",
    "end",
    "planned_end",
    "cancelled",
)


def query_window(now: datetime) -> tuple[str, str]:
    """``(recent_start, upcoming_end)`` ISO timestamps for the queries."""
    window_start = (now - timedelta(days=RECENT_DAYS)).isoformat()
    window_end = (now + timedelta(days=UPCOMING_DAYS)).isoformat()
    return window_start, window_end


def queries(now: datetime) -> list[dict]:
    window_start, window_end = query_window(now)
    return [
        {"activity": "active"},
        {"activity": "upcoming", "start__lte": window_end},
        {"cancelled": "False", "end__gte": window_start},
    ]


def merge(*groups: list[dict]) -> list[dict]:
    """Concatenate result groups, de-duplicating by id, order preserved."""
    seen: dict = {}
    for group in groups:
        for outage in group:
            seen.setdefault(outage.get("id"), outage)
    return list(seen.values())


def serialise(outage: dict, base_url: str) -> dict:
    item = {field: outage.get(field) for field in FIELDS}
    item["url"] = f"{base_url.rstrip('/')}/{outage.get('id')}/"
    return item
