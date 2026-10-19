"""Usage Trend and Allocation Usage (CloudKitty, Gnocchi, allocations)."""

from datetime import date

from fastapi import APIRouter, Depends, Response
import httpx

from hive.cache.redis import Cache, CacheResult
from hive.config import Settings
from hive.deps import get_cache, get_http, get_session, get_settings
from hive.deps import SessionContext
from hive.errors import BadRequest
from hive.nectar import usage as usage_rules
from hive.services import usage as usage_service

router = APIRouter(prefix="/usage", tags=["usage"])


def _cache_headers(response: Response, result: CacheResult) -> None:
    response.headers["X-Hive-Cache"] = result.state


def _range(
    begin: str | None, end: str | None, settings: Settings
) -> tuple[str, str]:
    if not begin or not end:
        return usage_service.default_range()
    try:
        first = date.fromisoformat(begin)
        last = date.fromisoformat(end)
    except ValueError as exc:
        raise BadRequest("Dates must be YYYY-MM-DD.") from exc
    if last < first:
        raise BadRequest("The end date must not be before the start date.")
    floor = date.fromisoformat(settings.usage_data_from)
    if first < floor:
        first = floor
    return first.isoformat(), last.isoformat()


@router.get("/options")
async def options(settings: Settings = Depends(get_settings)):
    begin, end = usage_service.default_range()
    return {
        "data_from": settings.usage_data_from,
        "default_begin": begin,
        "default_end": end,
    }


@router.get("/summary")
async def summary(
    response: Response,
    begin: str | None = None,
    end: str | None = None,
    type: str | None = None,
    groupby: str | None = None,
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
    http: httpx.AsyncClient = Depends(get_http),
    cache: Cache = Depends(get_cache),
):
    if type is not None and type not in usage_rules.SUMMARY_TYPES:
        raise BadRequest("Unknown usage resource type.")
    if groupby is not None and groupby not in usage_rules.SUMMARY_GROUPBY:
        raise BadRequest("Unknown usage grouping.")
    scoped = await ctx.scoped()
    if begin or end:
        begin, end = _range(begin, end, settings)
    result = await usage_service.summary(
        http,
        settings,
        cache,
        scoped,
        begin=begin,
        end=end,
        resource_type=type,
        groupby=groupby,
    )
    _cache_headers(response, result)
    return {**result.value, "fetched_at": result.fetched_at}


@router.get("/instances")
async def instances(
    response: Response,
    begin: str | None = None,
    end: str | None = None,
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
    http: httpx.AsyncClient = Depends(get_http),
    cache: Cache = Depends(get_cache),
):
    scoped = await ctx.scoped()
    begin, end = _range(begin, end, settings)
    result = await usage_service.instances(
        http, settings, cache, scoped, begin, end
    )
    _cache_headers(response, result)
    return {**result.value, "fetched_at": result.fetched_at}


@router.get("/allocation")
async def allocation(
    response: Response,
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
    http: httpx.AsyncClient = Depends(get_http),
    cache: Cache = Depends(get_cache),
):
    scoped = await ctx.scoped()
    result = await usage_service.allocation_usage(
        http, settings, cache, scoped
    )
    _cache_headers(response, result)
    return {**result.value, "fetched_at": result.fetched_at}
