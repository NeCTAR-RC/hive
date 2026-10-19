"""Error types and the JSON error envelope the SPA relies on.

Every error leaves the API as::

    {
        "error": "<code>",
        "message": "...",
        "service": "nova" | null,
        "request_id": "req-...",
        "upstream_request_id": "..." | null,
    }

401 responses additionally carry ``login_url`` so the SPA can send the user
back through manuka without knowing how the login URL is built.
"""

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import structlog

log = structlog.get_logger("hive.errors")


class HiveError(Exception):
    status: int = 500
    code: str = "internal_error"

    def __init__(
        self,
        message: str = "",
        *,
        status: int | None = None,
        code: str | None = None,
        service: str | None = None,
        upstream_status: int | None = None,
        upstream_request_id: str | None = None,
        extra: dict | None = None,
        headers: dict | None = None,
    ):
        super().__init__(message)
        if status is not None:
            self.status = status
        if code is not None:
            self.code = code
        self.message = message or self.code.replace("_", " ")
        self.service = service
        self.upstream_status = upstream_status
        self.upstream_request_id = upstream_request_id
        self.extra = extra or {}
        self.headers = headers or {}


class NotAuthenticated(HiveError):
    status = 401
    code = "not_authenticated"


class SessionExpired(HiveError):
    status = 401
    code = "session_expired"


class CSRFError(HiveError):
    status = 403
    code = "csrf"


class Forbidden(HiveError):
    status = 403
    code = "forbidden"


class NotFound(HiveError):
    status = 404
    code = "not_found"


class ServiceNotEnabled(HiveError):
    status = 404
    code = "service_not_enabled"


class BadRequest(HiveError):
    status = 400
    code = "bad_request"


class QuotaExceeded(HiveError):
    status = 409
    code = "quota_exceeded"


class Conflict(HiveError):
    status = 409
    code = "conflict"


class PayloadTooLarge(HiveError):
    status = 413
    code = "payload_too_large"


class RateLimited(HiveError):
    status = 429
    code = "rate_limited"


class UpstreamError(HiveError):
    status = 502
    code = "upstream_error"


class UpstreamUnreachable(HiveError):
    status = 502
    code = "upstream_unreachable"


class UpstreamTimeout(HiveError):
    status = 504
    code = "upstream_timeout"


def request_id_of(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def error_payload(exc: HiveError, request: Request) -> dict:
    payload = {
        "error": exc.code,
        "message": exc.message,
        "service": exc.service,
        "request_id": request_id_of(request),
        "upstream_request_id": exc.upstream_request_id,
    }
    payload.update(exc.extra)
    return payload


# Validation error keys safe to return: ``input`` reflects the request body
# (passwords included), ``ctx`` can hold an exception object and ``url``
# is noise.
VALIDATION_KEYS = ("type", "loc", "msg")


def validation_detail(errors) -> list[dict]:
    return jsonable_encoder(
        [{k: err[k] for k in VALIDATION_KEYS if k in err} for err in errors]
    )


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(HiveError)
    async def _hive_error(request: Request, exc: HiveError):
        response = JSONResponse(
            error_payload(exc, request),
            status_code=exc.status,
            headers=exc.headers,
        )
        if exc.status == 401:
            # A dead session must not be cached and its cookies are useless.
            response.headers["Cache-Control"] = "no-store"
            settings = request.app.state.settings
            for name in (
                settings.session_cookie_name,
                settings.csrf_cookie_name,
            ):
                response.delete_cookie(name, path="/")
        if exc.status >= 500:
            log.warning(
                "upstream failure",
                code=exc.code,
                service=exc.service,
                upstream_status=exc.upstream_status,
                message=exc.message,
            )
        return response

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        return JSONResponse(
            {
                "error": "validation",
                "message": "request validation failed",
                "service": None,
                "request_id": request_id_of(request),
                "upstream_request_id": None,
                "detail": validation_detail(exc.errors()),
            },
            status_code=422,
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        log.exception("unhandled error")
        return JSONResponse(
            {
                "error": "internal_error",
                "message": "internal error",
                "service": None,
                "request_id": request_id_of(request),
                "upstream_request_id": None,
            },
            status_code=500,
        )
