"""Redis-backed JSON cache with stale-while-revalidate.

An entry is ``{value, fetched_at, ttl, stale_ttl}``. Within ``ttl`` it is
fresh and returned as-is; within ``ttl + stale_ttl`` it is returned at once
and refreshed in the background under a single-flight lock; after that it
is fetched inline, again under the lock, so parallel requests for a cold
key cost one upstream call. Every result reports which path it took so
responses can carry ``X-Hive-Cache`` and ``fetched_at`` for the SPA's
"updated n seconds ago".

Every key is built from a ``Policy`` (``hive.cache.policy``), which also
sets the lifetimes and whether an entry is shared by everyone or kept per
project; nothing outside this module builds a key by hand.
"""

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
import json
import secrets
import time
from typing import Any

from redis.asyncio import Redis
import structlog

from hive.cache.policy import Policy
from hive.observability import metrics

log = structlog.get_logger("hive.cache")

Fetch = Callable[[], Awaitable[Any]]

LOCK_MS = 30_000
# How often a request that lost the race for a cold key checks whether the
# winner has stored the value.
MISS_POLL_SECONDS = 0.05

# Delete the lock only if it still holds our token: a fetch slower than
# LOCK_MS must not release a lock another worker has taken since.
RELEASE_LOCK = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
end
return 0
"""


@dataclass(frozen=True)
class Entry:
    """A stored cache entry: the value and the lifetimes it was kept for."""

    value: Any
    fetched_at: float
    ttl: float
    stale_ttl: float


def _parse(raw: str | bytes) -> Entry | None:
    """The entry in ``raw``, or None when it is not valid JSON or lacks a
    numeric field (a schema change or a manual edit): that is a miss, and
    the next fetch overwrites it."""
    try:
        entry = json.loads(raw)
        return Entry(
            value=entry["value"],
            fetched_at=float(entry["fetched_at"]),
            ttl=float(entry["ttl"]),
            stale_ttl=float(entry["stale_ttl"]),
        )
    except (KeyError, TypeError, ValueError):
        return None


@dataclass(frozen=True)
class CacheResult:
    """A value and how the cache answered: ``hit``, ``stale``, ``miss``,
    or ``bypass`` when the value did not go through the cache at all
    (then ``fetched_at`` is ``None``)."""

    value: Any
    state: str
    fetched_at: float | None

    @classmethod
    def bypass(cls, value: Any) -> "CacheResult":
        return cls(value, "bypass", None)


class Cache:
    def __init__(self, redis: Redis, prefix: str = "hive:c"):
        self._redis = redis
        self._prefix = prefix
        self._tasks: set[asyncio.Task] = set()

    def key(
        self, policy: Policy, *parts: str, project_id: str | None = None
    ) -> str:
        """The Redis key for ``policy`` and ``parts``.

        A project-scoped policy needs the project and puts it in the key;
        a global one refuses it, so an entry is never shared more widely
        (or more narrowly) than its policy says.
        """
        if policy.scope == "project":
            if not project_id:
                raise ValueError(f"{policy.name} is cached per project")
            return ":".join(
                [self._prefix, "p", project_id, policy.name, *parts]
            )
        if project_id is not None:
            raise ValueError(f"{policy.name} is cached globally")
        return ":".join([self._prefix, "g", policy.name, *parts])

    async def get_or_fetch(
        self,
        policy: Policy,
        fetch: Fetch,
        *parts: str,
        project_id: str | None = None,
        should_cache: Callable[[Any], bool] | None = None,
    ) -> CacheResult:
        """Return the cached value for ``policy`` and ``parts``, or fetch
        and store it.

        ``should_cache`` lets a fetcher return a value (for example a
        partial result) without it being stored.
        """
        key = self.key(policy, *parts, project_id=project_id)
        name = policy.name
        ttl, stale_ttl = policy.ttl, policy.stale
        entry = await self._read(key)
        now = time.time()
        if entry is not None:
            age = now - entry.fetched_at
            if age < entry.ttl:
                metrics.cache_events.labels(name, "hit").inc()
                return CacheResult(entry.value, "hit", entry.fetched_at)
            if age < entry.ttl + entry.stale_ttl:
                metrics.cache_events.labels(name, "stale").inc()
                self._schedule_refresh(key, fetch, ttl, stale_ttl, name)
                return CacheResult(entry.value, "stale", entry.fetched_at)
        metrics.cache_events.labels(name, "miss").inc()
        token = await self._acquire(key)
        if token is None:
            stored = await self._await_winner(key)
            if stored is not None:
                return CacheResult(stored.value, "hit", stored.fetched_at)
        try:
            value = await fetch()
            if should_cache is None or should_cache(value):
                await self._store(key, value, ttl, stale_ttl, now)
        finally:
            if token is not None:
                await self._release(key, token)
        return CacheResult(value, "miss", now)

    async def invalidate(
        self, policy: Policy, *parts: str, project_id: str | None = None
    ) -> None:
        await self._redis.delete(
            self.key(policy, *parts, project_id=project_id)
        )

    async def set_json(
        self,
        policy: Policy,
        value: Any,
        *parts: str,
        project_id: str | None = None,
    ) -> None:
        """Keep a value (not a cached fetch) for the policy's lifetime."""
        key = self.key(policy, *parts, project_id=project_id)
        await self._redis.set(
            key, json.dumps(value), ex=policy.ttl + policy.stale
        )

    async def get_json(
        self, policy: Policy, *parts: str, project_id: str | None = None
    ) -> Any:
        """A value kept with ``set_json``, or ``None`` once it expired or
        when it is not valid JSON (a schema change or a manual edit)."""
        key = self.key(policy, *parts, project_id=project_id)
        raw = await self._redis.get(key)
        if not raw:
            return None
        try:
            return json.loads(raw)
        except ValueError:
            return None

    async def close(self) -> None:
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

    async def _read(self, key: str) -> Entry | None:
        raw = await self._redis.get(key)
        return _parse(raw) if raw else None

    async def _store(
        self, key: str, value: Any, ttl: float, stale_ttl: float, at: float
    ) -> None:
        entry = {
            "value": value,
            "fetched_at": at,
            "ttl": ttl,
            "stale_ttl": stale_ttl,
        }
        await self._redis.set(
            key, json.dumps(entry), ex=int(ttl + stale_ttl) + 1
        )

    async def _acquire(self, key: str) -> str | None:
        """Take the fetch lock for ``key``; the token proves ownership."""
        token = secrets.token_hex(16)
        taken = await self._redis.set(
            f"{key}:lock", token, nx=True, px=LOCK_MS
        )
        return token if taken else None

    async def _release(self, key: str, token: str) -> None:
        await self._redis.eval(RELEASE_LOCK, 1, f"{key}:lock", token)

    async def _await_winner(self, key: str) -> Entry | None:
        """Wait while another request fetches ``key``.

        Returns the entry it stored, or ``None`` once its lock is gone
        without a value (it failed, or chose not to cache), in which case
        the caller fetches for itself. The lock's expiry bounds the wait.
        """
        lock = f"{key}:lock"
        while True:
            entry = await self._read(key)
            if (
                entry is not None
                and time.time() - entry.fetched_at < entry.ttl
            ):
                return entry
            if not await self._redis.exists(lock):
                return None
            await asyncio.sleep(MISS_POLL_SECONDS)

    def _schedule_refresh(
        self, key: str, fetch: Fetch, ttl: float, stale_ttl: float, name: str
    ) -> None:
        task = asyncio.create_task(
            self._refresh(key, fetch, ttl, stale_ttl, name)
        )
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _refresh(
        self, key: str, fetch: Fetch, ttl: float, stale_ttl: float, name: str
    ) -> None:
        token = await self._acquire(key)
        if token is None:
            return
        try:
            value = await fetch()
            await self._store(key, value, ttl, stale_ttl, time.time())
            metrics.cache_events.labels(name, "refresh").inc()
        # A background refresh has no caller to raise to: whatever fails
        # (an upstream error or a bug) is logged and the stale value stays.
        except Exception as exc:  # noqa: BLE001
            metrics.cache_events.labels(name, "refresh_error").inc()
            log.warning("cache refresh failed", key=key, error=str(exc))
        finally:
            await self._release(key, token)
