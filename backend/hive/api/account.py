"""The account panels: My Details, Reset Password and the helpdesk User
Details lookup (``/api/me/...`` and ``/api/identity/users/...``)."""

from fastapi import APIRouter, Depends
import httpx

from hive.config import Settings
from hive.deps import get_http, get_session, get_settings, SessionContext
from hive.errors import Forbidden
from hive.schemas.account import ProfileUpdate
from hive.services import account

router = APIRouter(tags=["account"])


async def require_lookup(
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> SessionContext:
    """``USER_INFO_LOOKUP_ROLES``: the helpdesk roles may look users up."""
    scoped = await ctx.scoped()
    if not set(scoped.roles) & set(settings.user_lookup_roles):
        raise Forbidden("User lookup needs a helpdesk role.")
    return ctx


@router.get("/me/profile")
async def profile(
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
    http: httpx.AsyncClient = Depends(get_http),
):
    scoped = await ctx.scoped()
    return await account.profile(http, settings, scoped, ctx.data.user.id)


@router.patch("/me/profile")
async def update_profile(
    body: ProfileUpdate,
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
    http: httpx.AsyncClient = Depends(get_http),
):
    scoped = await ctx.scoped()
    return await account.update_profile(
        http, settings, scoped, ctx.data.user.id, body
    )


@router.post("/me/reset-password")
async def reset_password(
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
    http: httpx.AsyncClient = Depends(get_http),
):
    return await account.reset_password(http, settings, ctx)


@router.get("/identity/users/search")
async def search_users(
    q: str = "",
    ctx: SessionContext = Depends(require_lookup),
    settings: Settings = Depends(get_settings),
    http: httpx.AsyncClient = Depends(get_http),
):
    scoped = await ctx.scoped()
    return {"items": await account.search_users(http, settings, scoped, q)}


@router.get("/identity/users/{user_id}")
async def lookup_user(
    user_id: str,
    ctx: SessionContext = Depends(require_lookup),
    settings: Settings = Depends(get_settings),
    http: httpx.AsyncClient = Depends(get_http),
):
    scoped = await ctx.scoped()
    return await account.lookup_user(http, settings, scoped, user_id)
