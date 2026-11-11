"""How a router answers with a cached value or a file."""

from collections.abc import AsyncIterator, Awaitable, Callable

from fastapi import Response
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

from hive.cache.redis import CacheResult
from hive.schemas.responses import Cached
from hive.services.download import content_disposition, Download


def cached[M: Cached](
    response: Response, result: CacheResult, model: type[M]
) -> M:
    """The cached payload as ``model``, with ``fetched_at`` for the SPA's
    "updated n seconds ago" and ``X-Hive-Cache`` saying how the cache
    answered. The cache holds the shaped payload as plain JSON, so this is
    where it meets its model."""
    response.headers["X-Hive-Cache"] = result.state
    return model.model_validate(
        {**result.value, "fetched_at": result.fetched_at}
    )


def attachment(download: Download) -> Response:
    """A ``Download`` as a file the browser saves, named by RFC 6266
    ``filename*`` with an ASCII fallback. A streamed body closes its
    source however the stream ends: when the body is read to the end, and
    in the background task when the client aborts before that (the body
    iterator may then never resume)."""
    headers = {"Content-Disposition": content_disposition(download.filename)}
    if download.length is not None:
        headers["Content-Length"] = str(download.length)
    if isinstance(download.body, str | bytes):
        return Response(
            download.body, media_type=download.media_type, headers=headers
        )
    close = download.close
    return StreamingResponse(
        _relay(download.body, close),
        media_type=download.media_type,
        headers=headers,
        background=BackgroundTask(close) if close else None,
    )


async def _relay(
    body: AsyncIterator[bytes], close: Callable[[], Awaitable[None]] | None
) -> AsyncIterator[bytes]:
    try:
        async for chunk in body:
            yield chunk
    finally:
        if close:
            await close()
