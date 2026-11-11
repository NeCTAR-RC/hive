import json

import fakeredis.aioredis
import pytest

from hive.session.model import SESSION_VERSION, SessionData
from hive.session.store import SessionStore, TOUCH_INTERVAL
from tests.unit.sessions import make_session, scoped_token


def test_sign_and_unsign_round_trip(store):
    cookie = store.sign("abc-def_123")
    assert store.unsign(cookie) == "abc-def_123"


@pytest.mark.parametrize("cookie", ["junk", "", None, ".sig"])
def test_unsign_rejects_junk(store, cookie):
    assert store.unsign(cookie) is None


def test_unsign_rejects_tampering(store):
    cookie = store.sign("sid")
    assert store.unsign(cookie[:-2] + "zz") is None


def test_unsign_rejects_another_secret(store):
    other = SessionStore(
        fakeredis.aioredis.FakeRedis(), "another-secret-value", timeout=1
    )
    assert other.unsign(store.sign("sid")) is None


@pytest.mark.parametrize(
    ("expires_in", "low", "high"),
    [(3600, 600, 600), (120, 1, 120), (-5, 0, 0)],
)
def test_ttl_is_capped_by_token_life(store, expires_in, low, high):
    assert low <= store.ttl_for(make_session(expires_in=expires_in)) <= high


async def test_create_and_load(store):
    sid, cookie = await store.create(make_session())
    assert store.unsign(cookie) == sid
    loaded = await store.load(sid)
    assert loaded is not None
    data, _last_seen = loaded
    assert data.user.id == "u1"
    assert data.current is not None
    assert data.current.token.get_secret_value() == "scoped-0"
    assert data.current.endpoints == {"compute": "https://nova.test/0"}


async def test_load_reads_only_the_current_projects_token(store):
    sid, _ = await store.create(make_session(projects=3))
    data, _ = await store.load(sid)
    assert list(data.scoped) == ["p0"]
    other = await store.scoped(sid, "p2")
    assert other is not None
    assert other.token.get_secret_value() == "scoped-2"


async def test_each_part_is_its_own_field(store, redis):
    sid, _ = await store.create(make_session(projects=2))
    fields = set(await redis.hkeys(store.key(sid)))
    assert fields == {
        "core",
        "unscoped",
        "projects",
        "current",
        "last_seen",
        "scoped:p0",
        "scoped:p1",
    }
    core = json.loads(await redis.hget(store.key(sid), "core"))
    assert set(core) == {"v", "user", "csrf", "created_at"}


async def test_another_version_reads_as_logged_out(store, redis):
    sid, _ = await store.create(make_session())
    core = json.loads(await redis.hget(store.key(sid), "core"))
    core["v"] = SESSION_VERSION - 1
    await redis.hset(store.key(sid), "core", json.dumps(core))
    assert await store.load(sid) is None


async def test_a_version_one_blob_reads_as_logged_out(store, redis):
    key = store.key("old-sid")
    await redis.hset(key, mapping={"data": "{}", "last_seen": 1})
    assert await store.load("old-sid") is None


async def test_touch_within_the_interval_is_a_no_op(store):
    sid, _ = await store.create(make_session())
    data, last_seen = await store.load(sid)
    await store.touch(sid, data, last_seen, now=last_seen + 1)
    assert (await store.load(sid))[1] == last_seen


async def test_touch_after_the_interval_slides_the_expiry(store):
    sid, _ = await store.create(make_session())
    data, last_seen = await store.load(sid)
    await store.touch(sid, data, last_seen, now=last_seen + TOUCH_INTERVAL + 1)
    assert (await store.load(sid))[1] > last_seen


async def test_writes_never_recreate_a_destroyed_session(store, redis):
    sid, _ = await store.create(make_session())
    data, last_seen = await store.load(sid)
    await store.destroy(sid, "u1")
    await store.put_scoped(sid, data.scoped["p0"], make_current=True)
    await store.touch(sid, data, last_seen, now=last_seen + 10_000)
    assert await redis.exists(store.key(sid)) == 0


async def test_destroy(store):
    sid, _ = await store.create(make_session())
    await store.destroy(sid, "u1")
    assert await store.load(sid) is None
    assert await store.count_for_user("u1") == 0


async def test_expired_token_is_not_stored(store):
    sid, _ = await store.create(make_session(expires_in=-1))
    assert await store.load(sid) is None


async def test_put_scoped_can_switch_in_the_same_write(store):
    sid, _ = await store.create(make_session())
    data, _ = await store.load(sid)
    await store.put_scoped(
        sid, scoped_token(7, data.unscoped.expires_at), make_current=True
    )
    switched, _ = await store.load(sid)
    assert switched.current_project_id == "p7"
    assert switched.current is not None
    assert switched.current.token.get_secret_value() == "scoped-7"


async def test_scoped_tokens_are_bounded_lru(store):
    data = make_session(projects=SessionData.MAX_SCOPED)
    sid, _ = await store.create(data)
    expires = data.unscoped.expires_at
    for index in range(100, 103):
        await store.put_scoped(sid, scoped_token(index, expires))
    held = {token.project.id for token in await store.all_scoped(sid)}
    assert len(held) == SessionData.MAX_SCOPED
    # The current project is never evicted; the least recently used are.
    assert "p0" in held
    assert {"p1", "p2", "p3"}.isdisjoint(held)
    assert {"p100", "p101", "p102"} <= held


async def test_put_unscoped_drops_every_scoped_token(store):
    data = make_session(projects=3)
    sid, _ = await store.create(data)
    await store.put_unscoped(sid, data)
    assert await store.all_scoped(sid) == []
    reloaded, _ = await store.load(sid)
    assert reloaded.unscoped.token.get_secret_value() == "unscoped"


async def test_put_projects(store):
    data = make_session(projects=1)
    sid, _ = await store.create(data)
    await store.put_projects(
        sid,
        [*data.projects, scoped_token(5, data.unscoped.expires_at).project],
    )
    reloaded, _ = await store.load(sid)
    assert [p.id for p in reloaded.projects] == ["p0", "p5"]


async def test_expired_sessions_leave_the_user_index(store, redis):
    first, _ = await store.create(make_session())
    second, _ = await store.create(make_session())
    assert await store.count_for_user("u1") == 2
    # Redis expiring the session key leaves its index entry behind.
    await redis.delete(store.key(first))
    assert await store.count_for_user("u1") == 1
    assert await redis.smembers(store.user_key("u1")) == {store.key(second)}
