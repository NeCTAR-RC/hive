"""Replies of the DNS (Designate) panels: zones and record sets."""

from hive.schemas.responses import Items, ResponseModel


class Zone(ResponseModel):
    """A zone row; ``is_transitional`` marks a PENDING zone."""

    id: str
    name: str
    type: str | None
    email: str | None
    ttl: int | None
    serial: int | None
    description: str | None
    status: str | None
    action: str | None
    masters: list[str]
    shared: bool
    created_at: str | None
    updated_at: str | None
    is_transitional: bool


class ZonesResponse(Items[Zone]):
    """The zones page. ``quota`` is Designate's quota map (empty when it
    could not be read); ``record_types`` feed the record set form."""

    quota: dict[str, int]
    record_types: list[str]


class RecordSet(ResponseModel):
    """A record set row; ``can_edit`` is false for the records Designate
    manages (SOA and the apex NS)."""

    id: str
    zone_id: str | None
    name: str | None
    type: str | None
    ttl: int | None
    description: str | None
    records: list[str]
    status: str | None
    action: str | None
    created_at: str | None
    updated_at: str | None
    is_transitional: bool
    can_edit: bool


class RecordSetsResponse(Items[RecordSet]):
    """The record sets of one zone, with the zone itself."""

    zone: Zone
