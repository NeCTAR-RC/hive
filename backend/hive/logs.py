"""Structured logging (structlog) with per-request context."""

import logging
import sys

import structlog


def configure_logging(log_format: str = "json", level: str = "INFO") -> None:
    numeric = logging.getLevelNamesMapping().get(level.upper(), logging.INFO)
    shared = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    if log_format == "console":
        renderer = structlog.dev.ConsoleRenderer()
    else:
        renderer = structlog.processors.JSONRenderer()
    structlog.configure(
        processors=[*shared, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(numeric),
        logger_factory=structlog.PrintLoggerFactory(sys.stdout),
        cache_logger_on_first_use=False,
    )
    logging.basicConfig(
        level=numeric, stream=sys.stdout, format="%(message)s", force=True
    )
    # The request middleware writes one line per request instead, and
    # upstream calls are logged by the client layer at debug.
    logging.getLogger("uvicorn.access").disabled = True
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def get_logger(name: str):
    return structlog.get_logger(name)
