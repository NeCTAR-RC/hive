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

from collections.abc import Sequence
from typing import Any

from fastapi.exceptions import RequestValidationError
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
import structlog

from hive.nectar.violation import RuleViolation

log = structlog.get_logger("hive.errors")

# Pydantic's prefix on the message of a ValueError raised in a validator.
VALUE_ERROR_PREFIX = "Value error, "

HTTP_ERROR_CODES = {
    404: "not_found",
    405: "method_not_allowed",
}


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
    """The service is not in this cloud's catalog: a property of the
    deployment, so not a 404 (the SPA would say the resource is gone)."""

    status = 501
    code = "service_not_enabled"


class Gone(HiveError):
    status = 410
    code = "gone"


class BadRequest(HiveError):
    status = 400
    code = "bad_request"


class QuotaExceeded(HiveError):
    status = 409
    code = "quota_exceeded"


class Conflict(HiveError):
    status = 409
    code = "conflict"


class LoadBalancerBusy(Conflict):
    """A child resource change while the load balancer is not ACTIVE;
    Octavia would refuse it, so the SPA asks the user to try again."""

    code = "load_balancer_busy"


class ListingTruncated(Conflict):
    """A listing stopped at the page cap before its end, so acting on it
    (a recursive delete) would act on part of it only."""

    code = "listing_truncated"


class LengthRequired(HiveError):
    """A streamed upload without a numeric Content-Length: the relay cap
    cannot be checked up front."""

    status = 411
    code = "length_required"


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


def envelope(
    code: str,
    message: str,
    request_id: str | None,
    *,
    service: str | None = None,
    upstream_request_id: str | None = None,
    **extra: Any,
) -> dict:
    """The one error body every failure leaves the API with."""
    return {
        "error": code,
        "message": message,
        "service": service,
        "request_id": request_id,
        "upstream_request_id": upstream_request_id,
        **extra,
    }


def error_payload(exc: HiveError, request: Request) -> dict:
    return envelope(
        exc.code,
        exc.message,
        request_id_of(request),
        service=exc.service,
        upstream_request_id=exc.upstream_request_id,
        **exc.extra,
    )


def validation_detail(errors: Sequence[Any]) -> list[dict]:
    """Where and why each field failed, never what was sent.

    Pydantic's ``input`` would echo the submitted value (a password, for
    one) and ``ctx`` can hold an exception object that does not serialise.
    """
    return [
        {
            "loc": list(error.get("loc", ())),
            "msg": str(error.get("msg", "")),
            "type": str(error.get("type", "")),
        }
        for error in errors
    ]


async def end_session(request: Request, response: JSONResponse) -> None:
    """A 401 means the browser's session is over: its Redis entry goes,
    its cookies are cleared, and the answer is never cached."""
    state = request.app.state
    settings = state.settings
    sid = state.session_store.unsign(
        request.cookies.get(settings.session_cookie_name)
    )
    if sid:
        await state.session_store.destroy(sid)
    response.headers["Cache-Control"] = "no-store"
    for name in (settings.session_cookie_name, settings.csrf_cookie_name):
        response.delete_cookie(name, path="/")


def validation_message(detail: list[dict]) -> str:
    """What the SPA shows for a 422: the first rule's own words (a request
    model validator calling a Nectar rule) when there is one, since that
    tells the user what to fix; otherwise a generic line."""
    for error in detail:
        if error["type"] == "value_error":
            return error["msg"].removeprefix(VALUE_ERROR_PREFIX)
    return "request validation failed"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(HiveError)
    async def _hive_error(request: Request, exc: HiveError):
        response = JSONResponse(
            error_payload(exc, request),
            status_code=exc.status,
            headers=exc.headers,
        )
        if exc.status == 401:
            await end_session(request, response)
        if exc.status >= 500:
            log.warning(
                "upstream failure",
                code=exc.code,
                service=exc.service,
                upstream_status=exc.upstream_status,
                message=exc.message,
            )
        return response

    @app.exception_handler(RuleViolation)
    async def _rule_violation(request: Request, exc: RuleViolation):
        """A Nectar rule refused the request: a 400 like ``BadRequest``."""
        return JSONResponse(
            envelope("bad_request", str(exc), request_id_of(request)),
            status_code=400,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException):
        """Routing errors (unknown path, wrong method) in the envelope."""
        return JSONResponse(
            envelope(
                HTTP_ERROR_CODES.get(exc.status_code, "http_error"),
                str(exc.detail),
                request_id_of(request),
            ),
            status_code=exc.status_code,
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        detail = validation_detail(exc.errors())
        return JSONResponse(
            envelope(
                "validation",
                validation_message(detail),
                request_id_of(request),
                detail=detail,
            ),
            status_code=422,
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, _exc: Exception):
        log.exception("unhandled error")
        return JSONResponse(
            envelope(
                "internal_error", "internal error", request_id_of(request)
            ),
            status_code=500,
        )
