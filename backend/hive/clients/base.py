"""Shared behaviour for every upstream service client.

A client resolves its endpoint from the session's scoped catalog (or a
configured override for in-cluster URLs), sends the scoped token, pins a
microversion where the service has one, records latency, and maps upstream
failures onto the error envelope. Clients never apply Nectar policy; that
lives in ``hive.nectar``.
"""

from collections.abc import AsyncIterable
import re
import time
import uuid

import httpx

from hive.config import Settings
from hive.errors import (
    BadRequest,
    Conflict,
    Forbidden,
    HiveError,
    NotFound,
    QuotaExceeded,
    RateLimited,
    ServiceNotEnabled,
    SessionExpired,
    UpstreamError,
    UpstreamTimeout,
    UpstreamUnreachable,
)
from hive.observability import metrics
from hive.session.model import ScopedToken

OK_STATUSES = (200, 201, 202, 203, 204)
# A 413 whose message reads like one of these is a quota, not a rate limit.
QUOTA_WORDS = re.compile(r"quota|exceed|limit", re.IGNORECASE)

# Keys OpenStack services wrap their error messages in.
WRAPPED_ERROR_KEYS = (
    "badRequest",
    "itemNotFound",
    "forbidden",
    "unauthorized",
    "conflictingRequest",
    "overLimit",
    "NeutronError",
    "computeFault",
    "error",
)
FLAT_MESSAGE_KEYS = (
    "message",
    "detail",
    "error_message",
    "description",
    "faultstring",
)


def catalog_endpoint(
    catalog: list[dict],
    service_type: str,
    interface: str = "public",
    region: str | None = None,
) -> str | None:
    for service in catalog:
        if service.get("type") != service_type:
            continue
        for endpoint in service.get("endpoints", []):
            if endpoint.get("interface") != interface:
                continue
            ep_region = endpoint.get("region") or endpoint.get("region_id")
            if region and ep_region and ep_region != region:
                continue
            return endpoint.get("url")
    return None


def extract_message(resp: httpx.Response) -> str:
    try:
        body = resp.json()
    except ValueError:
        return (resp.text or "")[:300]
    if isinstance(body, dict):
        for key in WRAPPED_ERROR_KEYS:
            inner = body.get(key)
            if isinstance(inner, dict) and inner.get("message"):
                return str(inner["message"])
            if isinstance(inner, str) and inner:
                return inner
        for key in FLAT_MESSAGE_KEYS:
            if isinstance(body.get(key), str) and body[key]:
                return body[key]
    elif isinstance(body, str):
        return body[:300]
    return (resp.text or "")[:300]


def map_upstream_error(service: str, resp: httpx.Response) -> HiveError:
    message = extract_message(resp)
    rid = resp.headers.get("x-openstack-request-id") or resp.headers.get(
        "x-compute-request-id"
    )
    status = resp.status_code

    def make(cls: type[HiveError], default: str, **extra) -> HiveError:
        return cls(
            message or default,
            service=service,
            upstream_status=status,
            upstream_request_id=rid,
            **extra,
        )

    if status == 401:
        return make(SessionExpired, "upstream rejected the token")
    if status == 403:
        return make(Forbidden, "forbidden")
    if status == 404:
        return make(NotFound, "not found")
    if status in (400, 422):
        return make(BadRequest, "bad request")
    if status == 409:
        return make(Conflict, "conflict")
    if status == 413 and QUOTA_WORDS.search(message):
        # Cinder and Nova answer 413 ("overLimit") for an exceeded quota,
        # such as "SnapshotLimitExceeded: Maximum number of snapshots
        # allowed (0) exceeded"; it is the user's limit, not a rate limit.
        return make(QuotaExceeded, "quota exceeded")
    if status in (413, 429):
        headers = {}
        if resp.headers.get("retry-after"):
            headers["Retry-After"] = resp.headers["retry-after"]
        return make(RateLimited, "rate limited", headers=headers)
    return make(UpstreamError, f"{service} returned {status}")


class ServiceClient:
    """Base for one upstream service. Subclasses set ``service_type``."""

    service_type: str = ""
    service_name: str = ""
    microversion_header: str | None = None
    microversion_prefix: str | None = None

    def __init__(
        self,
        http: httpx.AsyncClient,
        settings: Settings,
        scoped: ScopedToken,
        *,
        microversion: str | None = None,
    ):
        self._http = http
        self.settings = settings
        self.scoped = scoped
        self.microversion = microversion
        self._endpoint: str | None = None

    @property
    def label(self) -> str:
        return self.service_name or self.service_type

    @property
    def endpoint(self) -> str:
        if self._endpoint is None:
            override = self.settings.endpoint_overrides.get(self.service_type)
            url = override or catalog_endpoint(
                self.scoped.catalog,
                self.service_type,
                self.settings.endpoint_interface,
                self.settings.region,
            )
            if not url:
                raise ServiceNotEnabled(
                    f"service '{self.service_type}' is not available",
                    service=self.label,
                )
            self._endpoint = url.rstrip("/")
        return self._endpoint

    def headers(self) -> dict[str, str]:
        hdrs = {
            "X-Auth-Token": self.scoped.token,
            "Accept": "application/json",
            "X-OpenStack-Request-ID": f"req-{uuid.uuid4()}",
        }
        if self.microversion and self.microversion_header:
            value = self.microversion
            if self.microversion_prefix:
                value = f"{self.microversion_prefix} {value}"
            hdrs[self.microversion_header] = value
        return hdrs

    async def request(
        self,
        method: str,
        path: str,
        *,
        params: dict | None = None,
        json: dict | None = None,
        content: bytes | AsyncIterable[bytes] | None = None,
        headers: dict | None = None,
        timeout: float | None = None,
        ok: tuple[int, ...] = OK_STATUSES,
        follow_redirects: bool = False,
    ) -> httpx.Response:
        url = path if path.startswith("http") else self.endpoint + path
        hdrs = self.headers()
        if headers:
            hdrs.update(headers)
        limits = httpx.Timeout(
            timeout or self.settings.upstream_read_timeout,
            connect=self.settings.upstream_connect_timeout,
        )
        started = time.perf_counter()
        try:
            resp = await self._http.request(
                method,
                url,
                params=params,
                json=json,
                content=content,
                headers=hdrs,
                timeout=limits,
                follow_redirects=follow_redirects,
            )
        except httpx.TimeoutException as exc:
            self._observe(method, "timeout", started)
            raise UpstreamTimeout(
                f"{self.label} timed out", service=self.label
            ) from exc
        except httpx.ConnectError as exc:
            self._observe(method, "unreachable", started)
            raise UpstreamUnreachable(
                f"{self.label} unreachable", service=self.label
            ) from exc
        except httpx.HTTPError as exc:
            self._observe(method, "error", started)
            raise UpstreamError(
                f"{self.label} request failed: {exc}", service=self.label
            ) from exc
        self._observe(method, str(resp.status_code), started)
        if resp.status_code not in ok:
            raise map_upstream_error(self.label, resp)
        return resp

    async def get_json(self, path: str, **kwargs):
        resp = await self.request("GET", path, **kwargs)
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    def _observe(self, method: str, status: str, started: float) -> None:
        metrics.upstream_request_seconds.labels(
            self.label, method, status
        ).observe(time.perf_counter() - started)
