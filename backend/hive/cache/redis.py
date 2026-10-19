"""Redis-backed JSON cache with stale-while-revalidate.

An entry is ``{value, fetched_at, ttl, stale_ttl}``. Within ``ttl`` it is
fresh and returned as-is; within ``ttl + stale_ttl`` it is returned at once
and refreshed in the background under a single-flight lock; after that it
is fetched inline. Every result reports which path it took so responses
can carry ``X-Hive-Cache`` and ``fetched_at`` for the SPA's "updated n
seconds ago".
"""

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
import json
import time
from typing import Any

from redis.asyncio import Redis
import structlog

from hive.observability import metrics

log = structlog.get_logger("hive.cache")

Fetch = Callable[[], Awaitable[Any]]

LOCK_MS = 30_000


def _parse(raw: str) -> tuple[Any, float, float, float] | None:
    """``(value, fetched_at, ttl, stale_ttl)``, or None for an entry that is
    not valid JSON or lacks a numeric field (a schema change or a manual
    edit), which is then treated as a miss and overwritten."""
    try:
        entry = json.loads(raw)
        return (
            entry["value"],
            float(entry["fetched_at"]),
            float(entry["ttl"]),
            float(entry["stale_ttl"]),
        )
    except (KeyError, TypeError, ValueError):
        return None


@dataclass
class CacheResult:
    value: Any
    state: str  # hit | stale | miss
    fetched_at: float


class Cache:
    def __init__(self, redis: Redis, prefix: str = "hive:c"):
        self._redis = redis
        self._prefix = prefix
        self._tasks: set[asyncio.Task] = set()

    # --- key helpers --------------------------------------------------------

    def global_key(self, name: str, *parts: str) -> str:
        return ":".join([self._prefix, "g", name, *parts])

    def project_key(self, project_id: str, name: str, *parts: str) -> str:
        return ":".join([self._prefix, "p", project_id, name, *parts])

    # --- reads --------------------------------------------------------------

    async def get_or_fetch(
        self,
        key: str,
        fetch: Fetch,
        *,
        ttl: float,
        stale_ttl: float = 0,
        name: str | None = None,
        should_cache: Callable[[Any], bool] | None = None,
    ) -> CacheResult:
        """Return the cached value for ``key`` or fetch and store it.

        ``should_cache`` lets a fetcher return a value (for example a
        partial result) without it being stored.
        """
        name = name or key
        raw = await self._redis.get(key)
        now = time.time()
        if raw:
            entry = _parse(raw)
            if entry is not None:
                value, fetched_at, fresh, stale = entry
                age = now - fetched_at
                if age < fresh:
                    metrics.cache_events.labels(name, "hit").inc()
                    return CacheResult(value, "hit", fetched_at)
                if age < fresh + stale:
                    metrics.cache_events.labels(name, "stale").inc()
                    self._schedule_refresh(key, fetch, ttl, stale_ttl, name)
                    return CacheResult(value, "stale", fetched_at)
        metrics.cache_events.labels(name, "miss").inc()
        value = await fetch()
        if should_cache is None or should_cache(value):
            await self._store(key, value, ttl, stale_ttl, now)
        return CacheResult(value, "miss", now)

    async def invalidate(self, *keys: str) -> None:
        if keys:
            await self._redis.delete(*keys)

    # --- plain JSON values (no stale-while-revalidate) ----------------------

    async def get_json(self, key: str) -> Any | None:
        """A value stored with ``set_json``, or None when absent or not
        valid JSON (a schema change or a manual edit)."""
        raw = await self._redis.get(key)
        if not raw:
            return None
        try:
            return json.loads(raw)
        except ValueError:
            return None

    async def set_json(self, key: str, value: Any, *, ttl: float) -> None:
        """Store ``value`` as JSON for ``ttl`` seconds, for state that is
        not a cached upstream answer (a background chain's progress)."""
        await self._redis.set(key, json.dumps(value), ex=max(1, int(ttl)))

    async def close(self) -> None:
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

    # --- internals ----------------------------------------------------------

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
        lock = f"{key}:lock"
        if not await self._redis.set(lock, "1", nx=True, px=LOCK_MS):
            return
        try:
            value = await fetch()
            await self._store(key, value, ttl, stale_ttl, time.time())
            metrics.cache_events.labels(name, "refresh").inc()
        except Exception as exc:
            metrics.cache_events.labels(name, "refresh_error").inc()
            log.warning("cache refresh failed", key=key, error=str(exc))
        finally:
            await self._redis.delete(lock)
