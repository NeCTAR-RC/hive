"""Everything the home page and the header need beyond ``/me``:
outages, allocation summary, security risks, news."""

from datetime import datetime, UTC

from fastapi import APIRouter, Depends, Response
import httpx

from hive.cache.redis import Cache, CacheResult
from hive.clients.nectar import LangstrothClient, VarroaClient
from hive.config import Settings
from hive.deps import get_cache, get_http, get_session, get_settings
from hive.deps import SessionContext
from hive.errors import ServiceNotEnabled
from hive.nectar import outages as outage_rules
from hive.services import allocation_summary as allocation_service
from hive.services import news as news_service

router = APIRouter(tags=["home"])

OUTAGES_TTL = 60
OUTAGES_STALE = 600
RISKS_TTL = 120
RISKS_STALE = 900


def _cache_headers(response: Response, result: CacheResult) -> None:
    response.headers["X-Hive-Cache"] = result.state


@router.get("/outages")
async def outages(
    response: Response,
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
    http: httpx.AsyncClient = Depends(get_http),
    cache: Cache = Depends(get_cache),
):
    scoped = await ctx.scoped()

    async def fetch():
        client = LangstrothClient(http, settings, scoped)
        now = datetime.now(UTC)
        groups = [
            await client.outages(**query)
            for query in outage_rules.queries(now)
        ]
        return [
            outage_rules.serialise(o, settings.outage_base_url)
            for o in outage_rules.merge(*groups)
        ]

    try:
        result = await cache.get_or_fetch(
            cache.global_key("outages"),
            fetch,
            ttl=OUTAGES_TTL,
            stale_ttl=OUTAGES_STALE,
            name="outages",
        )
    except ServiceNotEnabled:
        return {"items": [], "available": False, "fetched_at": None}
    _cache_headers(response, result)
    return {
        "items": result.value,
        "available": True,
        "fetched_at": result.fetched_at,
    }


@router.get("/allocation/summary")
async def allocation_summary(
    response: Response,
    refresh: bool = False,
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
    http: httpx.AsyncClient = Depends(get_http),
    cache: Cache = Depends(get_cache),
):
    scoped = await ctx.scoped()
    result = await allocation_service.allocation_summary(
        http, settings, cache, scoped, refresh=refresh
    )
    _cache_headers(response, result)
    return {**result.value, "fetched_at": result.fetched_at}


@router.get("/security/risks")
async def security_risks(
    response: Response,
    resource_type: str | None = None,
    resource_id: str | None = None,
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
    http: httpx.AsyncClient = Depends(get_http),
    cache: Cache = Depends(get_cache),
):
    """All of the project's risks in one call; the SPA joins by resource."""
    scoped = await ctx.scoped()
    params = {}
    if resource_type:
        params["resource_type"] = resource_type
    if resource_id:
        params["resource_id"] = resource_id

    async def fetch():
        return await VarroaClient(http, settings, scoped).security_risks(
            **params
        )

    try:
        if params:
            items = await fetch()
            return {"items": items, "available": True, "fetched_at": None}
        result = await cache.get_or_fetch(
            cache.project_key(scoped.project.id, "risks"),
            fetch,
            ttl=RISKS_TTL,
            stale_ttl=RISKS_STALE,
            name="risks",
        )
    except ServiceNotEnabled:
        return {"items": [], "available": False, "fetched_at": None}
    _cache_headers(response, result)
    return {
        "items": result.value,
        "available": True,
        "fetched_at": result.fetched_at,
    }


@router.get("/news/ardc")
async def ardc_news(
    response: Response,
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
    http: httpx.AsyncClient = Depends(get_http),
    cache: Cache = Depends(get_cache),
):
    result = await news_service.ardc_news(http, cache, settings.rss_url)
    _cache_headers(response, result)
    return {"items": result.value, "fetched_at": result.fetched_at}
