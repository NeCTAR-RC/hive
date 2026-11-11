"""The account panels: My Details, Reset Password and the helpdesk User
Details lookup (``/api/me/...`` and ``/api/identity/users/...``)."""

from typing import Annotated

from fastapi import APIRouter, Depends

from hive.deps import ContextDep, SessionDep
from hive.errors import Forbidden
from hive.schemas.account import ProfileUpdate
from hive.schemas.responses import Items
from hive.schemas.responses.account import (
    PasswordReset,
    Profile,
    ProfileUnavailable,
    UserDetails,
    UserSearchResult,
)
from hive.services import account
from hive.services.context import Context

router = APIRouter(tags=["account"])


async def lookup_context(ctx: ContextDep) -> Context:
    """``USER_INFO_LOOKUP_ROLES``: the helpdesk roles may look users up."""
    if not set(ctx.scoped.roles) & set(ctx.settings.user_lookup_roles):
        raise Forbidden("User lookup needs a helpdesk role.")
    return ctx


LookupDep = Annotated[Context, Depends(lookup_context)]


@router.get("/me/profile")
async def profile(
    ctx: ContextDep, session: SessionDep
) -> Profile | ProfileUnavailable:
    return await account.profile(ctx, session.data.user.id)


@router.patch("/me/profile")
async def update_profile(
    body: ProfileUpdate, ctx: ContextDep, session: SessionDep
) -> Profile:
    return await account.update_profile(ctx, session.data.user.id, body)


@router.post("/me/reset-password")
async def reset_password(
    ctx: ContextDep, session: SessionDep
) -> PasswordReset:
    """The new password is in this reply only, once."""
    password = await account.reset_password(ctx, session.data.user)
    await session.reauthenticate(password)
    return PasswordReset(password=password, username=session.data.user.name)


@router.get("/identity/users/search")
async def search_users(ctx: LookupDep, q: str = "") -> Items[UserSearchResult]:
    return Items[UserSearchResult](items=await account.search_users(ctx, q))


@router.get("/identity/users/{user_id}")
async def lookup_user(user_id: str, ctx: LookupDep) -> UserDetails:
    return await account.lookup_user(ctx, user_id)
