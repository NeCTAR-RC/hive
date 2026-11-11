"""The account panels: My Details (manuka profile and ORCID), Reset
Password, and the helpdesk User Details lookup."""

import base64
import hashlib
import secrets
from urllib.parse import quote

from hive.clients.nectar import ManukaClient
from hive.clients.openstack import KeystoneIdentityClient
from hive.config import Settings
from hive.errors import HiveError
from hive.schemas.account import AFFILIATIONS, ProfileUpdate
from hive.schemas.responses.account import (
    Profile,
    ProfileUnavailable,
    UserDetails,
    UserSearchResult,
)
from hive.services.context import Context
from hive.session.model import UserRef

MY_DETAILS_PATH = "/account/my-details"
LOOKUP_MIN_CHARS = 3

PROFILE_FIELDS = (
    "first_name",
    "surname",
    "displayname",
    "email",
    "organisation",
    "affiliation",
    "phone_number",
    "mobile_number",
    "orcid",
    "registered_at",
    "last_login",
    "terms_accepted_at",
    "expiry_status",
    "expiry_next_step",
)


class PasswordResetUnavailable(HiveError):
    status = 503
    code = "password_reset_unavailable"


def orcid_links(settings: Settings) -> dict:
    """The connect and disconnect targets My Details renders
    (``user_info/update/views.py:50-54``, ``edit.html:51-75``): manuka
    returns the browser to ``next`` after the ORCID round trip."""
    return_to = settings.public_url.rstrip("/") + MY_DETAILS_PATH
    link = None
    if settings.orcid_link_url:
        link = f"{settings.orcid_link_url}?next={quote(return_to, safe='')}"
    return {
        "orcid_url": settings.orcid_url.rstrip("/"),
        "orcid_link_url": link,
        "orcid_unlink_url": settings.orcid_unlink_url,
        "orcid_return_url": return_to,
    }


def profile_payload(user: dict, settings: Settings) -> dict:
    payload: dict = {"partial": False, "id": user.get("id")}
    for field in PROFILE_FIELDS:
        payload[field] = user.get(field)
    for field in ("first_name", "surname", "displayname"):
        payload[field] = payload[field] or ""
    payload["external_ids"] = [
        {"idp": e.get("idp"), "last_login": e.get("last_login")}
        for e in (user.get("external_ids") or [])
    ]
    payload["affiliations"] = AFFILIATIONS
    payload.update(orcid_links(settings))
    return payload


def _manuka(ctx: Context) -> ManukaClient:
    return ManukaClient(ctx.http, ctx.settings, ctx.scoped)


async def profile(ctx: Context, user_id: str) -> Profile | ProfileUnavailable:
    """The manuka account record; ``partial`` when manuka is unavailable."""
    settings = ctx.settings
    try:
        user = await _manuka(ctx).get_user(user_id)
    except HiveError as exc:
        return ProfileUnavailable.model_validate(
            {
                "partial": True,
                "error": exc.code,
                "message": exc.message,
                **orcid_links(settings),
            }
        )
    return Profile.model_validate(profile_payload(user, settings))


async def update_profile(
    ctx: Context, user_id: str, data: ProfileUpdate
) -> Profile:
    """``user_info/update/forms.py:62-66``: PATCH the three editable
    fields; everything else comes from the identity provider."""
    manuka = _manuka(ctx)
    await manuka.update_user(
        user_id,
        affiliation=data.affiliation,
        phone_number=data.phone_number or "",
        mobile_number=data.mobile_number or "",
    )
    return Profile.model_validate(
        profile_payload(await manuka.get_user(user_id), ctx.settings)
    )


def new_password() -> str:
    """Twenty characters built the way Horizon does it
    (``reset_password/views.py:27-30``)."""
    bits = str(secrets.randbits(256)).encode()
    digest = hashlib.sha1(bits).hexdigest().encode()  # noqa: S324
    return base64.b64encode(digest).decode()[:20]


async def reset_password(ctx: Context, user: UserRef) -> str:
    """Set a fresh API password and return it; it is never stored.

    Keystone takes the shared reset token as the "original password"
    (``PASSWORD_RESET_TOKEN``, ``reset_password/views.py:36-56``).
    Changing the password revokes the user's tokens, so the caller logs
    the session in again with the result (``SessionContext.reauthenticate``).
    """
    token = ctx.settings.password_reset_token
    if token is None:
        raise PasswordResetUnavailable(
            "Password reset is not configured on this dashboard."
        )
    password = new_password()
    keystone = KeystoneIdentityClient(ctx.http, ctx.settings, ctx.scoped)
    await keystone.change_own_password(
        user.id, token.get_secret_value(), password
    )
    return password


async def search_users(ctx: Context, q: str) -> list[UserSearchResult]:
    """``user_info/lookup/views.py:31-50``: nothing is searched below
    three characters."""
    query = (q or "").strip()
    if len(query) < LOOKUP_MIN_CHARS:
        return []
    results = await _manuka(ctx).search_users(query)
    return [
        UserSearchResult.model_validate(
            {
                "id": user.get("id"),
                "displayname": user.get("displayname") or "",
                "email": user.get("email"),
            }
        )
        for user in results
    ]


async def lookup_user(ctx: Context, user_id: str) -> UserDetails:
    user = await _manuka(ctx).get_user(user_id)
    payload = profile_payload(user, ctx.settings)
    for key in ("affiliations", "orcid_link_url", "orcid_unlink_url"):
        payload.pop(key, None)
    return UserDetails.model_validate(payload)
