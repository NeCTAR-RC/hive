"""Prometheus metrics (default registry, one uvicorn worker per pod)."""

from prometheus_client import Counter, Histogram

http_requests = Counter(
    "hive_http_requests_total",
    "HTTP requests handled",
    ["route", "method", "status"],
)
http_request_seconds = Histogram(
    "hive_http_request_seconds",
    "HTTP request latency",
    ["route", "method"],
)
upstream_request_seconds = Histogram(
    "hive_upstream_request_seconds",
    "Upstream service call latency",
    ["service", "method", "status"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 40, 60),
)
cache_events = Counter(
    "hive_cache_events_total",
    "Cache lookups by outcome",
    ["name", "result"],
)
logins = Counter("hive_logins_total", "Login attempts", ["result"])
sessions_created = Counter("hive_sessions_created_total", "Sessions created")
