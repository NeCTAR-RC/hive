"""Request bodies for the DNS (Designate) panels."""

from typing import Literal

from pydantic import BaseModel, Field


class ZoneCreate(BaseModel):
    name: str = Field(min_length=3, max_length=255)
    email: str = Field(min_length=3, max_length=255)
    ttl: int | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=160)
    type: Literal["PRIMARY", "SECONDARY"] = "PRIMARY"
    masters: list[str] | None = None


class ZoneUpdate(BaseModel):
    email: str | None = Field(default=None, min_length=3, max_length=255)
    ttl: int | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=160)
    masters: list[str] | None = None


class RecordSetCreate(BaseModel):
    """``name`` may be relative (``www``) or absolute; empty means the
    zone apex."""

    name: str = Field(default="", max_length=255)
    type: str = Field(min_length=1, max_length=10)
    records: list[str] = Field(min_length=1, max_length=100)
    ttl: int | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=160)


class RecordSetUpdate(BaseModel):
    """``ttl`` omitted keeps the current TTL; ``null`` restores the zone
    default."""

    records: list[str] = Field(min_length=1, max_length=100)
    ttl: int | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=160)
