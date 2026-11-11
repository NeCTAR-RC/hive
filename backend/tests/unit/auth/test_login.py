"""Project tokens: rescoping is single-flight, and a switch and a
rescope running side by side keep each other's writes."""

import asyncio
from datetime import datetime, timedelta, UTC
from typing import cast

from pydantic import SecretStr
import pytest

from hive.auth.keystone import KeystoneClient, TokenResult
from hive.auth.login import AuthService, NoProjects, RESCOPE_MARGIN, usable
from hive.errors import Forbidden
from hive.session.model import ProjectRef, UserRef
from tests.unit.sessions import make_session

CATALOG = [
    {
        "type": "compute",
        "endpoints": [
            {"interface": "public", "region": "Melbourne", "url": "nova"},
            {"interface": "admin", "region": "Melbourne", "url": "admin"},
        ],
    }
]


class SlowKeystone:
    """Answers scope requests once ``release`` is set, counting them."""

    def __init__(self):
        self.calls: list[str | None] = []
        self.release = asyncio.Event()

    async def token_from_token(self, _token, project_id=None) -> TokenResult:
        self.calls.append(project_id)
        await self.release.wait()
        return TokenResult(
            token=SecretStr(f"fresh-{project_id}"),
            expires_at=datetime.now(UTC) + timedelta(hours=1),
            user=UserRef(id="u1", name="sam"),
            project=ProjectRef(id=project_id or "", name="p"),
            catalog=CATALOG,
        )


def make_auth(store, keystone) -> AuthService:
    return AuthService(
        cast(KeystoneClient, keystone),
        store,
        interface="public",
        region="Melbourne",
    )


async def expiring_session(store):
    data = make_session(projects=2)
    soon = datetime.now(UTC) + timedelta(seconds=RESCOPE_MARGIN - 1)
    for token in data.scoped.values():
        token.expires_at = soon
    sid, _ = await store.create(data)
    return sid


def test_usable_needs_more_than_the_margin():
    data = make_session()
    token = data.scoped["p0"]
    now = token.expires_at.timestamp()
    assert usable(token, now - RESCOPE_MARGIN - 1)
    assert not usable(token, now - RESCOPE_MARGIN + 1)
    assert not usable(None)


async def test_parallel_requests_rescope_once(store):
    keystone = SlowKeystone()
    auth = make_auth(store, keystone)
    sid = await expiring_session(store)
    sessions = [(await store.load(sid))[0] for _ in range(5)]
    waiting = [
        asyncio.create_task(auth.ensure_scoped(sid, data, "p0"))
        for data in sessions
    ]
    await asyncio.sleep(0.01)
    keystone.release.set()
    tokens = await asyncio.gather(*waiting)
    assert keystone.calls == ["p0"]
    assert {t.token.get_secret_value() for t in tokens} == {"fresh-p0"}


async def test_a_refused_token_is_replaced_once(store):
    """Requests an upstream refused with the same, unexpired token share
    one rescope: the first replaces it, the rest read the new one back."""
    keystone = SlowKeystone()
    keystone.release.set()
    auth = make_auth(store, keystone)
    sid, _ = await store.create(make_session(projects=2))
    sessions = [(await store.load(sid))[0] for _ in range(3)]
    refused = sessions[0].scoped["p0"]
    assert usable(refused)
    tokens = await asyncio.gather(
        *(
            auth.ensure_scoped(sid, data, "p0", rejected=refused)
            for data in sessions
        )
    )
    assert keystone.calls == ["p0"]
    assert {t.token.get_secret_value() for t in tokens} == {"fresh-p0"}
    # Refused again with the new token: one more rescope.
    await auth.ensure_scoped(sid, sessions[0], "p0", rejected=tokens[0])
    assert keystone.calls == ["p0", "p0"]


async def test_the_scoped_token_keeps_only_its_endpoints(store):
    keystone = SlowKeystone()
    keystone.release.set()
    auth = make_auth(store, keystone)
    sid = await expiring_session(store)
    data, _ = await store.load(sid)
    token = await auth.ensure_scoped(sid, data, "p0")
    assert token.endpoints == {"compute": "nova"}


async def test_a_rescope_does_not_undo_a_switch(store):
    keystone = SlowKeystone()
    auth = make_auth(store, keystone)
    sid = await expiring_session(store)
    rescoping, _ = await store.load(sid)
    switching, _ = await store.load(sid)
    # A request on p0 rescopes slowly while another switches to p1.
    slow = asyncio.create_task(auth.ensure_scoped(sid, rescoping, "p0"))
    await asyncio.sleep(0.01)
    switch = asyncio.create_task(auth.switch_project(sid, switching, "p1"))
    await asyncio.sleep(0.01)
    keystone.release.set()
    await asyncio.gather(slow, switch)
    after, _ = await store.load(sid)
    assert after.current_project_id == "p1"
    assert (await store.scoped(sid, "p0")).token.get_secret_value() == (
        "fresh-p0"
    )


async def test_logout_returns_every_token_to_revoke(store):
    auth = make_auth(store, SlowKeystone())
    sid, _ = await store.create(make_session(projects=2))
    data, _ = await store.load(sid)
    tokens = await auth.logout(sid, data, revoke=True)
    assert sorted(t.get_secret_value() for t in tokens) == [
        "scoped-0",
        "scoped-1",
        "unscoped",
    ]
    assert await store.load(sid) is None


async def test_logout_without_revocation_reads_no_tokens(store):
    auth = make_auth(store, SlowKeystone())
    sid, _ = await store.create(make_session())
    data, _ = await store.load(sid)
    assert await auth.logout(sid, data) == []


class ScopingKeystone(SlowKeystone):
    """Refuses to scope the projects in ``refused``."""

    def __init__(self, refused: set[str]):
        super().__init__()
        self.release.set()
        self.refused = refused
        self.passwords: list[str] = []

    async def token_from_token(self, _token, project_id=None) -> TokenResult:
        if project_id in self.refused:
            raise Forbidden("not a member")
        return await super().token_from_token(_token, project_id)

    async def list_projects(self, _token):
        return [
            ProjectRef(id="p0", name="zero"),
            ProjectRef(id="p1", name="one"),
            ProjectRef(id="p2", name="off", enabled=False),
        ]

    async def password_token(self, _name, password, **_options):
        self.passwords.append(password)
        return await super().token_from_token(None)


async def test_login_skips_projects_it_cannot_scope(store):
    auth = make_auth(store, ScopingKeystone(refused={"p0"}))
    _sid, _cookie, data = await auth.login_with_unscoped_token(
        SecretStr("t"), recent_project="p0"
    )
    assert data.current_project_id == "p1"
    assert [p.id for p in data.projects] == ["p0", "p1"]


async def test_login_with_no_scopable_project(store):
    auth = make_auth(store, ScopingKeystone(refused={"p0", "p1"}))
    with pytest.raises(NoProjects):
        await auth.login_with_unscoped_token(SecretStr("t"))


async def test_reauthenticate_replaces_every_token(store):
    keystone = ScopingKeystone(refused=set())
    auth = make_auth(store, keystone)
    sid, _ = await store.create(make_session(projects=2))
    data, _ = await store.load(sid)
    await auth.reauthenticate(sid, data, "new-pass", "p0", delay=0.001)
    assert keystone.passwords == ["new-pass"]
    held = await store.all_scoped(sid)
    assert [t.token.get_secret_value() for t in held] == ["fresh-p0"]
    reloaded, _ = await store.load(sid)
    assert reloaded.unscoped.token.get_secret_value() == "fresh-None"
