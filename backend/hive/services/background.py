"""Work a request starts but does not wait for (the load balancer
wizard's chained creates). The app owns the registry: at shutdown every
task still running is cancelled and awaited, so each can record that it
did not finish instead of being dropped silently."""

import asyncio
from collections.abc import Coroutine
from typing import Any


class BackgroundWork:
    def __init__(self) -> None:
        self._tasks: set[asyncio.Task] = set()

    def spawn(self, work: Coroutine[Any, Any, None]) -> asyncio.Task:
        task = asyncio.create_task(work)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    @property
    def running(self) -> int:
        return len(self._tasks)

    async def shutdown(self) -> None:
        """Cancel what is still running and wait for each task to settle."""
        tasks = list(self._tasks)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
