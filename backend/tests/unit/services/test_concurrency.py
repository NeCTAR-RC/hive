import asyncio

from hive.services.concurrency import bounded_gather


async def test_bounded_gather_keeps_order_and_limit():
    running = 0
    peak = 0

    async def work(n: int) -> int:
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.001 * (5 - n % 5))
        running -= 1
        return n * 2

    assert await bounded_gather(range(10), work, 3) == [
        n * 2 for n in range(10)
    ]
    assert peak == 3
