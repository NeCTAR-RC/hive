"""CloudKitty usage summaries and the Usage Trend and Allocation Usage
pages (``nectar_dashboard/api/usage.py``, ``usage/allocation_usage``)."""

from datetime import date

from hive.cache import policy
from hive.cache.redis import CacheResult
from hive.clients.nectar import CloudKittyClient, GnocchiClient
from hive.config import Settings
from hive.errors import BadRequest, HiveError, ServiceNotEnabled
from hive.nectar import allocation as allocation_rules
from hive.nectar import usage as rules
from hive.schemas.responses.usage import UsageOptions
from hive.services import allocation_summary as allocation_service
from hive.services.concurrency import bounded_gather
from hive.services.context import Context
from hive.times import today_utc

DATE_FORMAT = rules.DATE_FORMAT
DEFAULT_DAYS = rules.DEFAULT_DAYS
GNOCCHI_BATCH = 100
default_range = rules.default_range
total_rate = rules.total_rate


def requested_range(
    begin: str | None, end: str | None, settings: Settings
) -> tuple[str, str]:
    """The date range a request asks for, validated; the default range
    when either end is missing. Nothing before ``usage_data_from`` exists,
    so an earlier start is raised to it."""
    if not begin or not end:
        return default_range()
    try:
        first = date.fromisoformat(begin)
        last = date.fromisoformat(end)
    except ValueError as exc:
        raise BadRequest("Dates must be YYYY-MM-DD.") from exc
    if last < first:
        raise BadRequest("The end date must not be before the start date.")
    first = max(first, date.fromisoformat(settings.usage_data_from))
    return first.isoformat(), last.isoformat()


def options(settings: Settings) -> UsageOptions:
    begin, end = default_range()
    return UsageOptions.model_validate(
        {
            "data_from": settings.usage_data_from,
            "default_begin": begin,
            "default_end": end,
        }
    )


async def summary(
    ctx: Context,
    *,
    begin: str | None = None,
    end: str | None = None,
    resource_type: str | None = None,
    groupby: str | None = None,
) -> CacheResult:
    begin, end = requested_range(begin, end, ctx.settings)

    async def fetch():
        filters = {"type": resource_type} if resource_type else None
        rows = await _cloudkitty(ctx).summary_rows(
            begin, end, filters=filters, groupby=groupby
        )
        return {
            "begin": begin,
            "end": end,
            "sum": total_rate(rows),
            "data": rows,
        }

    return await ctx.cached(
        policy.USAGE, fetch, begin, end, resource_type or "-", groupby or "-"
    )


def _cloudkitty(ctx: Context) -> CloudKittyClient:
    return CloudKittyClient(ctx.http, ctx.settings, ctx.scoped)


async def _instance_resources(ctx: Context, ids: list[str]) -> list[dict]:
    gnocchi = GnocchiClient(ctx.http, ctx.settings, ctx.scoped)

    async def batch(chunk: list[str]) -> list[dict]:
        return await gnocchi.search_resources(
            "instance", {"in": {"id": chunk}}, limit=len(chunk)
        )

    chunks = [
        ids[i : i + GNOCCHI_BATCH] for i in range(0, len(ids), GNOCCHI_BATCH)
    ]
    results = await bounded_gather(
        chunks, batch, ctx.settings.upstream_fan_out
    )
    return [resource for group in results for resource in group]


async def instances(
    ctx: Context, begin: str | None = None, end: str | None = None
) -> CacheResult:
    """Per-instance SU over the range, named through Gnocchi; names are
    left out (``partial``) rather than failing when Gnocchi is down."""
    begin, end = requested_range(begin, end, ctx.settings)

    async def fetch():
        rows = await _cloudkitty(ctx).summary_rows(
            begin, end, filters={"type": "instance"}, groupby="id"
        )
        ids = [row["id"] for row in rows if row.get("id")]
        resources: list[dict] = []
        errors = []
        if ids:
            try:
                resources = await _instance_resources(ctx, ids)
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

    return await ctx.cached(
        policy.USAGE_INSTANCES,
        fetch,
        begin,
        end,
        should_cache=lambda value: not value.get("partial"),
    )


async def allocation_usage(
    ctx: Context, today: date | None = None
) -> CacheResult:
    """The burn-down against the SU budget of the current allocation."""
    today = today or today_utc()

    async def fetch():
        summary_result = await allocation_service.allocation_summary(ctx)
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
            # Nothing to chart, as the allocation summary treats it.
            base["reason"] = "This project's allocation has no dates."
            return base
        start = date.fromisoformat(begin_text)
        end = date.fromisoformat(end_text)
        client = _cloudkitty(ctx)
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

    return await ctx.cached(
        policy.USAGE_ALLOCATION,
        fetch,
        should_cache=lambda value: not value.get("partial"),
    )
