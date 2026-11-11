"""Usage Trend and Allocation Usage (CloudKitty, Gnocchi, allocations)."""

from fastapi import APIRouter, Response

from hive.api.replies import cached
from hive.deps import ContextDep, SettingsDep
from hive.errors import BadRequest
from hive.nectar import usage as rules
from hive.schemas.responses.usage import (
    AllocationUsage,
    UsageInstancesResponse,
    UsageOptions,
    UsageSummary,
)
from hive.services import usage

router = APIRouter(prefix="/usage", tags=["usage"])


@router.get("/options")
async def options(settings: SettingsDep) -> UsageOptions:
    return usage.options(settings)


@router.get("/summary")
async def summary(
    response: Response,
    ctx: ContextDep,
    begin: str | None = None,
    end: str | None = None,
    type: str | None = None,
    groupby: str | None = None,
) -> UsageSummary:
    if type is not None and type not in rules.SUMMARY_TYPES:
        raise BadRequest("Unknown usage resource type.")
    if groupby is not None and groupby not in rules.SUMMARY_GROUPBY:
        raise BadRequest("Unknown usage grouping.")
    result = await usage.summary(
        ctx, begin=begin, end=end, resource_type=type, groupby=groupby
    )
    return cached(response, result, UsageSummary)


@router.get("/instances")
async def instances(
    response: Response,
    ctx: ContextDep,
    begin: str | None = None,
    end: str | None = None,
) -> UsageInstancesResponse:
    return cached(
        response,
        await usage.instances(ctx, begin, end),
        UsageInstancesResponse,
    )


@router.get("/allocation")
async def allocation(response: Response, ctx: ContextDep) -> AllocationUsage:
    return cached(response, await usage.allocation_usage(ctx), AllocationUsage)
