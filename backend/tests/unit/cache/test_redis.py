import asyncio

import fakeredis.aioredis
import pytest

from hive.cache.policy import Policy
from hive.cache import redis as cache_module
from hive.cache.redis import Cache

SHARED = Policy("thing", 10, 20, "global")
PER_PROJECT = Policy("alloc", 10, 0, "project")
LONG = Policy("long", 60, 0, "global")


@pytest.fixture
async def cache():
    client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    yield Cache(client)
    await client.aclose()


class Clock:
    def __init__(self, start=1000.0):
        self.now = start

    def __call__(self):
        return self.now


@pytest.fixture
def clock(monkeypatch):
    clock = Clock()
    monkeypatch.setattr(cache_module.time, "time", clock)
    return clock


def test_global_key_is_shared(cache):
    assert cache.key(SHARED, "a", "b") == "hive:c:g:thing:a:b"


def test_project_key_carries_the_project(cache):
    assert cache.key(PER_PROJECT, "x", project_id="p1") == (
        "hive:c:p:p1:alloc:x"
    )


def test_project_policy_needs_a_project(cache):
    with pytest.raises(ValueError, match="per project"):
        cache.key(PER_PROJECT)


def test_global_policy_refuses_a_project(cache):
    with pytest.raises(ValueError, match="globally"):
        cache.key(SHARED, project_id="p1")


async def test_hit_stale_and_miss(cache, clock):
    calls = []

    async def fetch():
        calls.append(clock.now)
        return {"n": len(calls)}

    first = await cache.get_or_fetch(SHARED, fetch)
    assert (first.state, first.value) == ("miss", {"n": 1})

    clock.now += 5
    second = await cache.get_or_fetch(SHARED, fetch)
    assert (second.state, second.value) == ("hit", {"n": 1})

    clock.now += 10  # 15s old: stale, served immediately, refreshed behind
    third = await cache.get_or_fetch(SHARED, fetch)
    assert (third.state, third.value) == ("stale", {"n": 1})
    await cache.close()
    assert len(calls) == 2

    clock.now += 1
    fourth = await cache.get_or_fetch(SHARED, fetch)
    assert (fourth.state, fourth.value) == ("hit", {"n": 2})

    clock.now += 100  # beyond ttl + stale: fetched inline
    fifth = await cache.get_or_fetch(SHARED, fetch)
    assert (fifth.state, fifth.value) == ("miss", {"n": 3})


async def test_project_entries_are_separate(cache):
    async def fetch_p1():
        return "p1 view"

    async def fetch_p2():
        return "p2 view"

    await cache.get_or_fetch(PER_PROJECT, fetch_p1, project_id="p1")
    other = await cache.get_or_fetch(PER_PROJECT, fetch_p2, project_id="p2")
    assert (other.state, other.value) == ("miss", "p2 view")


async def test_should_cache_skips_partial_values(cache):
    async def fetch():
        return {"partial": True}

    result = await cache.get_or_fetch(
        PER_PROJECT,
        fetch,
        project_id="p1",
        should_cache=lambda v: not v["partial"],
    )
    assert result.state == "miss"
    again = await cache.get_or_fetch(PER_PROJECT, fetch, project_id="p1")
    assert again.state == "miss"


async def test_refresh_errors_are_swallowed(cache, clock):
    flaky = Policy("flaky", 1, 100, "global")
    calls = []

    async def fetch():
        calls.append(1)
        if len(calls) > 1:
            raise RuntimeError("upstream down")
        return "ok"

    await cache.get_or_fetch(flaky, fetch)
    clock.now += 5
    result = await cache.get_or_fetch(flaky, fetch)
    assert result.state == "stale"
    await cache.close()
    await asyncio.sleep(0)
    assert len(calls) == 2
    # The stale value is still there to serve.
    assert (await cache.get_or_fetch(flaky, fetch)).value == "ok"


async def test_invalidate(cache):
    async def fetch():
        return 1

    await cache.get_or_fetch(LONG, fetch, "x")
    await cache.invalidate(LONG, "x")
    assert (await cache.get_or_fetch(LONG, fetch, "x")).state == "miss"


async def test_set_and_get_json(cache):
    await cache.set_json(PER_PROJECT, {"step": 2}, "lb-1", project_id="p1")
    stored = await cache.get_json(PER_PROJECT, "lb-1", project_id="p1")
    assert stored == {"step": 2}
    key = cache.key(PER_PROJECT, "lb-1", project_id="p1")
    assert 0 < await cache._redis.ttl(key) <= PER_PROJECT.ttl


async def test_get_json_of_nothing_is_none(cache):
    assert await cache.get_json(PER_PROJECT, "gone", project_id="p1") is None


@pytest.mark.parametrize(
    "raw",
    [
        "not json",
        "[]",
        '{"value": 1, "ttl": 60, "stale_ttl": 0}',
        '{"value": 1, "fetched_at": "x", "ttl": 60, "stale_ttl": 0}',
        '{"value": 1, "fetched_at": 1, "ttl": null, "stale_ttl": 0}',
    ],
)
async def test_malformed_entries_are_a_miss(cache, raw):
    await cache._redis.set(cache.key(LONG), raw)

    async def fetch():
        return "fresh"

    result = await cache.get_or_fetch(LONG, fetch)
    assert (result.value, result.state) == ("fresh", "miss")
    again = await cache.get_or_fetch(LONG, fetch)
    assert again.state == "hit"


async def test_get_json_of_invalid_json_is_none(cache):
    await cache._redis.set(cache.key(LONG), "not json")
    assert await cache.get_json(LONG) is None


async def test_concurrent_misses_fetch_once(cache):
    calls = []
    release = asyncio.Event()

    async def fetch():
        calls.append(1)
        await release.wait()
        return "value"

    first = asyncio.create_task(cache.get_or_fetch(LONG, fetch, "cold"))
    second = asyncio.create_task(cache.get_or_fetch(LONG, fetch, "cold"))
    await asyncio.sleep(0.01)
    release.set()
    results = await asyncio.gather(first, second)
    assert len(calls) == 1
    assert [r.value for r in results] == ["value", "value"]


async def test_waiter_fetches_itself_when_winner_does_not_store(cache):
    calls = []

    async def fetch():
        calls.append(1)
        await asyncio.sleep(0.01)
        return {"partial": True}

    results = await asyncio.gather(
        *(
            cache.get_or_fetch(LONG, fetch, "p", should_cache=lambda v: False)
            for _ in range(2)
        )
    )
    assert len(calls) == 2
    assert all(r.state == "miss" for r in results)


async def test_lock_release_keeps_a_lock_taken_by_another_worker(cache):
    lock = cache.key(LONG, "slow") + ":lock"

    async def fetch():
        # Our lock expired mid-fetch and another worker took the key.
        await cache._redis.set(lock, "someone-else")
        return 1

    await cache.get_or_fetch(LONG, fetch, "slow")
    assert await cache._redis.get(lock) == "someone-else"
