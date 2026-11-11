"""The client base: how ids become upstream paths, and which request id
travels upstream."""

from datetime import datetime, UTC
import json

import httpx
from pydantic import SecretStr
import pytest
import respx
import structlog

from hive.clients.base import (
    api_wg_next,
    bind_refresh,
    endpoints_for,
    extract_message,
    map_upstream_error,
    path,
    quote_segment,
    rebase,
    ServiceClient,
    unwrap,
)
from hive.clients.swift import object_path
from hive.clients.trove import TroveClient
from hive.config import Settings
from hive.errors import BadRequest, HiveError, SessionExpired
from hive.observability.request_id import (
    bind_global_request_id,
    reset_global_request_id,
    upstream_request_id,
)
from hive.session.model import ProjectRef, ScopedToken


def test_path_encodes_each_segment():
    assert path("servers", "abc", "action") == "/servers/abc/action"
    assert path("os-keypairs", "a?b") == "/os-keypairs/a%3Fb"
    assert path("os-keypairs", "a#b/c") == "/os-keypairs/a%23b%2Fc"
    assert path("quotas", 42) == "/quotas/42"
    assert path() == ""


@pytest.mark.parametrize("segment", ["", ".", ".."])
def test_path_refuses_segments_that_move_the_path(segment):
    with pytest.raises(BadRequest):
        path("servers", segment)


def test_encoded_dots_stay_inside_their_segment():
    url = httpx.URL("https://nova.test/v2.1" + path("servers", "..%2F"))
    assert url.raw_path == b"/v2.1/servers/..%252F"


def test_quote_segment_keeps_unreserved_characters():
    assert quote_segment("web-1_a.b~c") == "web-1_a.b~c"


def test_object_path_keeps_folders_and_refuses_dot_parts():
    assert object_path("c", "dir/a b?.txt") == "/c/dir/a%20b%3F.txt"
    for name in ("", "a/../b", "./a", "a/."):
        with pytest.raises(BadRequest):
            object_path("c", name)
    with pytest.raises(BadRequest):
        object_path("..", "a")


def test_trove_user_path_matches_troveclient():
    built = TroveClient._user_path("db-1", "bob@10.0.0.5", "databases")
    assert built == "/instances/db-1/users/bob%4010%2e0%2e0%2e5/databases"
    with pytest.raises(BadRequest):
        TroveClient._user_path("db-1", "..")


def test_upstream_request_id_follows_the_request():
    token = bind_global_request_id("req-11111111-2222-3333-4444-555555555555")
    try:
        assert upstream_request_id() == (
            "req-11111111-2222-3333-4444-555555555555"
        )
    finally:
        reset_global_request_id(token)
    outside = upstream_request_id()
    assert outside.startswith('req-')
    assert outside != 'req-11111111-2222-3333-4444-555555555555'


ENDPOINT = "https://cinder.internal/v3/p1"


def make_client(http, **overrides) -> ServiceClient:
    settings = Settings(
        _env_file=None,  # pyright: ignore[reportCallIssue]
        secret_key="x" * 32,
        endpoint_overrides={"volumev3": ENDPOINT},
        **overrides,
    )
    scoped = ScopedToken(
        token=SecretStr("t"),
        expires_at=datetime.now(UTC),
        project=ProjectRef(id="p1", name="p1"),
    )
    client = ServiceClient(http, settings, scoped)
    client.service_type = "volumev3"
    return client


@pytest.mark.parametrize(
    ("link", "expected"),
    [
        (
            "https://cinder.public/v3/p1/volumes/detail?marker=v9",
            ENDPOINT + "/volumes/detail?marker=v9",
        ),
        (
            "https://evil.example/elsewhere?x=1",
            ENDPOINT + "/elsewhere?x=1",
        ),
        ("/v2/images?marker=i9", ENDPOINT + "/v2/images?marker=i9"),
        ("https://cinder.public/v3/p1x/a", ENDPOINT + "/v3/p1x/a"),
    ],
)
def test_rebase_keeps_only_path_and_query(link, expected):
    assert rebase(ENDPOINT, link) == expected


@pytest.mark.parametrize(
    ("body", "key", "expected"),
    [
        ({"server": {"id": "s1"}}, "server", {"id": "s1"}),
        ({"server": None}, "server", {}),
        ({}, "server", {}),
        (None, "server", {}),
        (["not", "a", "dict"], "server", {}),
        ({"id": "z1"}, None, {"id": "z1"}),
        (None, None, {}),
    ],
)
def test_unwrap(body, key, expected):
    assert unwrap(body, key, {}) == expected


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        (
            {"volumes_links": [{"rel": "next", "href": "https://c/n"}]},
            "https://c/n",
        ),
        ({"volumes_links": [{"rel": "self", "href": "https://c/s"}]}, None),
        ({"volumes": []}, None),
        ([], None),
    ],
)
def test_api_wg_next(body, expected):
    assert api_wg_next(body, "volumes") == expected


async def test_list_all_follows_links_on_the_endpoint():
    pages = {
        None: {
            "volumes": [{"id": "v1"}],
            "volumes_links": [
                {
                    "rel": "next",
                    "href": "https://cinder.public/v3/p1/volumes/detail"
                    "?a=1&marker=v1",
                }
            ],
        },
        "v1": {"volumes": [{"id": "v2"}]},
    }

    def answer(request: httpx.Request) -> httpx.Response:
        marker = request.url.params.get("marker")
        return httpx.Response(200, json=pages[marker])

    with respx.mock() as upstream:
        route = upstream.get(f"{ENDPOINT}/volumes/detail").mock(
            side_effect=answer
        )
        async with httpx.AsyncClient() as http:
            client = make_client(http)
            items = await client.list_all("/volumes/detail", "volumes", a="1")
    assert [v["id"] for v in items] == ["v1", "v2"]
    assert [str(call.request.url) for call in route.calls] == [
        f"{ENDPOINT}/volumes/detail?a=1",
        f"{ENDPOINT}/volumes/detail?a=1&marker=v1",
    ]


async def test_paginate_stops_at_the_cap_and_warns():
    calls = []

    async def fetch(cursor):
        calls.append(cursor)
        return (cursor or 0) + 1

    async with httpx.AsyncClient() as http:
        client = make_client(http, upstream_max_pages=3)
        with structlog.testing.capture_logs() as logs:
            pages = [
                page async for page in client.paginate(fetch, lambda p: p)
            ]
    assert pages == [1, 2, 3]
    assert calls == [None, 1, 2]
    assert logs == [
        {
            "event": "pagination cap reached",
            "log_level": "warning",
            "service": "volumev3",
            "pages": 3,
        }
    ]


async def test_paginate_ends_quietly_on_the_last_page():
    async def fetch(cursor):
        return cursor

    async with httpx.AsyncClient() as http:
        client = make_client(http)
        with structlog.testing.capture_logs() as logs:
            pages = [
                page async for page in client.paginate(fetch, lambda _p: None)
            ]
    assert pages == [None]
    assert logs == []


async def test_list_by_offset_stops_on_a_short_page():
    offsets = []

    async def fetch(offset: int) -> list[int]:
        offsets.append(offset)
        return list(range(offset, min(offset + 2, 5)))

    async with httpx.AsyncClient() as http:
        items = await make_client(http).list_by_offset(fetch, 2)
    assert items == [0, 1, 2, 3, 4]
    assert offsets == [0, 2, 4]


async def test_list_all_reads_a_bare_list_as_one_page():
    with respx.mock() as upstream:
        upstream.get(f"{ENDPOINT}/things").mock(
            return_value=httpx.Response(200, json=[{"id": 1}])
        )
        async with httpx.AsyncClient() as http:
            items = await make_client(http).list_all("/things", "results")
    assert items == [{"id": 1}]


async def test_envelope_helpers_wrap_and_unwrap():
    with respx.mock() as upstream:
        create = upstream.post(f"{ENDPOINT}/volumes").mock(
            return_value=httpx.Response(202, json={"volume": {"id": "v1"}})
        )
        update = upstream.patch(f"{ENDPOINT}/volumes/v1").mock(
            return_value=httpx.Response(200, content=b"")
        )
        delete = upstream.delete(f"{ENDPOINT}/volumes/v1").mock(
            return_value=httpx.Response(404)
        )
        async with httpx.AsyncClient() as http:
            client = make_client(http)
            created = await client.create("/volumes", "volume", {"size": 1})
            updated = await client.update(
                "/volumes/v1", "volume", {"name": "n"}, method="PATCH"
            )
            await client.delete("/volumes/v1", ok=(204, 404))
    assert created == {"id": "v1"}
    assert json.loads(create.calls.last.request.content) == {
        "volume": {"size": 1}
    }
    assert updated == {}
    assert json.loads(update.calls.last.request.content) == {
        "volume": {"name": "n"}
    }
    assert delete.called


CATALOG = [
    {
        "type": "compute",
        "endpoints": [
            {"interface": "internal", "region": "Melbourne", "url": "i"},
            {"interface": "public", "region": "Monash", "url": "m"},
            {"interface": "public", "region": "Melbourne", "url": "p"},
        ],
    },
    {
        "type": "dns",
        "endpoints": [{"interface": "public", "url": "anywhere"}],
    },
    {"type": "empty", "endpoints": []},
]


@pytest.mark.parametrize(
    ("region", "expected"),
    [
        ("Melbourne", {"compute": "p", "dns": "anywhere"}),
        ("Monash", {"compute": "m", "dns": "anywhere"}),
        (None, {"compute": "m", "dns": "anywhere"}),
    ],
)
def test_endpoints_for_keeps_one_url_per_type(region, expected):
    assert endpoints_for(CATALOG, "public", region) == expected


def test_endpoints_for_the_internal_interface():
    assert endpoints_for(CATALOG, "internal", "Melbourne") == {"compute": "i"}


def reply(body, status=400) -> httpx.Response:
    return httpx.Response(status, json=body)


@pytest.mark.parametrize(
    ("response", "message"),
    [
        (reply({"badRequest": {"message": "nope"}}), "nope"),
        (reply({"NeutronError": {"message": "bad net"}}), "bad net"),
        (reply({"detail": "missing"}), "missing"),
        (httpx.Response(500, text="boom"), "boom"),
    ],
)
def test_extract_message_handles_openstack_shapes(response, message):
    assert extract_message(response) == message


@pytest.mark.parametrize(
    ("status", "code", "envelope_status"),
    [
        (409, "conflict", 409),
        (401, "session_expired", 401),
        (429, "rate_limited", 429),
        (503, "upstream_error", 502),
    ],
)
def test_map_upstream_error(status, code, envelope_status):
    error = map_upstream_error("nova", reply({"message": "x"}, status))
    assert (error.code, error.status) == (code, envelope_status)
    assert error.service == "nova"


def test_a_401_from_a_service_that_does_not_vouch_for_the_token():
    error = map_upstream_error("varroa", reply({}, 401), ends_session=False)
    assert (error.code, error.status) == ("upstream_error", 502)


@pytest.mark.parametrize(
    ("response", "message"),
    [
        (httpx.Response(400, json="plain words"), "plain words"),
        (httpx.Response(400, json={"other": 1}), '{"other":1}'),
    ],
)
def test_extract_message_falls_back_to_the_text(response, message):
    assert extract_message(response) == message


def test_a_rate_limit_passes_retry_after_on():
    response = httpx.Response(429, headers={"retry-after": "30"}, json={})
    error = map_upstream_error("nova", response)
    assert error.headers == {"Retry-After": "30"}


def test_endpoints_for_skips_untyped_services_and_empty_urls():
    catalog = [
        {"endpoints": [{"interface": "public", "url": "x"}]},
        {"type": "dns", "endpoints": [{"interface": "public", "url": ""}]},
    ]
    assert endpoints_for(catalog, "public", None) == {}


@pytest.mark.parametrize(
    ("failure", "code"),
    [
        (httpx.ReadTimeout("slow"), "upstream_timeout"),
        (httpx.ConnectError("refused"), "upstream_unreachable"),
        (httpx.RemoteProtocolError("garbled"), "upstream_error"),
    ],
)
async def test_transport_failures_map_to_upstream_errors(failure, code):
    with respx.mock() as upstream:
        upstream.get(f"{ENDPOINT}/volumes/v1").mock(side_effect=failure)
        async with httpx.AsyncClient() as http:
            with pytest.raises(HiveError) as raised:
                await make_client(http).get("/volumes/v1", "volume")
    assert raised.value.code == code
    assert raised.value.service == "volumev3"


async def test_an_empty_reply_reads_as_nothing():
    with respx.mock() as upstream:
        upstream.get(f"{ENDPOINT}/volumes/v1").mock(
            return_value=httpx.Response(204)
        )
        async with httpx.AsyncClient() as http:
            assert await make_client(http).get_json("/volumes/v1") is None


async def test_a_refused_token_is_rescoped_once_and_bytes_are_resent():
    """A 401 rescopes once and resends a body Hive holds; a streamed body
    cannot be sent twice, so its 401 stands."""
    refused = []

    async def refresh(rejected: ScopedToken) -> ScopedToken:
        refused.append(rejected.token.get_secret_value())
        return rejected.model_copy(update={"token": SecretStr("fresh")})

    def answer(request):
        fresh = request.headers["X-Auth-Token"] == "fresh"
        return httpx.Response(204 if fresh else 401)

    async def stream():
        yield b"x"

    bind_refresh(refresh)
    try:
        with respx.mock() as router:
            route = router.put(f"{ENDPOINT}/x").mock(side_effect=answer)
            async with httpx.AsyncClient() as http:
                client = make_client(http)
                await client.request("PUT", "/x", content=b"bytes")
                assert client.scoped is not None
                assert client.scoped.token.get_secret_value() == "fresh"
                with pytest.raises(SessionExpired):
                    await make_client(http).request(
                        "PUT", "/x", content=stream()
                    )
    finally:
        bind_refresh(None)
    assert refused == ["t"]
    assert route.call_count == 3
