"""Liveness, readiness and metrics endpoints (no session, no prefix)."""

import asyncio
import ipaddress

from fastapi import APIRouter, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from redis.exceptions import RedisError

from hive import __version__
from hive.config import Settings
from hive.errors import NotFound

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
    except (RedisError, OSError, TimeoutError):
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


def metrics_allowed(client_host: str | None, settings: Settings) -> bool:
    """Whether ``client_host`` lies in ``HIVE_METRICS_ALLOWED_NETWORKS``.

    /metrics shares the app's port, so route names, request rates and
    upstream latencies would otherwise be readable through the ingress.
    """
    try:
        address = ipaddress.ip_address(client_host or "")
    except ValueError:
        return False
    return any(
        address in ipaddress.ip_network(network, strict=False)
        for network in settings.metrics_allowed_networks
    )


@router.get("/metrics")
async def metrics_endpoint(request: Request):
    client = request.client.host if request.client else None
    if not metrics_allowed(client, request.app.state.settings):
        raise NotFound("not found")
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
