"""Cinder volume types as the SPA offers them, shared by the volume forms
and the launch wizard's new-volume picker (its own module so the compute
and volume services can both use it without importing each other)."""

from hive.cache import policy
from hive.schemas.responses.volumes import VolumeType
from hive.services.context import Context


async def volume_types(ctx: Context) -> list[VolumeType]:
    """The project's volume types by name, each with the zones it is
    limited to (``hive.nectar.volumes``)."""
    result = await ctx.cached(policy.VOLUME_TYPES, ctx.cinder.volume_types)
    rules = ctx.volume_rules
    types = [rules.type_summary(t) for t in result.value]
    types.sort(key=lambda t: (t["name"] or "").lower())
    return [VolumeType.model_validate(t) for t in types]


def has_zoned_types(types: list[VolumeType] | None) -> bool:
    """Whether any type is limited to zones, so a type picker filters by
    the chosen zone."""
    return any(t.zones for t in types or [])
