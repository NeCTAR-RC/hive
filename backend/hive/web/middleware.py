"""Request context: request id, timing, metrics, log line, security headers.

Pure ASGI (not ``BaseHTTPMiddleware``) so contextvars bound here are
visible to the route handlers and nothing buffers the response.
"""

import re
import time
import uuid

from starlette.datastructures import Headers, MutableHeaders
import structlog

from hive.config import Settings
from hive.observability import metrics

log = structlog.get_logger("hive.http")

# An incoming X-Request-ID is reused only when it looks like an id; it is
# echoed in logs, the response header and error envelopes.
REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{1,128}")
# Metric label for requests no route matched, so clients cannot mint labels.
UNMATCHED = "/unmatched"


def security_headers(settings: Settings) -> dict[str, str]:
    headers = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    }
    if settings.csp:
        name = (
            "Content-Security-Policy"
            if settings.csp_enforce
            else "Content-Security-Policy-Report-Only"
        )
        headers[name] = settings.csp
    return headers


def _request_id(incoming: str | None) -> str:
    if incoming and REQUEST_ID.fullmatch(incoming):
        return incoming
    return f"req-{uuid.uuid4()}"


class RequestContextMiddleware:
    def __init__(self, app, settings: Settings):
        self.app = app
        self.settings = settings
        self._security = security_headers(settings)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = Headers(scope=scope)
        request_id = _request_id(incoming.get("x-request-id"))
        scope.setdefault("state", {})["request_id"] = request_id
        structlog.contextvars.bind_contextvars(request_id=request_id)
        started = time.perf_counter()
        status_holder = {"status": 500}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = request_id
                for name, value in self._security.items():
                    if name not in headers:
                        headers.append(name, value)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration = time.perf_counter() - started
            route = scope.get("route")
            label = getattr(route, "path", None) or UNMATCHED
            method = scope.get("method", "GET")
            status = status_holder["status"]
            metrics.http_requests.labels(label, method, str(status)).inc()
            metrics.http_request_seconds.labels(label, method).observe(
                duration
            )
            if not scope.get("path", "").startswith(
                ("/healthz", "/readyz", "/metrics")
            ):
                log.info(
                    "request",
                    method=method,
                    path=scope.get("path"),
                    route=label,
                    status=status,
                    duration_ms=round(duration * 1000, 1),
                )
            structlog.contextvars.unbind_contextvars("request_id")
