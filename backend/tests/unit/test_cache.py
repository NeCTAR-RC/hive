import asyncio

import fakeredis.aioredis
import pytest

from hive.cache import redis as cache_module
from hive.cache.redis import Cache


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


async def test_hit_stale_and_miss(cache, monkeypatch):
    clock = Clock()
    monkeypatch.setattr(cache_module.time, "time", clock)
    calls = []

    async def fetch():
        calls.append(clock.now)
        return {"n": len(calls)}

    key = cache.global_key("thing")
    first = await cache.get_or_fetch(key, fetch, ttl=10, stale_ttl=20)
    assert first.state == "miss" and first.value == {"n": 1}

    clock.now += 5
    second = await cache.get_or_fetch(key, fetch, ttl=10, stale_ttl=20)
    assert second.state == "hit" and second.value == {"n": 1}

    clock.now += 10  # 15s old: stale, served immediately, refreshed behind
    third = await cache.get_or_fetch(key, fetch, ttl=10, stale_ttl=20)
    assert third.state == "stale" and third.value == {"n": 1}
    await cache.close()
    assert len(calls) == 2

    clock.now += 1
    fourth = await cache.get_or_fetch(key, fetch, ttl=10, stale_ttl=20)
    assert fourth.state == "hit" and fourth.value == {"n": 2}

    clock.now += 100  # beyond ttl + stale_ttl: fetched inline
    fifth = await cache.get_or_fetch(key, fetch, ttl=10, stale_ttl=20)
    assert fifth.state == "miss" and fifth.value == {"n": 3}


async def test_should_cache_skips_partial_values(cache):
    async def fetch():
        return {"partial": True}

    key = cache.project_key("p1", "alloc")
    result = await cache.get_or_fetch(
        key, fetch, ttl=10, should_cache=lambda v: not v["partial"]
    )
    assert result.state == "miss"
    again = await cache.get_or_fetch(key, fetch, ttl=10)
    assert again.state == "miss"


async def test_refresh_errors_are_swallowed(cache, monkeypatch):
    clock = Clock()
    monkeypatch.setattr(cache_module.time, "time", clock)
    calls = []

    async def fetch():
        calls.append(1)
        if len(calls) > 1:
            raise RuntimeError("upstream down")
        return "ok"

    key = cache.global_key("flaky")
    await cache.get_or_fetch(key, fetch, ttl=1, stale_ttl=100)
    clock.now += 5
    result = await cache.get_or_fetch(key, fetch, ttl=1, stale_ttl=100)
    assert result.state == "stale"
    await cache.close()
    await asyncio.sleep(0)
    assert len(calls) == 2
    # The stale value is still there to serve.
    assert (
        await cache.get_or_fetch(key, fetch, ttl=1, stale_ttl=100)
    ).value == "ok"


async def test_invalidate(cache):
    async def fetch():
        return 1

    key = cache.global_key("x")
    await cache.get_or_fetch(key, fetch, ttl=100)
    await cache.invalidate(key)
    assert (await cache.get_or_fetch(key, fetch, ttl=100)).state == "miss"


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
    await cache._redis.set("k", raw)

    async def fetch():
        return "fresh"

    result = await cache.get_or_fetch("k", fetch, ttl=60)
    assert (result.value, result.state) == ("fresh", "miss")
    again = await cache.get_or_fetch("k", fetch, ttl=60)
    assert again.state == "hit"
