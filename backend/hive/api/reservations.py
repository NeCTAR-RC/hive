"""Reservations (warre)."""

from datetime import date

from fastapi import APIRouter, Request, Response

from hive.api.replies import attachment
from hive.deps import ContextDep
from hive.schemas.reservations import ReservationCreate, ReservationExtend
from hive.schemas.responses.reservations import (
    ExtendWindow,
    Reservation,
    ReservationDetail,
    ReservationOptions,
    ReservationsResponse,
    SlotsResponse,
)
from hive.services import reservations

router = APIRouter(prefix="/reservations", tags=["reservations"])


@router.get("")
async def list_reservations(ctx: ContextDep) -> ReservationsResponse:
    return await reservations.list_reservations(ctx)


@router.post("", status_code=201)
async def create_reservation(
    body: ReservationCreate, ctx: ContextDep
) -> Reservation:
    return await reservations.create_reservation(
        ctx, body.flavor_id, body.start, body.end
    )


@router.get("/options")
async def options(ctx: ContextDep) -> ReservationOptions:
    return await reservations.options(ctx)


@router.get("/slots")
async def slots(
    ctx: ContextDep,
    category: str | None = None,
    availability_zone: str | None = None,
    start: date | None = None,
    end: date | None = None,
) -> SlotsResponse:
    return await reservations.slots(
        ctx, category, availability_zone, start, end
    )


@router.get("/{reservation_id}")
async def get_reservation(
    reservation_id: str, ctx: ContextDep
) -> ReservationDetail:
    return await reservations.get_reservation(ctx, reservation_id)


@router.get("/{reservation_id}/extend-options")
async def extend_options(reservation_id: str, ctx: ContextDep) -> ExtendWindow:
    return await reservations.extend_options(ctx, reservation_id)


@router.post("/{reservation_id}/extend")
async def extend_reservation(
    reservation_id: str, body: ReservationExtend, ctx: ContextDep
) -> Reservation:
    return await reservations.extend_reservation(ctx, reservation_id, body.end)


@router.delete("/{reservation_id}", status_code=204)
async def delete_reservation(reservation_id: str, ctx: ContextDep) -> Response:
    await reservations.delete_reservation(ctx, reservation_id)
    return Response(status_code=204)


@router.get("/{reservation_id}/calendar.ics")
async def calendar(
    reservation_id: str, request: Request, ctx: ContextDep
) -> Response:
    host = request.headers.get("host") or "nectar"
    found = await reservations.calendar(ctx, reservation_id, host)
    return attachment(found)
