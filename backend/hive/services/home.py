"""The home page widgets beyond ``/me``: Langstroth outages, Varroa
security risks, the allocation summary and the ARDC news feed.

Each answers a ``CacheResult`` whose value is the widget's payload; a
widget whose service is not in the catalog answers ``available: False``
instead of failing the page.
"""

import asyncio
from dataclasses import replace
from datetime import datetime, UTC

from hive.cache import policy
from hive.cache.redis import CacheResult
from hive.clients.nectar import LangstrothClient, VarroaClient
from hive.errors import ServiceNotEnabled
from hive.nectar import outages as outage_rules
from hive.services import allocation_summary as allocation_service
from hive.services.context import Context
from hive.services import news as news_service


UNAVAILABLE = CacheResult.bypass({"items": [], "available": False})


def _available(result: CacheResult) -> CacheResult:
    return replace(result, value={"items": result.value, "available": True})


async def outages(ctx: Context) -> CacheResult:
    """Ongoing, upcoming and recently ended outages, shared by every user
    (``nectar_dashboard/api/rest/langstroth.py``): the three queries run
    in parallel and are merged by id."""
    client = LangstrothClient(ctx.http, ctx.settings, ctx.scoped)

    async def fetch() -> list[dict]:
        queries = outage_rules.queries(datetime.now(UTC))
        groups = await asyncio.gather(*(client.outages(**q) for q in queries))
        return [
            outage_rules.serialise(outage, ctx.settings.outage_base_url)
            for outage in outage_rules.merge(*groups)
        ]

    try:
        result = await ctx.cached(policy.OUTAGES, fetch)
    except ServiceNotEnabled:
        return UNAVAILABLE
    return _available(result)


async def security_risks(
    ctx: Context,
    resource_type: str | None = None,
    resource_id: str | None = None,
) -> CacheResult:
    """The project's Varroa risks. The whole list is cached per project
    (the SPA joins it by resource); a filtered query goes straight to
    Varroa."""
    params = {
        key: value
        for key, value in (
            ("resource_type", resource_type),
            ("resource_id", resource_id),
        )
        if value
    }
    client = VarroaClient(ctx.http, ctx.settings, ctx.scoped)
    try:
        if params:
            items = await client.security_risks(**params)
            return CacheResult.bypass({"items": items, "available": True})
        result = await ctx.cached(policy.RISKS, client.security_risks)
    except ServiceNotEnabled:
        return UNAVAILABLE
    return _available(result)


async def allocation_summary(ctx: Context, refresh: bool) -> CacheResult:
    return await allocation_service.allocation_summary(ctx, refresh=refresh)


async def news(ctx: Context) -> CacheResult:
    result = await news_service.ardc_news(ctx)
    return replace(result, value={"items": result.value})
