"""Replies of the home page widgets: outages, security risks and the
ARDC news feed (the allocation summary is in ``usage``)."""

from pydantic import ConfigDict

from hive.schemas.responses import Cached, ResponseModel


class Outage(ResponseModel):
    """A Langstroth outage (``nectar/outages.py``); ``url`` is its page on
    the status site."""

    id: int
    title: str
    description: str | None
    severity: int
    scheduled: bool
    scheduled_display: str | None
    status_display: str | None
    start: str
    end: str | None
    planned_end: str | None
    cancelled: bool | None
    url: str


class OutagesResponse(Cached):
    """``available`` is false when the project's catalog has no
    Langstroth; the widget then hides instead of failing the page."""

    items: list[Outage]
    available: bool


class SecurityRiskType(ResponseModel):
    """The kind of a Varroa risk, passed through as Varroa sends it."""

    model_config = ConfigDict(extra="allow")

    id: str | None = None
    name: str | None = None
    display_name: str | None = None
    description: str | None = None
    help_url: str | None = None


class SecurityRisk(ResponseModel):
    """A Varroa security risk on one of the project's resources, passed
    through as Varroa sends it; the fields the SPA reads are declared."""

    model_config = ConfigDict(extra="allow")

    id: int | str
    resource_id: str
    resource_type: str
    status: str | None = None
    ipaddress: str | None = None
    port: int | None = None
    type: SecurityRiskType | None = None
    first_seen: str | None = None
    last_seen: str | None = None


class RisksResponse(Cached):
    items: list[SecurityRisk]
    available: bool


class NewsItem(ResponseModel):
    """One ARDC news post; ``summary`` is plain text, cut to a teaser."""

    title: str
    link: str
    published: str
    summary: str
    image: str | None


class NewsResponse(Cached):
    items: list[NewsItem]
