"""Session introspection, project switching and logout."""

import time

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel

from hive.auth.router import clear_session_cookies, set_session_cookies
from hive.config import Settings
from hive.deps import (
    get_optional_session,
    get_session,
    get_settings,
    SessionContext,
)
from hive.services.me import build_me

router = APIRouter(tags=["session"])


class ProjectSwitch(BaseModel):
    project_id: str


def _session_payload(ctx: SessionContext, store_ttl: int | None) -> dict:
    data = ctx.data
    token_expiry = data.unscoped.expires_at.timestamp()
    expires_at = token_expiry
    if store_ttl is not None:
        expires_at = min(token_expiry, time.time() + store_ttl)
    return {
        "authenticated": True,
        "user_id": data.user.id,
        "project_id": data.current_project_id,
        "expires_at": expires_at,
        "server_time": time.time(),
        "csrf_token": data.csrf,
    }


@router.get("/session")
async def session(
    ctx: SessionContext | None = Depends(get_optional_session),
    settings: Settings = Depends(get_settings),
):
    """Probe the session without triggering a 401 (the SPA's first call)."""
    if ctx is None:
        return {
            "authenticated": False,
            "login_url": settings.login_start_url("/"),
            "server_time": time.time(),
        }
    ttl = ctx.store.ttl_for(ctx.data)
    return _session_payload(ctx, ttl)


@router.get("/me")
async def me(
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    scoped = await ctx.scoped()
    return build_me(settings, ctx.data, scoped)


@router.get("/projects")
async def projects(
    refresh: bool = False,
    ctx: SessionContext = Depends(get_session),
):
    data = ctx.data
    if refresh:
        data = await ctx.auth.refresh_projects(ctx.sid, data)
    return {
        "items": [p.model_dump() for p in data.projects],
        "current_project_id": data.current_project_id,
    }


@router.post("/session/project")
async def switch_project(
    body: ProjectSwitch,
    response: Response,
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    data = await ctx.auth.switch_project(ctx.sid, ctx.data, body.project_id)
    scoped = await ctx.auth.ensure_scoped(ctx.sid, data, body.project_id)
    set_session_cookies(
        response,
        settings,
        ctx.store.sign(ctx.sid),
        data.csrf,
        body.project_id,
    )
    return build_me(settings, data, scoped)


@router.post("/auth/logout", status_code=204)
async def logout(
    response: Response,
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    await ctx.auth.logout(
        ctx.sid, ctx.data, revoke=settings.logout_revokes_tokens
    )
    clear_session_cookies(response, settings)
    response.status_code = 204
    return response
