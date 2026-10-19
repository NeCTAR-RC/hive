"""Reservations (warre)."""

from datetime import date
import re

from fastapi import APIRouter, Depends, Request, Response

from hive.deps import get_context
from hive.schemas.reservations import ReservationCreate, ReservationExtend
from hive.services.context import Context
from hive.services import reservations

router = APIRouter(prefix="/reservations", tags=["reservations"])
UNSAFE_FILENAME = re.compile(r"[^A-Za-z0-9_.-]")


@router.get("")
async def list_reservations(ctx: Context = Depends(get_context)):
    return await reservations.list_reservations(ctx)


@router.post("", status_code=201)
async def create_reservation(
    body: ReservationCreate, ctx: Context = Depends(get_context)
):
    return await reservations.create_reservation(
        ctx, body.flavor_id, body.start, body.end
    )


@router.get("/options")
async def options(ctx: Context = Depends(get_context)):
    return await reservations.options(ctx)


@router.get("/slots")
async def slots(
    category: str | None = None,
    availability_zone: str | None = None,
    start: date | None = None,
    end: date | None = None,
    ctx: Context = Depends(get_context),
):
    return await reservations.slots(
        ctx, category, availability_zone, start, end
    )


@router.get("/{reservation_id}")
async def get_reservation(
    reservation_id: str, ctx: Context = Depends(get_context)
):
    return await reservations.get_reservation(ctx, reservation_id)


@router.get("/{reservation_id}/extend-options")
async def extend_options(
    reservation_id: str, ctx: Context = Depends(get_context)
):
    return await reservations.extend_options(ctx, reservation_id)


@router.post("/{reservation_id}/extend")
async def extend_reservation(
    reservation_id: str,
    body: ReservationExtend,
    ctx: Context = Depends(get_context),
):
    return await reservations.extend_reservation(ctx, reservation_id, body.end)


@router.delete("/{reservation_id}", status_code=204)
async def delete_reservation(
    reservation_id: str, ctx: Context = Depends(get_context)
):
    await reservations.delete_reservation(ctx, reservation_id)
    return Response(status_code=204)


@router.get("/{reservation_id}/calendar.ics")
async def calendar(
    reservation_id: str,
    request: Request,
    ctx: Context = Depends(get_context),
):
    host = request.headers.get("host") or "nectar"
    text = await reservations.calendar(ctx, reservation_id, host)
    filename = UNSAFE_FILENAME.sub(
        "_", f"nectar-reservation-{reservation_id}.ics"
    )
    return Response(
        text,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
