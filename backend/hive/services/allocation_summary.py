"""The header's project box: allocation, bundle, SU budget and SU used.

Replaces the three calls Horizon's theme fires on every page
(``/api/nectar/allocation/{current,usage,su-budget}``) with one cached
answer. Each upstream failure is reported in ``errors`` and marks the
result ``partial`` rather than failing the whole page; partial results are
not cached so the next request retries.
"""

from hive.cache import policy
from hive.cache.redis import CacheResult
from hive.clients.nectar import AllocationsClient, CloudKittyClient
from hive.errors import HiveError
from hive.nectar import allocation as rules
from hive.services.context import Context


def _error(source: str, exc: HiveError) -> dict:
    return {"source": source, "error": exc.code, "message": exc.message}


async def fetch_allocation_summary(ctx: Context) -> dict:
    settings = ctx.settings
    project = ctx.scoped.project
    result: dict = {
        "allocation": None,
        "su_budget": None,
        "su_used": None,
        "quotas": {},
        "is_trial": rules.is_trial(
            project.name, settings.trial_project_prefix
        ),
        "links": {
            "new_request": f"{settings.horizon_url}/allocation/request/",
            "my_requests": f"{settings.horizon_url}/allocation/user_requests/",
        },
        "partial": False,
        "errors": [],
    }
    allocation = None
    try:
        client = AllocationsClient(ctx.http, settings, ctx.scoped)
        base = {"project_id": project.id, "status": rules.APPROVED}
        rows = await client.allocations(**base, parent_request__isnull="True")
        allocation = rules.pick_current(rows)
        if allocation is None:
            # Under renewal the latest approved record has a parent.
            allocation = rules.pick_current(await client.allocations(**base))
    except HiveError as exc:
        result["partial"] = True
        result["errors"].append(_error("allocations", exc))

    if allocation is None:
        return result

    result["allocation"] = rules.summary_fields(allocation)
    result["quotas"] = rules.quotas_by_resource(allocation)
    result["su_budget"] = rules.su_budget(allocation)

    begin = allocation.get("start_date")
    end = allocation.get("end_date")
    if begin and end:
        try:
            usage = await CloudKittyClient(
                ctx.http, settings, ctx.scoped
            ).summary(begin, end)
            rows = (usage or {}).get("results") or []
            rate = rows[0].get("rate", 0) if rows else 0
            result["su_used"] = round(float(rate or 0), 2)
        except HiveError as exc:
            result["partial"] = True
            result["errors"].append(_error("cloudkitty", exc))
    return result


async def allocation_summary(
    ctx: Context, refresh: bool = False
) -> CacheResult:
    if refresh:
        await ctx.forget(policy.ALLOCATION)

    async def fetch():
        return await fetch_allocation_summary(ctx)

    return await ctx.cached(
        policy.ALLOCATION,
        fetch,
        should_cache=lambda value: not value.get("partial"),
    )
