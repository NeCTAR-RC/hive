"""Request bodies for the DNS (Designate) panels."""

from typing import Literal, Self

from pydantic import Field, model_validator

from hive.nectar import dns as rules
from hive.schemas import StrictModel


class ZoneCreate(StrictModel):
    name: str = Field(min_length=3, max_length=255)
    email: str = Field(min_length=3, max_length=255)
    ttl: int | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=160)
    type: Literal["PRIMARY", "SECONDARY"] = "PRIMARY"
    masters: list[str] | None = None

    @model_validator(mode="after")
    def _zone(self) -> Self:
        rules.validate_zone(
            self.name, self.email, self.ttl, self.type, self.masters
        )
        return self


class ZoneUpdate(StrictModel):
    email: str | None = Field(default=None, min_length=3, max_length=255)
    ttl: int | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=160)
    masters: list[str] | None = None


class RecordSetCreate(StrictModel):
    """``name`` may be relative (``www``) or absolute; empty means the
    zone apex."""

    name: str = Field(default="", max_length=255)
    type: str = Field(min_length=1, max_length=10)
    records: list[str] = Field(min_length=1, max_length=100)
    ttl: int | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=160)


class RecordSetUpdate(StrictModel):
    """``ttl`` omitted keeps the current TTL; ``null`` restores the zone
    default."""

    records: list[str] = Field(min_length=1, max_length=100)
    ttl: int | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=160)
