"""The manuka token receiver and the login initiator.

``POST /auth/websso/`` is the only CSRF-exempt route: manuka delivers the
login as a cross-site, form-encoded, auto-submitted POST with ``token`` and
``tenant_id`` and nothing else (no state, no nonce), exactly as it does to
Horizon's ``/auth/websso/``. The ``Origin`` header is the one extra check
Hive adds.
"""

from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
import structlog

from hive.auth.login import AuthService, NoProjects
from hive.config import Settings
from hive.deps import get_auth, get_settings
from hive.errors import BadRequest, NotAuthenticated, UpstreamError
from hive.observability import metrics

log = structlog.get_logger("hive.auth")

router = APIRouter(tags=["auth"])

MAX_FORM_BYTES = 8192
FORM_CONTENT_TYPE = "application/x-www-form-urlencoded"
RECENT_PROJECT_COOKIE = "recent_project"
RECENT_PROJECT_MAX_AGE = 365 * 86400


def safe_next(value: str | None, default: str = "/") -> str:
    """Only relative, single-slash paths are honoured (as Horizon does)."""
    if not value:
        return default
    if not value.startswith("/") or value.startswith("//"):
        return default
    if "\\" in value or "\n" in value or "\r" in value:
        return default
    if value.startswith("/auth/websso"):
        return default
    return value


def _origin_allowed(request: Request, settings: Settings) -> bool:
    if not settings.websso_allowed_origins:
        return True
    origin = request.headers.get("origin")
    if not origin:
        # Older browsers omit Origin on form posts; fall back to Referer.
        referer = request.headers.get("referer", "")
        origin = "/".join(referer.split("/")[:3]) if referer else ""
    return origin.rstrip("/") in {
        o.rstrip("/") for o in settings.websso_allowed_origins
    }


def set_session_cookies(
    response, settings: Settings, cookie_value: str, csrf: str, project_id
) -> None:
    secure = settings.cookie_secure
    response.set_cookie(
        settings.session_cookie_name,
        cookie_value,
        max_age=settings.session_timeout,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        settings.csrf_cookie_name,
        csrf,
        max_age=settings.session_timeout,
        httponly=False,
        secure=secure,
        samesite="lax",
        path="/",
    )
    if project_id:
        response.set_cookie(
            RECENT_PROJECT_COOKIE,
            project_id,
            max_age=RECENT_PROJECT_MAX_AGE,
            httponly=False,
            secure=secure,
            samesite="lax",
            path="/",
        )


def clear_session_cookies(response, settings: Settings) -> None:
    response.delete_cookie(settings.session_cookie_name, path="/")
    response.delete_cookie(settings.csrf_cookie_name, path="/")


@router.get("/auth/start", include_in_schema=False)
async def start(
    next: str = "",
    settings: Settings = Depends(get_settings),
):
    """Send the browser to manuka, coming back to ``next``."""
    url = settings.login_start_url(safe_next(next, default=""))
    return RedirectResponse(url, status_code=302)


async def _read_form(request: Request) -> tuple[str, str]:
    """Parse manuka's form by hand so the checks run before parsing."""
    content_type = request.headers.get("content-type", "")
    if not content_type.startswith(FORM_CONTENT_TYPE):
        raise BadRequest("form-encoded body required")
    length = request.headers.get("content-length")
    if length and int(length) > MAX_FORM_BYTES:
        raise BadRequest("form body too large")
    body = await request.body()
    if len(body) > MAX_FORM_BYTES:
        raise BadRequest("form body too large")
    fields = parse_qs(body.decode("utf-8", errors="replace"))
    token = (fields.get("token") or [""])[0]
    tenant_id = (fields.get("tenant_id") or [""])[0]
    if not token:
        raise BadRequest("token is required")
    return token, tenant_id


@router.post("/auth/websso/", include_in_schema=False)
async def websso(
    request: Request,
    next: str = "",
    settings: Settings = Depends(get_settings),
    auth: AuthService = Depends(get_auth),
):
    token, tenant_id = await _read_form(request)
    if not _origin_allowed(request, settings):
        metrics.logins.labels("bad_origin").inc()
        log.warning(
            "websso post from unexpected origin",
            origin=request.headers.get("origin"),
        )
        raise BadRequest("unexpected origin")

    recent = request.cookies.get(RECENT_PROJECT_COOKIE)
    try:
        sid, cookie_value, data = await auth.login_with_unscoped_token(
            token, recent_project=recent
        )
    except NotAuthenticated:
        metrics.logins.labels("invalid_token").inc()
        return RedirectResponse(
            "/auth/login?reason=invalid_token", status_code=303
        )
    except NoProjects:
        metrics.logins.labels("no_projects").inc()
        return RedirectResponse(
            "/auth/login?reason=no_projects", status_code=303
        )
    except UpstreamError:
        metrics.logins.labels("keystone_error").inc()
        raise

    if tenant_id and tenant_id != data.current_project_id:
        log.info(
            "manuka tenant_id hint differs from chosen project",
            hint=tenant_id,
            chosen=data.current_project_id,
        )
    metrics.logins.labels("ok").inc()
    metrics.sessions_created.inc()
    log.info(
        "login",
        user_id=data.user.id,
        project_id=data.current_project_id,
        projects=len(data.projects),
    )
    response = RedirectResponse(safe_next(next), status_code=303)
    set_session_cookies(
        response, settings, cookie_value, data.csrf, data.current_project_id
    )
    return response
