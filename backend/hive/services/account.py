"""The account panels: My Details (manuka profile and ORCID), Reset
Password, and the helpdesk User Details lookup."""

import asyncio
import base64
import hashlib
import secrets
from urllib.parse import quote

import httpx

from hive.clients.nectar import ManukaClient
from hive.clients.openstack import KeystoneIdentityClient
from hive.config import Settings
from hive.deps import SessionContext
from hive.errors import HiveError
from hive.schemas.account import AFFILIATIONS, ProfileUpdate
from hive.session.model import ScopedToken, TokenInfo

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


async def profile(
    http: httpx.AsyncClient,
    settings: Settings,
    scoped: ScopedToken,
    user_id: str,
) -> dict:
    """The manuka account record; ``partial`` when manuka is unavailable."""
    try:
        user = await ManukaClient(http, settings, scoped).get_user(user_id)
    except HiveError as exc:
        return {
            "partial": True,
            "error": exc.code,
            "message": exc.message,
            **orcid_links(settings),
        }
    return profile_payload(user, settings)


async def update_profile(
    http: httpx.AsyncClient,
    settings: Settings,
    scoped: ScopedToken,
    user_id: str,
    data: ProfileUpdate,
) -> dict:
    """``user_info/update/forms.py:62-66``: PATCH the three editable
    fields; everything else comes from the identity provider."""
    manuka = ManukaClient(http, settings, scoped)
    await manuka.update_user(
        user_id,
        affiliation=data.affiliation,
        phone_number=data.phone_number or "",
        mobile_number=data.mobile_number or "",
    )
    return profile_payload(await manuka.get_user(user_id), settings)


def new_password() -> str:
    """Twenty characters built the way Horizon does it
    (``reset_password/views.py:27-30``)."""
    bits = str(secrets.randbits(256)).encode()
    digest = hashlib.sha1(bits).hexdigest().encode()  # noqa: S324
    return base64.b64encode(digest).decode()[:20]


async def reset_password(
    http: httpx.AsyncClient, settings: Settings, session: SessionContext
) -> dict:
    """Set a fresh API password and log the session in again with it.

    Changing the password revokes the user's tokens, so Horizon
    re-authenticates with the new password and waits a few seconds before
    using the result (``reset_password/views.py:36-56``). The new password
    is returned once and never stored.
    """
    if settings.password_reset_token is None:
        raise PasswordResetUnavailable(
            "Password reset is not configured on this dashboard."
        )
    data = session.data
    scoped = await session.scoped()
    password = new_password()
    keystone = KeystoneIdentityClient(http, settings, scoped)
    await keystone.change_own_password(
        data.user.id,
        settings.password_reset_token.get_secret_value(),
        password,
    )
    unscoped = await session.auth.keystone.password_token(
        data.user.name,
        password,
        user_domain_id=data.user.domain_id,
    )
    if settings.password_reset_delay > 0:
        await asyncio.sleep(settings.password_reset_delay)
    data.unscoped = TokenInfo(
        token=unscoped.token, expires_at=unscoped.expires_at
    )
    data.scoped = {}
    await session.store.save(session.sid, data)
    await session.auth.ensure_scoped(session.sid, data, session.project_id)
    return {"password": password, "username": data.user.name}


async def search_users(
    http: httpx.AsyncClient, settings: Settings, scoped: ScopedToken, q: str
) -> list[dict]:
    """``user_info/lookup/views.py:31-50``: nothing is searched below
    three characters."""
    query = (q or "").strip()
    if len(query) < LOOKUP_MIN_CHARS:
        return []
    results = await ManukaClient(http, settings, scoped).search_users(query)
    return [
        {
            "id": user.get("id"),
            "displayname": user.get("displayname") or "",
            "email": user.get("email"),
        }
        for user in results
    ]


async def lookup_user(
    http: httpx.AsyncClient,
    settings: Settings,
    scoped: ScopedToken,
    user_id: str,
) -> dict:
    user = await ManukaClient(http, settings, scoped).get_user(user_id)
    payload = profile_payload(user, settings)
    for key in ("affiliations", "orcid_link_url", "orcid_unlink_url"):
        payload.pop(key, None)
    return payload
