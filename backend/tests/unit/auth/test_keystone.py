"""Keystone over the client base: its own error mapping, the token each
call acts with, and the parse of a token reply."""

import httpx
from pydantic import SecretStr
import pytest
import respx

from hive.auth.keystone import InvalidToken, KeystoneClient
from hive.config import Settings
from hive.errors import Forbidden, UpstreamError
from tests.conftest import KEYSTONE, token_response

TOKEN = SecretStr("unscoped-token")


@pytest.fixture
async def keystone():
    settings = Settings(
        _env_file=None,  # pyright: ignore[reportCallIssue]
        secret_key="x" * 32,
        keystone_url=KEYSTONE + "/",
    )
    async with httpx.AsyncClient() as http:
        yield KeystoneClient(http, settings)


@pytest.mark.parametrize(
    ("status", "error", "code"),
    [
        (401, InvalidToken, "invalid_token"),
        (404, InvalidToken, "invalid_token"),
        (403, Forbidden, "forbidden"),
        (500, UpstreamError, "upstream_error"),
    ],
)
async def test_errors_map_to_token_cases(keystone, status, error, code):
    with respx.mock() as upstream:
        upstream.post(f"{KEYSTONE}/auth/tokens").mock(
            return_value=httpx.Response(
                status,
                json={"error": {"message": "Could not find token"}},
                headers={"x-openstack-request-id": "req-k"},
            )
        )
        with pytest.raises(error) as raised:
            await keystone.token_from_token(TOKEN)
    assert raised.value.code == code
    assert raised.value.service == "keystone"
    assert raised.value.message == "Could not find token"
    assert raised.value.upstream_request_id == "req-k"


async def test_scoping_parses_the_token(keystone):
    with respx.mock() as upstream:
        route = upstream.post(f"{KEYSTONE}/auth/tokens").mock(
            side_effect=token_response
        )
        result = await keystone.token_from_token(TOKEN, project_id="p1")
    sent = route.calls.last.request
    assert "x-auth-token" not in sent.headers
    assert sent.headers["x-openstack-request-id"].startswith("req-")
    assert result.token.get_secret_value() == "scoped-p1"
    assert result.project is not None
    assert result.project.id == "p1"
    assert result.roles == ["member"]


async def test_list_projects_acts_with_the_given_token(keystone):
    with respx.mock() as upstream:
        route = upstream.get(f"{KEYSTONE}/auth/projects").mock(
            return_value=httpx.Response(
                200, json={"projects": [{"id": "p9", "enabled": False}]}
            )
        )
        projects = await keystone.list_projects(TOKEN)
    assert route.calls.last.request.headers["x-auth-token"] == (
        "unscoped-token"
    )
    assert [(p.id, p.name, p.enabled) for p in projects] == [
        ("p9", "p9", False)
    ]


async def test_revoke_ignores_a_token_already_gone(keystone):
    with respx.mock() as upstream:
        route = upstream.delete(f"{KEYSTONE}/auth/tokens").mock(
            return_value=httpx.Response(500)
        )
        await keystone.revoke(TOKEN)
    sent = route.calls.last.request.headers
    assert sent["x-subject-token"] == "unscoped-token"


@pytest.mark.parametrize(
    ("answer", "alive"),
    [
        (httpx.Response(200), True),
        (httpx.Response(503), False),
        (httpx.ConnectError("down"), False),
    ],
)
async def test_ping(keystone, answer, alive):
    with respx.mock() as upstream:
        upstream.get(KEYSTONE).mock(side_effect=[answer])
        assert await keystone.ping() is alive
