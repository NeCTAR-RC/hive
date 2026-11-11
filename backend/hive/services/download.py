"""A file the browser saves rather than reads: the routers send it as an
attachment (``hive.api.replies.attachment``)."""

from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
import re
from urllib.parse import quote

# Characters dropped from the plain ``filename=`` fallback of a
# Content-Disposition header: quoting, parameter separators, line breaks
# and anything outside printable ASCII.
UNSAFE_FILENAME = re.compile(r'["\\;,\r\n]|[^\x20-\x7e]')


@dataclass(frozen=True)
class Download:
    """``body`` is the whole file, or an async stream of it (then
    ``length``, when known, becomes the Content-Length). ``close``
    releases what the stream reads from (an upstream response); it runs
    however the stream ends, a client abort included."""

    filename: str
    media_type: str
    body: str | bytes | AsyncIterator[bytes]
    length: int | None = None
    close: Callable[[], Awaitable[None]] | None = None


def safe_filename(name: str, fallback: str = "download") -> str:
    """A name that fits a quoted Content-Disposition filename: letters,
    digits and ``-_.`` kept, anything else replaced with ``_``."""
    cleaned = "".join(c if c.isalnum() or c in "-_." else "_" for c in name)
    return cleaned or fallback


def content_disposition(filename: str) -> str:
    """``attachment`` with an ASCII ``filename=`` fallback and the exact
    name as RFC 6266 ``filename*=UTF-8''...``, so any name survives the
    latin-1 header encoding."""
    fallback = UNSAFE_FILENAME.sub("_", filename).strip() or "download"
    return (
        f'attachment; filename="{fallback}";'
        f" filename*=UTF-8''{quote(filename, safe='')}"
    )
