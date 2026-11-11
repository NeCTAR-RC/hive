"""Shared behaviour for every upstream service client.

A client resolves its endpoint from the scoped token's endpoints (or a
configured override for in-cluster URLs), sends the scoped token, pins a
microversion where the service has one, records latency, and maps upstream
failures onto the error envelope. Clients never apply Nectar policy; that
lives in ``hive.nectar``.
"""

import builtins
from collections.abc import AsyncIterable, AsyncIterator, Awaitable, Callable
from contextvars import ContextVar
import re
import time
from typing import Any
from urllib.parse import quote, urlsplit

import httpx
import structlog

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
from hive.observability.request_id import upstream_request_id
from hive.session.model import ScopedToken

log = structlog.get_logger("hive.upstream")

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


DOT_SEGMENTS = frozenset({".", ".."})

# Replaces a project token an upstream refused with a fresh one
# (``SessionContext.rescope``). It is given the refused token, so requests
# refused together share one rescope (``AuthService.ensure_scoped``).
type Refresh = Callable[[ScopedToken], Awaitable[ScopedToken]]
_refresh: ContextVar[Refresh | None] = ContextVar("hive_refresh", default=None)


def bind_refresh(refresh: Refresh | None) -> None:
    """Make ``refresh`` the rescope for every client used in the current
    request (and the background work it starts)."""
    _refresh.set(refresh)


def quote_segment(segment: str | int) -> str:
    """One URL path segment, percent-encoded so it cannot leave its slot.

    Ids reach upstream URLs from the browser (path parameters and body
    fields). Starlette has already decoded them, so ``..``, ``?`` or ``#``
    would otherwise change which upstream path or query is called.
    """
    text = str(segment)
    if not text or text in DOT_SEGMENTS:
        raise BadRequest(f"invalid identifier: {text!r}")
    return quote(text, safe="")


def path(*segments: str | int) -> str:
    """An upstream path built from one argument per segment.

    ``path("servers", server_id, "action")`` gives ``/servers/<id>/action``
    with every segment encoded; never interpolate an id into a path with
    an f-string.
    """
    return "".join("/" + quote_segment(segment) for segment in segments)


def rebase(endpoint: str, link: str) -> str:
    """A pagination link re-based on the client's own endpoint.

    Upstreams name the next page with the URL they believe they live at
    (often the public one), which may differ from the endpoint Hive uses
    (an in-cluster override) or point at another host altogether. Only the
    link's path and query are kept; a leading copy of the endpoint's own
    path is dropped, so the token only ever goes to the endpoint.
    """
    parts = urlsplit(link)
    base_path = urlsplit(endpoint).path.rstrip("/")
    link_path = parts.path
    if base_path and link_path.startswith(base_path + "/"):
        link_path = link_path[len(base_path) :]
    query = f"?{parts.query}" if parts.query else ""
    return endpoint + link_path + query


def unwrap(body: Any, key: str | None, default: Any) -> Any:
    """The resource inside an OpenStack envelope (``{"server": {...}}``).

    ``key=None`` is for APIs without an envelope; a missing body, key or a
    ``null`` value gives ``default``.
    """
    if key is None:
        return body if body is not None else default
    if not isinstance(body, dict):
        return default
    value = body.get(key)
    return value if value is not None else default


def api_wg_next(body: Any, key: str) -> str | None:
    """The next-page link in the API-WG style Nova, Cinder and Neutron use:
    ``{"<key>_links": [{"rel": "next", "href": ...}]}``."""
    if not isinstance(body, dict):
        return None
    for link in body.get(f"{key}_links") or []:
        if link.get("rel") == "next" and link.get("href"):
            return link["href"]
    return None


def endpoints_for(
    catalog: list[dict], interface: str, region: str | None
) -> dict[str, str]:
    """The catalog cut down to what a client needs: one URL per service
    type, on ``interface`` and in ``region`` (an endpoint that names no
    region serves every region). The first match wins, as in
    keystoneauth's endpoint lookup."""
    found: dict[str, str] = {}
    for service in catalog:
        stype = service.get("type")
        if not stype or stype in found:
            continue
        for endpoint in service.get("endpoints") or []:
            if endpoint.get("interface") != interface:
                continue
            ep_region = endpoint.get("region") or endpoint.get("region_id")
            if region and ep_region and ep_region != region:
                continue
            if endpoint.get("url"):
                found[stype] = endpoint["url"]
                break
    return found


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


def _json_or_none(resp: httpx.Response) -> Any:
    """A reply's JSON body, or ``None`` when it has none."""
    return resp.json() if resp.content else None


def _upstream_id(resp: httpx.Response) -> str | None:
    return resp.headers.get("x-openstack-request-id") or resp.headers.get(
        "x-compute-request-id"
    )


def map_upstream_error(
    service: str, resp: httpx.Response, *, ends_session: bool = True
) -> HiveError:
    """The envelope error for a failed upstream reply. A 401 ends the
    session only when the service vouches for the user's token
    (``ends_session``); from anyone else it is that service's failure."""
    message = extract_message(resp)
    rid = _upstream_id(resp)
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
        if ends_session:
            return make(SessionExpired, "upstream rejected the token")
        return make(UpstreamError, f"{service} refused the request")
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
    """Base for one upstream service. Subclasses set ``service_type``.

    ``ends_session_on_401`` says whether this service's 401 means the
    user's token is gone (the OpenStack services, which validate it with
    Keystone) or only that the service itself failed (the home page's
    Nectar widgets, which must not log the user out).
    """

    service_type: str = ""
    service_name: str = ""
    microversion_header: str | None = None
    microversion_prefix: str | None = None
    ends_session_on_401: bool = True

    def __init__(
        self,
        http: httpx.AsyncClient,
        settings: Settings,
        scoped: ScopedToken | None,
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
            endpoints = self.scoped.endpoints if self.scoped else {}
            url = self.settings.endpoint_overrides.get(
                self.service_type
            ) or endpoints.get(self.service_type)
            if not url:
                raise ServiceNotEnabled(
                    f"service '{self.service_type}' is not available",
                    service=self.label,
                )
            self._endpoint = url.rstrip("/")
        return self._endpoint

    def headers(self) -> dict[str, str]:
        hdrs = {
            "Accept": "application/json",
            "X-OpenStack-Request-ID": upstream_request_id(),
        }
        if self.scoped is not None:
            hdrs["X-Auth-Token"] = self.scoped.token.get_secret_value()
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
        json: dict | list | None = None,
        content: bytes | AsyncIterable[bytes] | None = None,
        headers: dict | None = None,
        timeout: float | None = None,
        ok: tuple[int, ...] = OK_STATUSES,
        follow_redirects: bool = False,
    ) -> httpx.Response:
        """Send one request and map a failed reply to its error.

        A 401 from a service that vouches for the token is first answered
        by rescoping once and sending again (``bind_refresh``): a service
        refusing a still-valid token (a keystonemiddleware cache blip)
        then does not end the whole session. A streamed body cannot be
        sent twice, so it is not retried.
        """
        url = path if path.startswith("http") else self.endpoint + path

        async def send() -> httpx.Response:
            return await self._send(
                method,
                url,
                params=params,
                json=json,
                content=content,
                headers=headers,
                timeout=timeout,
                follow_redirects=follow_redirects,
            )

        resp = await send()
        refresh = _refresh.get()
        if (
            resp.status_code == 401
            and 401 not in ok
            and refresh is not None
            and self.scoped is not None
            and self.ends_session_on_401
            and (content is None or isinstance(content, bytes))
        ):
            self.scoped = await refresh(self.scoped)
            resp = await send()
        if resp.status_code not in ok:
            raise self.map_error(resp)
        return resp

    async def _send(
        self,
        method: str,
        url: str,
        *,
        params: dict | None,
        json: dict | list | None,
        content: bytes | AsyncIterable[bytes] | None,
        headers: dict | None,
        timeout: float | None,
        follow_redirects: bool,
    ) -> httpx.Response:
        """One HTTP exchange with the current token; transport failures
        become the error envelope's upstream errors."""
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
        log.debug(
            "upstream call",
            service=self.label,
            method=method,
            path=resp.request.url.path,
            status=resp.status_code,
            duration_ms=round((time.perf_counter() - started) * 1000, 1),
            upstream_request_id=_upstream_id(resp),
        )
        return resp

    def map_error(self, resp: httpx.Response) -> HiveError:
        """The error a failed reply becomes; a client whose service
        speaks differently overrides it."""
        return map_upstream_error(
            self.label, resp, ends_session=self.ends_session_on_401
        )

    async def get_json(self, path: str, **kwargs):
        resp = await self.request("GET", path, **kwargs)
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    async def get(self, path: str, key: str | None = None, **params) -> dict:
        """One resource, unwrapped from its envelope ``key``."""
        body = await self.get_json(path, params=params or None)
        return unwrap(body, key, {})

    async def list(self, path: str, key: str, **params) -> builtins.list:
        """One page of a collection, unwrapped from its envelope ``key``.

        (``builtins.list`` in this class's annotations: the method name
        shadows the type here, and only here.)
        """
        body = await self.get_json(path, params=params or None)
        return unwrap(body, key, [])

    async def create(
        self,
        path: str,
        key: str | None,
        fields: dict | builtins.list,
        *,
        timeout: float | None = None,
    ) -> dict:
        """``POST`` a new resource as ``{key: fields}`` and return the
        created resource (``key=None`` posts and returns the bare body)."""
        body = {key: fields} if key else fields
        resp = await self.request("POST", path, json=body, timeout=timeout)
        return unwrap(_json_or_none(resp), key, {})

    async def update(
        self,
        path: str,
        key: str | None,
        fields: dict | builtins.list,
        method: str = "PUT",
        *,
        timeout: float | None = None,
    ) -> dict:
        """Write ``{key: fields}`` with ``method`` and return the updated
        resource, or ``{}`` when the upstream answers with no body."""
        body = {key: fields} if key else fields
        resp = await self.request(method, path, json=body, timeout=timeout)
        return unwrap(_json_or_none(resp), key, {})

    async def delete(
        self,
        path: str,
        *,
        ok: tuple[int, ...] = OK_STATUSES,
        params: dict | None = None,
    ) -> None:
        """``DELETE`` a resource; ``ok`` lists the statuses that count as
        done."""
        await self.request("DELETE", path, params=params, ok=ok)

    async def action(
        self,
        path: str,
        body: dict | None,
        *,
        timeout: float | None = None,
    ) -> Any:
        """``POST`` an action body as is and return the reply, ``{}`` when
        there is none."""
        resp = await self.request("POST", path, json=body, timeout=timeout)
        reply = _json_or_none(resp)
        return {} if reply is None else reply

    def next_link(self, body: Any, key: str) -> str | None:
        """Where the page after ``body`` is. The default reads the API-WG
        ``<key>_links``; a client whose API links pages differently
        overrides this."""
        return api_wg_next(body, key)

    async def paginate[Cursor, Page](
        self,
        fetch_page: Callable[[Cursor | None], Awaitable[Page]],
        next_of: Callable[[Page], Cursor | None],
    ) -> AsyncIterator[Page]:
        """Every page of a list, the first fetched with cursor ``None``.

        ``next_of`` reads the next cursor (a link, a marker, an offset)
        from a page and answers ``None`` on the last one. The walk stops
        at ``settings.upstream_max_pages`` with a warning, so a runaway
        list costs a bounded number of calls and is never silent.
        """
        cursor: Cursor | None = None
        for _ in range(self.settings.upstream_max_pages):
            page = await fetch_page(cursor)
            yield page
            cursor = next_of(page)
            if cursor is None:
                return
        log.warning(
            "pagination cap reached",
            service=self.label,
            pages=self.settings.upstream_max_pages,
        )

    async def list_all(
        self, path: str, key: str, *, timeout: float | None = None, **params
    ) -> builtins.list:
        """Every item of a collection, following next-page links.

        Links are re-based on this client's endpoint (``rebase``). An
        upstream that answers a bare JSON list is read as a single page.
        """

        async def fetch(link: str | None) -> Any:
            if link is None:
                return await self.get_json(
                    path, params=params or None, timeout=timeout
                )
            return await self.get_json(
                rebase(self.endpoint, link), timeout=timeout
            )

        items: builtins.list = []
        async for body in self.paginate(
            fetch, lambda body: self.next_link(body, key)
        ):
            items.extend(
                body if isinstance(body, list) else unwrap(body, key, [])
            )
        return items

    async def list_by_offset(
        self,
        fetch: Callable[[int], Awaitable[builtins.list]],
        page_size: int,
    ) -> builtins.list:
        """Every item of a list paged by offset: ``fetch(offset)`` gives
        one page, and a short page is the last."""

        async def fetch_page(offset: int | None) -> tuple[int, builtins.list]:
            start = offset or 0
            return start, await fetch(start)

        def next_offset(page: tuple[int, builtins.list]) -> int | None:
            start, items = page
            return start + len(items) if len(items) >= page_size else None

        items: builtins.list = []
        async for _start, page_items in self.paginate(fetch_page, next_offset):
            items.extend(page_items)
        return items

    def _observe(self, method: str, status: str, started: float) -> None:
        metrics.upstream_request_seconds.labels(
            self.label, method, status
        ).observe(time.perf_counter() - started)
