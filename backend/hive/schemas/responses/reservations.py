"""Replies of the Reservations panel (warre): reservable flavours, limits,
free slots and the reservations themselves."""

from typing import Literal

from hive.schemas.responses import Items, ResponseModel

type ReservationAction = Literal["launch", "extend", "calendar", "delete"]


class ReservationFlavor(ResponseModel):
    """A reservable flavour. ``max_days`` is the longest booking in whole
    days and ``rate`` its SU per hour (``nectar:rate``), ``None`` when
    unset."""

    id: str | None
    name: str | None
    description: str | None
    category: str | None
    availability_zone: str | None
    vcpu: int | None
    memory_mb: int | None
    disk_gb: int | None
    ephemeral_gb: int | None
    max_length_hours: int | None
    max_days: int
    rate: float | None
    is_public: bool | None
    active: bool | None
    slots: int | None
    start: str | None
    end: str | None


class ReservationLimits(ResponseModel):
    """The project's reservation limits. Warre counts hours; the panel
    shows days. ``None`` is unlimited."""

    max_hours: int | None
    hours_used: int
    hours_left: int | None
    max_days: int | None
    days_used: int
    days_left: int | None
    max_reservations: int | None
    reservations_used: int
    reservations_left: int | None
    can_create: bool


class Reservation(ResponseModel):
    """A reservation row. ``status`` is Blazar's lease status, kept open
    for statuses a newer Blazar adds; ``status_help`` explains it."""

    id: str
    status: str
    status_help: str
    status_reason: str | None
    start: str | None
    end: str | None
    created_at: str | None
    instance_count: int | None
    compute_flavor: str | None
    flavor: ReservationFlavor
    actions: list[ReservationAction]


class ReservationCalendarLinks(ResponseModel):
    """Links that add the reservation to an online calendar."""

    google: str
    outlook: str
    outlook_personal: str


class ReservationDetail(Reservation):
    """The reservation page, with calendar links and its own address."""

    calendar: ReservationCalendarLinks
    detail_url: str


class ReservationsResponse(Items[Reservation]):
    """The reservations list with the limits behind the create button."""

    limits: ReservationLimits


class MaintenanceWindowFlavor(ResponseModel):
    id: str | None
    name: str | None


class MaintenanceWindow(ResponseModel):
    """A planned outage of the flavours it lists."""

    id: str | None
    start: str | None
    end: str | None
    note: str | None
    flavors: list[MaintenanceWindowFlavor]


class ReservationOptions(ResponseModel):
    """What the create form needs. ``su_used`` and ``su_budget`` are
    ``None`` when the allocation is unknown, and the SU check is then
    skipped; ``today`` is the UTC date."""

    limits: ReservationLimits
    flavors: list[ReservationFlavor]
    categories: list[str]
    availability_zones: list[str]
    maintenance_windows: list[MaintenanceWindow]
    su_used: float | None
    su_budget: float | None
    today: str


class FreeSlot(ResponseModel):
    """A free slot of a flavour, with the whole UTC days it can be
    reserved for, inclusive."""

    flavor_id: str
    start: str | None
    end: str | None
    first_day: str
    last_day: str


class SlotsResponse(ResponseModel):
    """Free slots per flavour over the days ``start`` to ``end``."""

    start: str
    end: str
    flavors: list[ReservationFlavor]
    slots: list[FreeSlot]


class ExtendWindow(ResponseModel):
    """How far an active reservation can be extended. ``min_end`` is the
    day after the current end; it is ``None`` when the reservation cannot
    be extended at all."""

    available: bool
    eligible_days: int
    min_end: str | None = None
    max_end: str | None
