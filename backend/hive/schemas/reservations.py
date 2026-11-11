"""Request bodies for the Reservations panel (warre)."""

from datetime import date

from pydantic import Field

from hive.schemas import StrictModel


class ReservationCreate(StrictModel):
    flavor_id: str = Field(min_length=1)
    start: date
    end: date


class ReservationExtend(StrictModel):
    end: date
