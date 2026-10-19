from datetime import datetime, timedelta, UTC

import fakeredis.aioredis
import pytest

from hive.session.model import ProjectRef, ScopedToken, SessionData, TokenInfo
from hive.session.model import UserRef
from hive.session.store import SessionStore, TOUCH_INTERVAL


def make_session(expires_in=3600, projects=1) -> SessionData:
    expires = datetime.now(UTC) + timedelta(seconds=expires_in)
    data = SessionData(
        user=UserRef(id="u1", name="sam"),
        unscoped=TokenInfo(token="unscoped", expires_at=expires),
        csrf="csrf-token",
        current_project_id="p0",
    )
    for index in range(projects):
        project = ProjectRef(id=f"p{index}", name=f"proj{index}")
        data.projects.append(project)
        data.put_scoped(
            ScopedToken(
                token=f"scoped-{index}",
                expires_at=expires,
                project=project,
                roles=["member"],
                last_used=float(index),
            )
        )
    return data


@pytest.fixture
async def store():
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    yield SessionStore(redis, "secret" * 4, timeout=600)
    await redis.aclose()


def test_sign_and_unsign_round_trip(store):
    cookie = store.sign("abc-def_123")
    assert store.unsign(cookie) == "abc-def_123"


def test_unsign_rejects_tampering(store):
    cookie = store.sign("sid")
    assert store.unsign(cookie[:-2] + "zz") is None
    assert store.unsign("junk") is None
    assert store.unsign("") is None
    assert store.unsign(None) is None
    other = SessionStore(
        fakeredis.aioredis.FakeRedis(), "another-secret-value", timeout=1
    )
    assert other.unsign(cookie) is None


def test_ttl_is_capped_by_token_life(store):
    assert store.ttl_for(make_session(expires_in=3600)) == 600
    assert 0 < store.ttl_for(make_session(expires_in=120)) <= 120
    assert store.ttl_for(make_session(expires_in=-5)) == 0


async def test_create_load_touch_destroy(store):
    data = make_session()
    sid, cookie = await store.create(data)
    assert store.unsign(cookie) == sid
    loaded = await store.load(sid)
    assert loaded is not None
    reloaded, last_seen = loaded
    assert reloaded.user.id == "u1"
    assert reloaded.current.token == "scoped-0"
    assert await store.count_for_user("u1") == 1

    # A touch within the interval is a no-op; one after it rewrites.
    await store.touch(sid, reloaded, last_seen, now=last_seen + 1)
    assert (await store.load(sid))[1] == last_seen
    await store.touch(
        sid, reloaded, last_seen, now=last_seen + TOUCH_INTERVAL + 1
    )
    assert (await store.load(sid))[1] > last_seen

    await store.destroy(sid, "u1")
    assert await store.load(sid) is None
    assert await store.count_for_user("u1") == 0


async def test_save_with_expired_token_removes_session(store):
    data = make_session(expires_in=-1)
    sid, _ = await store.create(data)
    assert await store.load(sid) is None


def test_scoped_tokens_are_bounded_lru():
    data = make_session(projects=SessionData.MAX_SCOPED + 3)
    assert len(data.scoped) == SessionData.MAX_SCOPED
    # The current project is never evicted; the least recently used are.
    assert "p0" in data.scoped
    assert "p1" not in data.scoped


def test_reprs_never_carry_tokens():
    data = make_session(projects=2)
    for text in (repr(data), str(data), repr(data.scoped["p1"])):
        assert "'unscoped'" not in text
        assert "scoped-0" not in text and "scoped-1" not in text
    # Serialisation still carries the token.
    assert "scoped-1" in data.model_dump_json()


async def test_count_for_user_prunes_expired_sessions(store):
    data = make_session()
    sid, _ = await store.create(data)
    other, _ = await store.create(data)
    assert await store.count_for_user("u1") == 2
    # Expire one by TTL, bypassing destroy().
    await store._redis.delete(store.key(sid))
    assert await store.count_for_user("u1") == 1
    assert await store._redis.smembers(store.user_key("u1")) == {
        store.key(other)
    }
