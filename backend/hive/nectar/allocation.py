"""Allocation helpers, as ``nectar_dashboard/api/allocation.py`` and the
``AllocationRequest`` model (``su_budget``, ``get_quota``, ``quota_list``).

Allocation data comes from Horizon's ``/rest_api/allocations/`` serialiser:
``quotas`` is a list of ``{zone, resource, quota}`` and, when the allocation
has a bundle, contains a synthetic ``rating.budget`` entry carrying the SU
budget. ``-1`` means unlimited everywhere the SPA shows a budget.
"""

APPROVED = "A"
BUDGET_RESOURCE = "rating.budget"
UNLIMITED = -1

SUMMARY_FIELDS = (
    "id",
    "project_id",
    "project_name",
    "project_description",
    "status",
    "status_display",
    "start_date",
    "end_date",
    "bundle",
    "allocation_home_display",
    "national",
    "managed",
)


def pick_current(allocations: list[dict]) -> dict | None:
    """First approved allocation; callers query parentless first, then
    any approved (an allocation under renewal has a parent)."""
    for allocation in allocations:
        if allocation.get("status", APPROVED) == APPROVED:
            return allocation
    return None


def quotas_by_resource(allocation: dict) -> dict[str, dict]:
    quotas: dict[str, dict] = {}
    for entry in allocation.get("quotas") or []:
        resource = entry.get("resource")
        if not resource:
            continue
        quotas.setdefault(
            resource, {"quota": entry.get("quota"), "zone": entry.get("zone")}
        )
    return quotas


def quota(allocation: dict, resource_code: str):
    entry = quotas_by_resource(allocation).get(resource_code)
    return None if entry is None else entry.get("quota")


def su_budget(allocation: dict) -> int | None:
    """The SU budget, or None when the allocation has no budget quota."""
    value = quota(allocation, BUDGET_RESOURCE)
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def summary_fields(allocation: dict) -> dict:
    return {field: allocation.get(field) for field in SUMMARY_FIELDS}


def is_trial(project_name: str, prefix: str) -> bool:
    return bool(prefix) and project_name.startswith(prefix)
