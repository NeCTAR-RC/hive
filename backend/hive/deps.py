"""FastAPI dependencies: settings, shared clients and the session."""

from dataclasses import dataclass
import time

from fastapi import Depends, Request
import httpx

from hive.auth import csrf
from hive.auth.login import AuthService
from hive.cache.redis import Cache
from hive.config import Settings
from hive.errors import NotAuthenticated, SessionExpired
from hive.session.model import ScopedToken, SessionData
from hive.session.store import SessionStore

# Treat a token with less than this left as expired so a request does not
# fail halfway through a fan-out.
EXPIRY_GRACE = 60


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_store(request: Request) -> SessionStore:
    return request.app.state.session_store


def get_auth(request: Request) -> AuthService:
    return request.app.state.auth


def get_http(request: Request) -> httpx.AsyncClient:
    return request.app.state.http


def get_cache(request: Request) -> Cache:
    return request.app.state.cache


def login_extra(settings: Settings) -> dict:
    return {"login_url": settings.login_start_url("/")}


@dataclass
class SessionContext:
    sid: str
    data: SessionData
    store: SessionStore
    auth: AuthService
    settings: Settings

    @property
    def project_id(self) -> str:
        if self.data.current_project_id is None:
            raise SessionExpired(
                "no project in session", extra=login_extra(self.settings)
            )
        return self.data.current_project_id

    async def scoped(self) -> ScopedToken:
        """The current project's scoped token, rescoped if needed."""
        return await self.auth.ensure_scoped(
            self.sid, self.data, self.project_id
        )


async def _load_session(
    request: Request, settings: Settings, store: SessionStore
) -> tuple[str, SessionData, float] | None:
    sid = store.unsign(request.cookies.get(settings.session_cookie_name))
    if sid is None:
        return None
    loaded = await store.load(sid)
    if loaded is None:
        return None
    data, last_seen = loaded
    return sid, data, last_seen


async def get_optional_session(
    request: Request,
    settings: Settings = Depends(get_settings),
    store: SessionStore = Depends(get_store),
    auth: AuthService = Depends(get_auth),
) -> SessionContext | None:
    """The session if the browser has a live one, else ``None``."""
    loaded = await _load_session(request, settings, store)
    if loaded is None:
        return None
    sid, data, last_seen = loaded
    now = time.time()
    if data.unscoped.expires_at.timestamp() - now < EXPIRY_GRACE:
        await store.destroy(sid, data.user.id)
        raise SessionExpired(
            "the login session has expired", extra=login_extra(settings)
        )
    csrf.check_request(request, data.csrf)
    await store.touch(sid, data, last_seen, now)
    return SessionContext(
        sid=sid, data=data, store=store, auth=auth, settings=settings
    )


async def get_session(
    ctx: SessionContext | None = Depends(get_optional_session),
    settings: Settings = Depends(get_settings),
) -> SessionContext:
    if ctx is None:
        raise NotAuthenticated("login required", extra=login_extra(settings))
    return ctx
