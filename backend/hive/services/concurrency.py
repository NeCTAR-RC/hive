"""Bounded fan-out: many upstream calls in parallel, never too many."""

import asyncio
from collections.abc import Awaitable, Callable, Iterable


async def bounded_gather[T, R](
    items: Iterable[T], call: Callable[[T], Awaitable[R]], limit: int
) -> list[R]:
    """``call(item)`` for every item, at most ``limit`` at a time.

    Results come back in the order of ``items``; the first exception
    propagates, as with ``asyncio.gather``. ``limit`` is normally
    ``HIVE_UPSTREAM_FAN_OUT`` so one page cannot flood an upstream.
    """
    semaphore = asyncio.Semaphore(limit)

    async def bounded(item: T) -> R:
        async with semaphore:
            return await call(item)

    return list(await asyncio.gather(*(bounded(item) for item in items)))
