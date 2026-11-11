"""Everything the home page and the header need beyond ``/me``:
outages, allocation summary, security risks, news."""

from fastapi import APIRouter, Response

from hive.api.replies import cached
from hive.deps import ContextDep
from hive.schemas.responses.home import (
    NewsResponse,
    OutagesResponse,
    RisksResponse,
)
from hive.schemas.responses.usage import AllocationSummary
from hive.services import home

router = APIRouter(tags=["home"])


@router.get("/outages")
async def outages(response: Response, ctx: ContextDep) -> OutagesResponse:
    return cached(response, await home.outages(ctx), OutagesResponse)


@router.get("/allocation/summary")
async def allocation_summary(
    response: Response, ctx: ContextDep, refresh: bool = False
) -> AllocationSummary:
    result = await home.allocation_summary(ctx, refresh)
    return cached(response, result, AllocationSummary)


@router.get("/security/risks")
async def security_risks(
    response: Response,
    ctx: ContextDep,
    resource_type: str | None = None,
    resource_id: str | None = None,
) -> RisksResponse:
    """All of the project's risks in one call; the SPA joins by resource."""
    result = await home.security_risks(ctx, resource_type, resource_id)
    return cached(response, result, RisksResponse)


@router.get("/news/ardc")
async def ardc_news(response: Response, ctx: ContextDep) -> NewsResponse:
    return cached(response, await home.news(ctx), NewsResponse)
