"""Replies of the Usage Trend and Allocation Usage pages: CloudKitty
service unit (SU) usage, joined with Gnocchi's instance names, and the
burn-down of the current allocation's SU budget."""

from pydantic import ConfigDict

from hive.schemas.responses import Cached, ResponseModel


class UsageSourceError(ResponseModel):
    """An upstream source the reply is missing; the reply is ``partial``."""

    source: str
    error: str
    message: str


class UsageOptions(ResponseModel):
    """The date picker's bounds: nothing is recorded before
    ``data_from``."""

    data_from: str
    default_begin: str
    default_end: str


class UsageRow(ResponseModel):
    """A CloudKitty summary row, passed through as CloudKitty returns it;
    the other keys are the ``groupby`` columns."""

    model_config = ConfigDict(extra="allow")

    begin: str | None = None
    end: str | None = None
    rate: float | str | None = None
    qty: float | str | None = None


class UsageSummary(Cached):
    begin: str
    end: str
    sum: float
    data: list[UsageRow]


class UsageInstance(ResponseModel):
    """An instance's SU over the range. The Gnocchi fields are ``None``
    for an instance Gnocchi no longer knows; it keeps its id as name."""

    id: str
    name: str
    rate: float
    qty: float | None
    begin: str | None
    end: str | None
    display_name: str | None
    availability_zone: str | None
    flavor_name: str | None
    started_at: str | None
    ended_at: str | None


class MostUsedInstance(ResponseModel):
    name: str
    rate: float


class MostUsed(ResponseModel):
    """The five instances with the most SU; ``other`` sums the rest."""

    count: int
    items: list[MostUsedInstance]
    other: float


class UsageInstancesResponse(Cached):
    begin: str
    end: str
    sum: float
    items: list[UsageInstance]
    most_used: MostUsed
    partial: bool
    errors: list[UsageSourceError]


class CurrentAllocation(ResponseModel):
    """The project's current approved allocation, as Horizon's
    ``/rest_api/allocations/`` serialiser sends it."""

    id: int
    project_id: str
    project_name: str
    project_description: str | None
    status: str
    status_display: str | None
    # Horizon's serialiser allows an approved allocation without dates.
    start_date: str | None
    end_date: str | None
    bundle: str | None
    allocation_home_display: str | None
    national: bool | None
    managed: bool | None


class AllocationQuota(ResponseModel):
    """One resource's quota in the allocation, and its zone."""

    quota: float | None
    zone: str | None


class AllocationLinks(ResponseModel):
    """Where Horizon's allocation request forms live."""

    new_request: str
    my_requests: str


class AllocationSummary(Cached):
    """The home page's allocation card: the current allocation, its
    quotas by resource code and its SU budget and use. ``-1`` means an
    unlimited budget; ``su_used`` is ``None`` when CloudKitty could not
    be asked."""

    allocation: CurrentAllocation | None
    su_budget: int | None
    su_used: float | None
    quotas: dict[str, AllocationQuota]
    is_trial: bool
    links: AllocationLinks
    partial: bool
    errors: list[UsageSourceError]


class BurnDownPoint(ResponseModel):
    """The SU used up to ``date``; ``None`` for days after today."""

    date: str
    value: float | None


class BurnDownGuidePoint(ResponseModel):
    """An end of the guide line, from zero at the start to the budget at
    the end of the allocation."""

    date: str
    value: float


class AllocationUsage(Cached):
    """The burn-down of the current allocation's SU budget. When it
    cannot be drawn (no allocation, no or unlimited budget, CloudKitty
    down) ``available`` is false, ``reason`` says why and the burn-down
    fields are ``None``."""

    available: bool
    reason: str | None = None
    allocation: CurrentAllocation | None
    su_budget: int | None
    su_used: float | None = None
    su_remaining: float | None = None
    total_hours: float | None = None
    today: str | None = None
    day_budget: float | None = None
    on_track: float | None = None
    budget_tracking: float | None = None
    at_risk: bool | None = None
    cumulative: list[BurnDownPoint] | None = None
    guide: list[BurnDownGuidePoint] | None = None
    partial: bool
    errors: list[UsageSourceError]
