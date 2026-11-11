"""Request context: request id, timing, metrics, log line, security headers.

Pure ASGI (not ``BaseHTTPMiddleware``) so contextvars bound here are
visible to the route handlers and nothing buffers the response.
"""

import time

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
import structlog

from hive.config import Settings
from hive.errors import envelope, PayloadTooLarge
from hive.observability import metrics
from hive.observability.request_id import (
    bind_global_request_id,
    request_ids,
    reset_global_request_id,
)

log = structlog.get_logger("hive.http")

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


def is_api_path(path: str) -> bool:
    return path == "/api" or path.startswith("/api/")


class RequestContextMiddleware:
    """Binds the request ids, adds the security headers and marks every
    ``/api`` response ``no-store``: API answers are per user and some carry
    secrets (new passwords, private keys, console URLs), so no browser or
    intermediary may keep them. SPA assets set their own caching."""

    def __init__(self, app, settings: Settings):
        self.app = app
        self.settings = settings
        self._security = security_headers(settings)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = Headers(scope=scope)
        request_id, global_id = request_ids(incoming.get("x-request-id"))
        scope.setdefault("state", {})["request_id"] = request_id
        bound = {"request_id": request_id}
        if global_id != request_id:
            bound["global_request_id"] = global_id
        structlog.contextvars.bind_contextvars(**bound)
        global_token = bind_global_request_id(global_id)
        api = is_api_path(scope.get("path", ""))
        started = time.perf_counter()
        status_holder = {"status": 500}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = request_id
                if api:
                    headers["Cache-Control"] = "no-store"
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
            structlog.contextvars.unbind_contextvars(*bound)
            reset_global_request_id(global_token)


class JsonBodyLimitMiddleware:
    """Refuse JSON request bodies over ``HIVE_API_MAX_JSON_BYTES`` with 413.

    The single worker parses every JSON body in memory, so one huge body
    would stall everyone. Only ``application/json`` under ``/api`` is
    limited: file uploads stream with their own limits. The body is read
    here, up to the limit, and replayed to the app.
    """

    def __init__(self, app, settings: Settings):
        self.app = app
        self.limit = settings.api_max_json_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not self._applies(scope):
            await self.app(scope, receive, send)
            return
        declared = Headers(scope=scope).get("content-length", "")
        if declared.isdigit() and int(declared) > self.limit:
            await self._too_large(scope, receive, send)
            return
        body = bytearray()
        more = True
        while more:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            more = message.get("more_body", False)
            if len(body) > self.limit:
                await self._too_large(scope, receive, send)
                return
        replayed = False

        async def replay():
            nonlocal replayed
            if replayed:
                return await receive()
            replayed = True
            return {"type": "http.request", "body": bytes(body)}

        await self.app(scope, replay, send)

    @staticmethod
    def _applies(scope) -> bool:
        if not is_api_path(scope.get("path", "")):
            return False
        content_type = Headers(scope=scope).get("content-type", "")
        return content_type.split(";")[0].strip().lower() == "application/json"

    async def _too_large(self, scope, receive, send) -> None:
        response = JSONResponse(
            envelope(
                PayloadTooLarge.code,
                f"request bodies are limited to {self.limit} bytes",
                scope.get("state", {}).get("request_id"),
            ),
            status_code=PayloadTooLarge.status,
        )
        await response(scope, receive, send)
