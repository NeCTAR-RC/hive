"""The login flow shared by the manuka receiver and the dev login script.

Mirrors Horizon's ``openstack_auth`` backend: validate the unscoped token
by re-issuing it, list the user's enabled projects, pick the most recent
project (cookie) or the first, scope, and remember both tokens. Project
switching always rescopes from the unscoped token.
"""

from dataclasses import dataclass
import time

from hive.auth import csrf
from hive.auth.keystone import KeystoneClient, TokenResult
from hive.errors import Forbidden, HiveError, NotAuthenticated, NotFound
from hive.session.model import ScopedToken, SessionData, TokenInfo
from hive.session.store import SessionStore

# Rescope a cached project token when it has less than this left (seconds).
RESCOPE_MARGIN = 120


class NoProjects(HiveError):
    status = 403
    code = "no_projects"


def _scoped_from(result: TokenResult) -> ScopedToken:
    if result.project is None:  # pragma: no cover - keystone contract
        raise HiveError("scoped token without a project")
    return ScopedToken(
        token=result.token,
        expires_at=result.expires_at,
        project=result.project,
        roles=result.roles,
        catalog=result.catalog,
    )


@dataclass
class AuthService:
    keystone: KeystoneClient
    store: SessionStore

    async def login_with_unscoped_token(
        self, token: str, recent_project: str | None = None
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
            scoped = _scoped_from(result)
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
        )
        data.put_scoped(scoped)
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
        await self.store.save(sid, data)
        return data

    async def ensure_scoped(
        self, sid: str, data: SessionData, project_id: str
    ) -> ScopedToken:
        """Return a usable scoped token for ``project_id``, rescoping if
        it is missing or about to expire."""
        cached = data.scoped.get(project_id)
        now = time.time()
        if cached and cached.expires_at.timestamp() - now > RESCOPE_MARGIN:
            return cached
        result = await self.keystone.token_from_token(
            data.unscoped.token, project_id=project_id
        )
        scoped = _scoped_from(result)
        data.put_scoped(scoped)
        await self.store.save(sid, data)
        return scoped

    async def switch_project(
        self, sid: str, data: SessionData, project_id: str
    ) -> SessionData:
        known = {p.id for p in data.projects}
        if project_id not in known:
            data = await self.refresh_projects(sid, data)
            known = {p.id for p in data.projects}
        if project_id not in known:
            raise NotFound("project is not available to this user")
        scoped = await self.ensure_scoped(sid, data, project_id)
        scoped.last_used = time.time()
        data.current_project_id = project_id
        await self.store.save(sid, data)
        return data

    async def logout(
        self, sid: str, data: SessionData, revoke: bool = False
    ) -> None:
        await self.store.destroy(sid, data.user.id)
        if revoke:
            for scoped in data.scoped.values():
                await self.keystone.revoke(scoped.token)
            await self.keystone.revoke(data.unscoped.token)
