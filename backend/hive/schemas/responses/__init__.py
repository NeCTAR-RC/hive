"""Replies the API sends: one model per shape the SPA reads.

A service's shaping function (``server_summary`` and the like) stays the
one place a reply is built; its model only declares and validates the
result. Every reply model derives from ``ResponseModel``, which forbids
undeclared fields, so a field a shaping function adds without declaring
it fails in the tests instead of reaching the SPA undocumented, and a
declared field it stops building fails as missing.

The OpenAPI document names every model by its class name, so class names
are unique across the panels (``VolumeSnapshot``, ``ShareSnapshot``).
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class ResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Items[T](ResponseModel):
    """A complete list. A list page that needs more beside the rows (a
    quota, the parent resource) extends it."""

    items: list[T]


class Paginated[T](Items[T]):
    """One page of a marker-paged list; ``has_more`` says whether a page
    follows ``next_marker``."""

    next_marker: str | None
    has_more: bool


class Cached(ResponseModel):
    """A widget served through the cache. ``fetched_at`` (epoch seconds)
    drives the SPA's "updated n seconds ago"; it is ``None`` when the
    value bypassed the cache."""

    fetched_at: float | None


class Accepted(ResponseModel):
    """A request the upstream accepted and carries out later (a 202)."""

    status: Literal["accepted"]


class AvailabilityZone(ResponseModel):
    """A Nova or Cinder availability zone and whether it is up; shared by
    the compute and volume replies."""

    name: str
    available: bool
