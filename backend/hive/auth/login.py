"""The login flow shared by the manuka receiver and the dev login script.

Mirrors Horizon's ``openstack_auth`` backend: validate the unscoped token
by re-issuing it, list the user's enabled projects, pick the most recent
project (cookie) or the first, scope, and remember both tokens. Project
switching always rescopes from the unscoped token.
"""

import asyncio
from dataclasses import dataclass, field
import time
from weakref import WeakValueDictionary

from pydantic import SecretStr

from hive.auth import csrf
from hive.auth.keystone import KeystoneClient, TokenResult
from hive.clients.base import endpoints_for
from hive.errors import Forbidden, HiveError, NotAuthenticated, NotFound
from hive.session.model import ScopedToken, SessionData, TokenInfo
from hive.session.store import SessionStore

# Rescope a cached project token when it has less than this left (seconds).
RESCOPE_MARGIN = 120


class NoProjects(HiveError):
    status = 403
    code = "no_projects"


def _same_token(a: ScopedToken, b: ScopedToken | None) -> bool:
    """Whether ``b`` is the very token ``a`` carries."""
    return b is not None and (
        a.token.get_secret_value() == b.token.get_secret_value()
    )


def usable(scoped: ScopedToken | None, now: float | None = None) -> bool:
    """A cached project token with enough life left to finish a request."""
    if scoped is None:
        return False
    now = time.time() if now is None else now
    return scoped.expires_at.timestamp() - now > RESCOPE_MARGIN


@dataclass
class AuthService:
    """Logins, project tokens and logouts over Keystone and the store.

    Rescoping is single-flight per ``(session, project)`` within this
    process (one web worker per pod): when a project token expires, the
    SPA's parallel requests make one Keystone call, not one each.
    """

    keystone: KeystoneClient
    store: SessionStore
    interface: str = "public"
    region: str | None = None
    _rescoping: WeakValueDictionary[tuple[str, str], asyncio.Lock] = field(
        default_factory=WeakValueDictionary, init=False, repr=False
    )

    def _scoped_from(self, result: TokenResult) -> ScopedToken:
        if result.project is None:  # pragma: no cover - keystone contract
            raise HiveError("scoped token without a project")
        return ScopedToken(
            token=result.token,
            expires_at=result.expires_at,
            project=result.project,
            roles=result.roles,
            endpoints=endpoints_for(
                result.catalog, self.interface, self.region
            ),
        )

    async def login_with_unscoped_token(
        self, token: SecretStr, recent_project: str | None = None
    ) -> tuple[str, str, SessionData]:
        """Create a session from a manuka-issued unscoped token.

        Returns ``(sid, cookie_value, session_data)``.
        """
        unscoped = await self.keystone.token_from_token(token)
        projects = [
            p
            for p in await self.keystone.list_projects(unscoped.token)
            if p.enabled
        ]
        if not projects:
            raise NoProjects("no enabled projects for this user")
        ordered = list(projects)
        if recent_project:
            # Stable sort: the remembered project first, the rest unchanged.
            ordered.sort(key=lambda p: 0 if p.id == recent_project else 1)
        scoped = None
        for project in ordered:
            try:
                result = await self.keystone.token_from_token(
                    unscoped.token, project_id=project.id
                )
            except (NotAuthenticated, Forbidden):
                continue
            scoped = self._scoped_from(result)
            break
        if scoped is None:
            raise NoProjects("no project could be scoped")
        data = SessionData(
            user=unscoped.user,
            unscoped=TokenInfo(
                token=unscoped.token, expires_at=unscoped.expires_at
            ),
            current_project_id=scoped.project.id,
            projects=projects,
            csrf=csrf.new_token(),
            scoped={scoped.project.id: scoped},
        )
        sid, cookie = await self.store.create(data)
        return sid, cookie, data

    async def refresh_projects(
        self, sid: str, data: SessionData
    ) -> SessionData:
        data.projects = [
            p
            for p in await self.keystone.list_projects(data.unscoped.token)
            if p.enabled
        ]
        await self.store.put_projects(sid, data.projects)
        return data

    async def ensure_scoped(
        self,
        sid: str,
        data: SessionData,
        project_id: str,
        *,
        rejected: ScopedToken | None = None,
    ) -> ScopedToken:
        """Return a usable scoped token for ``project_id``, rescoping if
        it is missing or about to expire, or when it is ``rejected`` (an
        upstream refused it although it had not expired).

        Requests that find the token stale (or refused) together wait on
        one lock; the first rescopes, the rest read its token back from
        the store. A stored token that is the refused one is never read
        back, so each refusal costs at most one rescope.
        """
        cached = data.scoped.get(project_id)
        if rejected is None and cached is not None and usable(cached):
            return cached
        lock = self._rescoping.setdefault((sid, project_id), asyncio.Lock())
        async with lock:
            stored = await self.store.scoped(sid, project_id)
            if (
                stored is not None
                and usable(stored)
                and not _same_token(stored, rejected)
            ):
                data.scoped[project_id] = stored
                return stored
            result = await self.keystone.token_from_token(
                data.unscoped.token, project_id=project_id
            )
            scoped = self._scoped_from(result)
            await self.store.put_scoped(sid, scoped)
            data.scoped[project_id] = scoped
            return scoped

    async def switch_project(
        self, sid: str, data: SessionData, project_id: str
    ) -> ScopedToken:
        """Make ``project_id`` the session's project and return its token.

        The switch writes only the ``current`` field and that project's
        token, so a rescope running at the same time cannot revert it.
        """
        known = {p.id for p in data.projects}
        if project_id not in known:
            data = await self.refresh_projects(sid, data)
            known = {p.id for p in data.projects}
        if project_id not in known:
            raise NotFound("project is not available to this user")
        scoped = await self.ensure_scoped(sid, data, project_id)
        scoped.last_used = time.time()
        await self.store.put_scoped(sid, scoped, make_current=True)
        data.current_project_id = project_id
        return scoped

    async def reauthenticate(
        self,
        sid: str,
        data: SessionData,
        password: str,
        project_id: str,
        delay: float = 0,
    ) -> None:
        """Replace the session's tokens after a password change revoked
        them. Horizon waits a few seconds before using the new token
        (``reset_password/views.py:36-56``); ``delay`` does the same."""
        unscoped = await self.keystone.password_token(
            data.user.name, password, user_domain_id=data.user.domain_id
        )
        if delay > 0:
            await asyncio.sleep(delay)
        data.unscoped = TokenInfo(
            token=unscoped.token, expires_at=unscoped.expires_at
        )
        data.scoped = {}
        await self.store.put_unscoped(sid, data)
        await self.ensure_scoped(sid, data, project_id)

    async def logout(
        self, sid: str, data: SessionData, *, revoke: bool = False
    ) -> list[SecretStr]:
        """End the session. With ``revoke``, return every token it held,
        for ``revoke_tokens`` to revoke after the response."""
        tokens: list[SecretStr] = []
        if revoke:
            held = await self.store.all_scoped(sid)
            tokens = [data.unscoped.token, *(s.token for s in held)]
        await self.store.destroy(sid, data.user.id)
        return tokens

    async def revoke_tokens(self, tokens: list[SecretStr]) -> None:
        """Revoke tokens concurrently.

        Nectar's Horizon does not revoke on logout (``openstack_auth``
        ``views.logout`` only clears the session), so this runs only with
        ``HIVE_LOGOUT_REVOKES_TOKENS``, after the response has gone.
        """
        await asyncio.gather(*(self.keystone.revoke(t) for t in tokens))
