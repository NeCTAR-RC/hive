"""Liveness, readiness and metrics endpoints (no session, no prefix)."""

import asyncio

from fastapi import APIRouter, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from hive import __version__

router = APIRouter(include_in_schema=False)


@router.get("/healthz")
async def healthz():
    """Process liveness: no dependency calls."""
    return {"status": "ok", "version": __version__}


@router.get("/readyz")
async def readyz(request: Request, response: Response):
    """Readiness: Redis is required; Keystone is reported, not required,
    unless HIVE_READYZ_FAIL_ON_KEYSTONE is set."""
    settings = request.app.state.settings
    checks = {"redis": "ok", "keystone": "ok"}
    try:
        await asyncio.wait_for(request.app.state.redis.ping(), timeout=1.0)
    except Exception:
        checks["redis"] = "failed"
    if not await request.app.state.keystone.ping():
        checks["keystone"] = "degraded"
    ready = checks["redis"] == "ok" and (
        checks["keystone"] == "ok" or not settings.readyz_fail_on_keystone
    )
    response.status_code = 200 if ready else 503
    return {
        "status": "ready" if ready else "not ready",
        "checks": checks,
        "version": __version__,
    }


@router.get("/metrics")
async def metrics_endpoint():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
