"""CloudKitty usage summaries and the Usage Trend and Allocation Usage
pages (``nectar_dashboard/api/usage.py``, ``usage/allocation_usage``)."""

import asyncio
from datetime import date

import httpx

from hive.cache.redis import Cache, CacheResult
from hive.clients.nectar import CloudKittyClient, GnocchiClient
from hive.config import Settings
from hive.errors import HiveError, ServiceNotEnabled
from hive.nectar import allocation as allocation_rules
from hive.nectar import usage as rules
from hive.services import allocation_summary as allocation_service
from hive.session.model import ScopedToken

DATE_FORMAT = rules.DATE_FORMAT
DEFAULT_DAYS = rules.DEFAULT_DAYS
TTL = 1800
STALE_TTL = 10800
GNOCCHI_BATCH = 100
default_range = rules.default_range
total_rate = rules.total_rate


async def summary(
    http: httpx.AsyncClient,
    settings: Settings,
    cache: Cache,
    scoped: ScopedToken,
    *,
    begin: str | None = None,
    end: str | None = None,
    resource_type: str | None = None,
    groupby: str | None = None,
) -> CacheResult:
    if not begin or not end:
        begin, end = default_range()
    key = cache.project_key(
        scoped.project.id,
        "usage",
        begin,
        end,
        resource_type or "-",
        groupby or "-",
    )

    async def fetch():
        filters = {"type": resource_type} if resource_type else None
        rows = await CloudKittyClient(http, settings, scoped).summary_rows(
            begin, end, filters=filters, groupby=groupby
        )
        return {
            "begin": begin,
            "end": end,
            "sum": total_rate(rows),
            "data": rows,
        }

    return await cache.get_or_fetch(
        key, fetch, ttl=TTL, stale_ttl=STALE_TTL, name="usage"
    )


async def _instance_resources(
    http: httpx.AsyncClient,
    settings: Settings,
    scoped: ScopedToken,
    ids: list[str],
) -> list[dict]:
    gnocchi = GnocchiClient(http, settings, scoped)
    semaphore = asyncio.Semaphore(4)

    async def batch(chunk: list[str]) -> list[dict]:
        async with semaphore:
            return await gnocchi.search_resources(
                "instance", {"in": {"id": chunk}}, limit=len(chunk)
            )

    chunks = [
        ids[i : i + GNOCCHI_BATCH] for i in range(0, len(ids), GNOCCHI_BATCH)
    ]
    results = await asyncio.gather(*(batch(c) for c in chunks))
    return [resource for group in results for resource in group]


async def instances(
    http: httpx.AsyncClient,
    settings: Settings,
    cache: Cache,
    scoped: ScopedToken,
    begin: str,
    end: str,
) -> CacheResult:
    """Per-instance SU over the range, named through Gnocchi; names are
    left out (``partial``) rather than failing when Gnocchi is down."""
    key = cache.project_key(scoped.project.id, "usage-instances", begin, end)

    async def fetch():
        rows = await CloudKittyClient(http, settings, scoped).summary_rows(
            begin, end, filters={"type": "instance"}, groupby="id"
        )
        ids = [row["id"] for row in rows if row.get("id")]
        resources: list[dict] = []
        errors = []
        if ids:
            try:
                resources = await _instance_resources(
                    http, settings, scoped, ids
                )
            except HiveError as exc:
                errors.append(
                    {
                        "source": "gnocchi",
                        "error": exc.code,
                        "message": exc.message,
                    }
                )
        items = rules.join_instances(rows, resources)
        return {
            "begin": begin,
            "end": end,
            "sum": total_rate(rows),
            "items": items,
            "most_used": rules.most_used(items),
            "partial": bool(errors),
            "errors": errors,
        }

    return await cache.get_or_fetch(
        key,
        fetch,
        ttl=TTL,
        stale_ttl=STALE_TTL,
        name="usage-instances",
        should_cache=lambda value: not value.get("partial"),
    )


async def allocation_usage(
    http: httpx.AsyncClient,
    settings: Settings,
    cache: Cache,
    scoped: ScopedToken,
    today: date | None = None,
) -> CacheResult:
    """The burn-down against the SU budget of the current allocation."""
    key = cache.project_key(scoped.project.id, "usage-allocation")
    today = today or date.today()

    async def fetch():
        summary_result = await allocation_service.allocation_summary(
            http, settings, cache, scoped
        )
        current = summary_result.value
        allocation = current.get("allocation")
        budget = current.get("su_budget")
        base = {
            "available": False,
            "allocation": allocation,
            "su_budget": budget,
            "partial": current.get("partial", False),
            "errors": list(current.get("errors") or []),
        }
        if not allocation or budget is None or budget <= 0:
            base["reason"] = (
                "This project has no SU budget to track."
                if allocation
                else "This project has no approved allocation."
            )
            return base
        if budget == allocation_rules.UNLIMITED:
            base["reason"] = "This project's SU budget is unlimited."
            return base
        begin_text = allocation.get("start_date")
        end_text = allocation.get("end_date")
        if not begin_text or not end_text:
            # As fetch_allocation_summary: no dates, nothing to chart.
            base["reason"] = "This project's allocation has no dates."
            return base
        start = date.fromisoformat(begin_text)
        end = date.fromisoformat(end_text)
        client = CloudKittyClient(http, settings, scoped)
        try:
            daily = await client.summary_rows(
                begin_text, end_text, groupby="time-1d"
            )
            totals = await client.summary(begin_text, end_text)
        except ServiceNotEnabled:
            raise
        except HiveError as exc:
            base["partial"] = True
            base["errors"].append(
                {
                    "source": "cloudkitty",
                    "error": exc.code,
                    "message": exc.message,
                }
            )
            base["reason"] = "Usage data is unavailable at the moment."
            return base
        first = (totals.get("results") or [{}])[0]
        su_used = round(float(first.get("rate") or 0), 2)
        return {
            **base,
            "available": True,
            "su_used": su_used,
            "su_remaining": round(budget - su_used, 2),
            "total_hours": first.get("qty") or 0,
            "today": today.isoformat(),
            **rules.burn_down(budget, start, end, daily, today),
        }

    return await cache.get_or_fetch(
        key,
        fetch,
        ttl=TTL,
        stale_ttl=STALE_TTL,
        name="usage-allocation",
        should_cache=lambda value: not value.get("partial"),
    )
