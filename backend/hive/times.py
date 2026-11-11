"""Time helpers shared by every layer: one clock (UTC) and one wire format.

OpenStack services send timestamps without a zone (``2026-10-01T00:00:00``
or ``2026-10-01 00:00:00.123456``), which by convention are UTC; a browser
parses such a value as local time, ten or eleven hours off in Australia.
Every timestamp that reaches the SPA therefore goes through
``to_utc_iso`` and leaves as ISO 8601 with a ``Z``.
"""

import contextlib
from datetime import date, datetime, UTC
from email.utils import parsedate_to_datetime

# ``YYYY-MM-DD``: a calendar date, not a moment, so it is left alone.
DATE_ONLY_LENGTH = 10


def now_utc() -> datetime:
    """The current moment in UTC: the one clock, so tests can freeze it."""
    return datetime.now(UTC)


def today_utc() -> date:
    """Today's date in UTC, the same on a developer machine as in the pod."""
    return now_utc().date()


def _parse(value: str) -> datetime | None:
    with contextlib.suppress(ValueError):
        return datetime.fromisoformat(value)
    try:
        # HTTP dates, such as Swift's Last-Modified header.
        return parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None


def to_utc_iso(value: str | None) -> str | None:
    """Render an upstream timestamp as ISO 8601 UTC ending in ``Z``.

    A value without a zone is taken as UTC. Sub-second precision is kept
    to milliseconds, the most a browser ``Date`` holds. Dates without a
    time, values that do not parse and non-strings (``None``) come back
    unchanged, so a surprising upstream value is shown rather than lost.
    """
    if not isinstance(value, str) or len(value) <= DATE_ONLY_LENGTH:
        return value
    parsed = _parse(value.strip())
    if parsed is None:
        return value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    parsed = parsed.astimezone(UTC)
    spec = "milliseconds" if parsed.microsecond else "seconds"
    return parsed.replace(tzinfo=None).isoformat(timespec=spec) + "Z"
