"""Request bodies for the Reservations panel (warre)."""

from datetime import date

from pydantic import BaseModel, Field


class ReservationCreate(BaseModel):
    flavor_id: str = Field(min_length=1)
    start: date
    end: date


class ReservationExtend(BaseModel):
    end: date
