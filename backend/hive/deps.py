"""FastAPI dependencies: settings, shared clients and the session."""

import asyncio
from dataclasses import dataclass, field
import time

from fastapi import Depends, Request
import httpx

from hive.auth import csrf
from hive.auth.login import AuthService
from hive.cache.redis import Cache
from hive.clients.base import bind_refresh
from hive.config import Settings
from hive.errors import NotAuthenticated, SessionExpired
from hive.services.context import Context
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
    _rescoped: asyncio.Task | None = field(default=None, repr=False)

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

    async def rescope(self) -> ScopedToken:
        """Force a fresh scoped token for the current project.

        The ``refresh`` callback for upstream clients: an upstream 401
        rescopes from the unscoped token once per request (concurrent
        callers share the one rescope) before the session is declared
        expired.
        """
        if self._rescoped is None:
            self._rescoped = asyncio.ensure_future(
                self.auth.ensure_scoped(
                    self.sid, self.data, self.project_id, force=True
                )
            )
        return await asyncio.shield(self._rescoped)


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
    session = SessionContext(
        sid=sid, data=data, store=store, auth=auth, settings=settings
    )
    # Every upstream client built during this request rescopes through it.
    bind_refresh(session.rescope)
    return session


async def get_session(
    ctx: SessionContext | None = Depends(get_optional_session),
    settings: Settings = Depends(get_settings),
) -> SessionContext:
    if ctx is None:
        raise NotAuthenticated("login required", extra=login_extra(settings))
    return ctx


async def get_context(
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
    http: httpx.AsyncClient = Depends(get_http),
    cache: Cache = Depends(get_cache),
) -> Context:
    """The service ``Context`` for the current project: shared HTTP client,
    settings, cache and the scoped token, rescoping once on an upstream
    401 through ``SessionContext.rescope``."""
    return Context(
        http, settings, cache, await ctx.scoped(), refresh=ctx.rescope
    )
