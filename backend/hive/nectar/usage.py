"""Usage Trend and Allocation Usage computations.

- Per-instance rows: CloudKitty's summary grouped by ``id`` joined with the
  Gnocchi ``instance`` resources on ``id``, copying ``display_name``,
  ``availability_zone``, ``flavor_name``, ``started_at`` and ``ended_at``
  and rounding ``rate`` to two places (``nectar_dashboard/api/usage.py:
  97-131``). Instances Gnocchi no longer knows keep their id as the name.
- Most used: the five largest rates, the rest summed as "other"
  (``api/usage.py:67-94``).
- Allocation burn-down: a daily budget is the SU budget over the
  allocation's days; the cumulative line stops at today and the guide runs
  from zero at the start to the budget at the end; the project is at risk
  when the total used exceeds the on-track figure
  (``usage/allocation_usage/views.py:14-74``). Rates on future-dated rows
  are not counted and a zero-length allocation has no daily budget, which
  the Horizon view gets wrong.
- Summary filters: Horizon passes ``type`` and ``groupby`` straight to
  CloudKitty (``api/rest/usage.py:21-25``). Hive allowlists both, since
  they also become cache key parts: ``instance`` is the only resource type
  Horizon names (``api/usage.py:67-114``), and the groupings are the ones
  Horizon and the SPA use (``time-1d`` in ``allocation_usage/views.py:38``,
  ``id`` in ``api/usage.py:74``, ``type`` for the Usage Trend by-type
  series).
"""

from datetime import date, datetime, timedelta

DATE_FORMAT = "%Y-%m-%d"
DEFAULT_DAYS = 90
INSTANCE_ATTRS = (
    "display_name",
    "availability_zone",
    "flavor_name",
    "started_at",
    "ended_at",
)
MOST_USED = 5
SUMMARY_TYPES = frozenset({"instance"})
SUMMARY_GROUPBY = frozenset({"id", "time-1d", "type"})


def default_range(today: date | None = None, days: int = DEFAULT_DAYS):
    today = today or date.today()
    begin = today - timedelta(days=days)
    return begin.strftime(DATE_FORMAT), today.strftime(DATE_FORMAT)


def total_rate(rows: list[dict]) -> float:
    total = 0.0
    for row in rows:
        rate = row.get("rate")
        if rate:
            total += float(rate)
    return round(total, 2)


def _rate(row: dict) -> float:
    try:
        return float(row.get("rate") or 0)
    except (TypeError, ValueError):
        return 0.0


def join_instances(rows: list[dict], resources: list[dict]) -> list[dict]:
    by_id = {r.get("id"): r for r in resources if r.get("id")}
    items = []
    for row in rows:
        instance_id = row.get("id")
        resource = by_id.get(instance_id) or {}
        item = {
            "id": instance_id,
            "rate": round(_rate(row), 2),
            "qty": row.get("qty"),
            "begin": row.get("begin"),
            "end": row.get("end"),
        }
        for attr in INSTANCE_ATTRS:
            item[attr] = resource.get(attr)
        item["name"] = item["display_name"] or instance_id
        items.append(item)
    items.sort(key=lambda item: item["rate"], reverse=True)
    return items


def most_used(items: list[dict], limit: int = MOST_USED) -> dict:
    ordered = sorted(items, key=lambda item: _rate(item), reverse=True)
    top = [
        {
            "name": item.get("name") or item.get("id"),
            "rate": round(_rate(item), 2),
        }
        for item in ordered[:limit]
    ]
    other = round(sum(_rate(item) for item in ordered[limit:]), 2)
    return {"count": len(ordered), "items": top, "other": other}


def by_type(rows: list[dict]) -> list[dict]:
    items = [
        {
            "type": row.get("type") or "other",
            "rate": round(_rate(row), 2),
            "qty": row.get("qty"),
        }
        for row in rows
    ]
    items.sort(key=lambda item: item["rate"], reverse=True)
    return items


def _row_date(row: dict) -> date | None:
    value = row.get("begin")
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except ValueError:
        return None


def burn_down(
    su_budget: float,
    start: date,
    end: date,
    rows: list[dict],
    today: date,
) -> dict:
    total_days = (end - start).days
    day_budget = su_budget / total_days if total_days > 0 else None
    days_used = max((today - start).days, 0)
    on_track = day_budget * days_used if day_budget is not None else None
    cumulative = []
    total = 0.0
    for row in sorted(rows, key=lambda r: str(r.get("begin") or "")):
        when = _row_date(row)
        if when is None:
            continue
        if when > today:
            cumulative.append({"date": when.isoformat(), "value": None})
            continue
        total += _rate(row)
        cumulative.append({"date": when.isoformat(), "value": round(total, 2)})
    tracking = round(total - on_track, 2) if on_track is not None else None
    return {
        "day_budget": round(day_budget, 2) if day_budget is not None else None,
        "on_track": round(on_track, 2) if on_track is not None else None,
        "budget_tracking": tracking,
        "at_risk": tracking is not None and tracking > 0,
        "cumulative": cumulative,
        "guide": [
            {"date": start.isoformat(), "value": 0},
            {"date": end.isoformat(), "value": su_budget},
        ],
    }
