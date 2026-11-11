"""Session introspection, project switching and logout."""

import time

from fastapi import APIRouter, BackgroundTasks, Response

from hive.auth.router import clear_session_cookies, set_session_cookies
from hive.deps import (
    OptionalSessionDep,
    SessionContext,
    SessionDep,
    SettingsDep,
)
from hive.schemas import StrictModel
from hive.schemas.responses.session import (
    Me,
    ProjectList,
    SignedIn,
    SignedOut,
)
from hive.services.me import build_me

router = APIRouter(tags=["session"])


class ProjectSwitch(StrictModel):
    project_id: str


def _signed_in(ctx: SessionContext, store_ttl: int | None) -> SignedIn:
    data = ctx.data
    token_expiry = data.unscoped.expires_at.timestamp()
    expires_at = token_expiry
    if store_ttl is not None:
        expires_at = min(token_expiry, time.time() + store_ttl)
    return SignedIn(
        authenticated=True,
        user_id=data.user.id,
        project_id=data.current_project_id,
        expires_at=expires_at,
        server_time=time.time(),
        csrf_token=data.csrf,
    )


@router.get("/session")
async def session(
    ctx: OptionalSessionDep, settings: SettingsDep
) -> SignedIn | SignedOut:
    """Probe the session without triggering a 401 (the SPA's first call)."""
    if ctx is None:
        return SignedOut(
            authenticated=False,
            login_url=settings.login_start_url("/"),
            server_time=time.time(),
        )
    ttl = ctx.store.ttl_for(ctx.data)
    return _signed_in(ctx, ttl)


@router.get("/me")
async def me(ctx: SessionDep, settings: SettingsDep) -> Me:
    scoped = await ctx.scoped()
    return build_me(settings, ctx.data, scoped)


@router.get("/projects")
async def projects(ctx: SessionDep, refresh: bool = False) -> ProjectList:
    data = ctx.data
    if refresh:
        data = await ctx.auth.refresh_projects(ctx.sid, data)
    return ProjectList.model_validate(
        {
            "items": [p.model_dump() for p in data.projects],
            "current_project_id": data.current_project_id,
        }
    )


@router.post("/session/project")
async def switch_project(
    body: ProjectSwitch,
    response: Response,
    ctx: SessionDep,
    settings: SettingsDep,
) -> Me:
    scoped = await ctx.auth.switch_project(ctx.sid, ctx.data, body.project_id)
    set_session_cookies(
        response,
        settings,
        ctx.store.sign(ctx.sid),
        ctx.data.csrf,
        body.project_id,
    )
    return build_me(settings, ctx.data, scoped)


@router.post("/auth/logout", status_code=204)
async def logout(
    response: Response,
    background: BackgroundTasks,
    ctx: SessionDep,
    settings: SettingsDep,
) -> Response:
    """End the session now; revoke its tokens after the response, when
    configured, so a slow Keystone never delays the logout."""
    revoke = settings.logout_revokes_tokens
    tokens = await ctx.auth.logout(ctx.sid, ctx.data, revoke=revoke)
    if tokens:
        background.add_task(ctx.auth.revoke_tokens, tokens)
    clear_session_cookies(response, settings)
    response.status_code = 204
    return response
