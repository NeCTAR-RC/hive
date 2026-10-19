from datetime import datetime, timedelta, UTC
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import respx

from hive.errors import SessionExpired
from tests.conftest import (
    ACCOUNTS,
    CLOUDKITTY,
    csrf_headers,
    KEYSTONE,
    login,
    mock_keystone,
    token_response,
)


async def test_login_sets_cookies_and_redirects_to_next(client):
    response = await login(client, next="/compute/instances?page=2")
    assert response.status_code == 303
    assert response.headers["location"] == "/compute/instances?page=2"
    cookies = response.headers.get_list("set-cookie")
    session_cookie = next(c for c in cookies if c.startswith("hive_session="))
    assert "HttpOnly" in session_cookie
    assert "SameSite=lax" in session_cookie
    assert "Secure" not in session_cookie  # cookie_secure=False in tests
    csrf_cookie = next(c for c in cookies if c.startswith("hive_csrf="))
    assert "HttpOnly" not in csrf_cookie
    recent = next(c for c in cookies if c.startswith("recent_project="))
    assert "recent_project=p1" in recent


async def test_login_honours_recent_project_cookie(client):
    client.cookies.set("recent_project", "p2")
    response = await login(client)
    assert response.status_code == 303
    me = (await client.get("/api/me")).json()
    assert me["project"]["id"] == "p2"
    assert me["capabilities"]["tenantmanager"] is True


async def test_login_ignores_unknown_recent_project(client):
    client.cookies.set("recent_project", "nope")
    response = await login(client)
    assert response.status_code == 303
    assert (await client.get("/api/me")).json()["project"]["id"] == "p1"


async def test_login_rejects_bad_token(client):
    response = await login(client, token="bad-token")
    assert response.status_code == 303
    assert response.headers["location"] == "/auth/login?reason=invalid_token"
    assert "hive_session" not in client.cookies


async def test_login_rejects_unexpected_origin(client):
    response = await login(client, origin="https://evil.test")
    assert response.status_code == 400
    assert response.json()["error"] == "bad_request"


async def test_login_requires_form_body(client):
    response = await client.post(
        "/auth/websso/",
        json={"token": "good-token"},
        headers={"Origin": ACCOUNTS},
    )
    assert response.status_code == 400


async def test_login_with_no_projects(client, upstream):
    upstream.get(f"{KEYSTONE}/auth/projects").mock(
        return_value=httpx.Response(200, json={"projects": []})
    )
    response = await login(client)
    assert response.headers["location"] == "/auth/login?reason=no_projects"


async def test_unsafe_next_falls_back_to_root(client):
    response = await login(client, next="https://evil.test/")
    assert response.headers["location"] == "/"


async def test_me_without_session_is_401_with_login_url(client):
    response = await client.get("/api/me")
    assert response.status_code == 401
    body = response.json()
    assert body["error"] == "not_authenticated"
    assert body["login_url"].startswith(f"{ACCOUNTS}/login?return-path=")
    assert response.headers["cache-control"] == "no-store"


async def test_me_payload(logged_in):
    me = (await logged_in.get("/api/me")).json()
    assert me["user"]["id"] == "u1"
    assert me["project"] == {
        "id": "p1",
        "name": "pt-50",
        "domain_id": "default",
        "enabled": True,
        "is_trial": True,
    }
    assert me["roles"] == ["member"]
    assert [p["id"] for p in me["projects"]] == ["p1", "p2"]
    assert me["capabilities"]["services"]["compute"] is True
    assert me["capabilities"]["services"]["volume"] is False
    assert me["capabilities"]["tenantmanager"] is False
    assert me["session"]["expires_at"] > me["session"]["server_time"]


async def test_session_probe(client):
    anonymous = (await client.get("/api/session")).json()
    assert anonymous["authenticated"] is False
    assert "login_url" in anonymous
    await login(client)
    probe = (await client.get("/api/session")).json()
    assert probe["authenticated"] is True
    assert probe["csrf_token"] == client.cookies["hive_csrf"]
    assert probe["project_id"] == "p1"


async def test_switch_project_requires_csrf(logged_in):
    response = await logged_in.post(
        "/api/session/project", json={"project_id": "p2"}
    )
    assert response.status_code == 403
    assert response.json()["error"] == "csrf"
    response = await logged_in.post(
        "/api/session/project",
        json={"project_id": "p2"},
        headers={**csrf_headers(logged_in), "Sec-Fetch-Site": "cross-site"},
    )
    assert response.status_code == 403


async def test_switch_project(logged_in, upstream):
    response = await logged_in.post(
        "/api/session/project",
        json={"project_id": "p2"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["project"]["id"] == "p2"
    assert body["capabilities"]["tenantmanager"] is True
    assert logged_in.cookies["recent_project"] == "p2"
    # Switching back reuses the cached scoped token: no new keystone call.
    calls_before = upstream.calls.call_count
    response = await logged_in.post(
        "/api/session/project",
        json={"project_id": "p1"},
        headers=csrf_headers(logged_in),
    )
    assert response.json()["project"]["id"] == "p1"
    assert upstream.calls.call_count == calls_before


async def test_switch_to_unknown_project_is_404(logged_in):
    response = await logged_in.post(
        "/api/session/project",
        json={"project_id": "nope"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 404


async def test_projects_listing_and_refresh(logged_in, upstream):
    listing = (await logged_in.get("/api/projects")).json()
    assert listing["current_project_id"] == "p1"
    assert len(listing["items"]) == 2
    upstream.get(f"{KEYSTONE}/auth/projects").mock(
        return_value=httpx.Response(
            200,
            json={
                "projects": [
                    {"id": "p9", "name": "new", "enabled": True},
                ]
            },
        )
    )
    refreshed = (await logged_in.get("/api/projects?refresh=true")).json()
    assert [p["id"] for p in refreshed["items"]] == ["p9"]


async def test_logout_destroys_session(logged_in):
    response = await logged_in.post(
        "/api/auth/logout", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 204
    assert "hive_session" not in logged_in.cookies
    assert (await logged_in.get("/api/me")).status_code == 401


async def test_expired_token_yields_session_expired(client, upstream):
    mock_keystone(upstream, token_ttl=30)
    await login(client)
    response = await client.get("/api/me")
    assert response.status_code == 401
    assert response.json()["error"] == "session_expired"
    # The session is gone for good.
    assert (await client.get("/api/session")).json()["authenticated"] is False


async def test_tampered_cookie_is_ignored(logged_in):
    logged_in.cookies.set("hive_session", "abc.def")
    assert (await logged_in.get("/api/me")).status_code == 401


async def test_auth_start_redirects_to_manuka(client):
    response = await client.get("/auth/start", params={"next": "/x"})
    assert response.status_code == 302
    location = urlparse(response.headers["location"])
    assert location.path == "/login"
    assert parse_qs(location.query)["return-path"][-1].startswith(
        "http://testserver/auth/websso/?next="
    )


async def test_config_is_public(client):
    body = (await client.get("/api/config")).json()
    assert body["receiver_url"] == "http://testserver/auth/websso/"
    assert body["login_url"].startswith(f"{ACCOUNTS}/login?return-path=")
    assert body["horizon_url"].startswith("https://horizon.test")
    assert body["trial_project_prefix"] == "pt-"


def test_token_response_helper_handles_disabled_project():
    request = httpx.Request(
        "POST",
        f"{KEYSTONE}/auth/tokens",
        json={
            "auth": {
                "identity": {"methods": ["token"], "token": {"id": "t"}},
                "scope": {"project": {"id": "p3"}},
            }
        },
    )
    assert token_response(request).status_code == 401
    assert datetime.now(UTC) < datetime.now(UTC) + timedelta(seconds=1)


def _scoped_posts(upstream) -> int:
    return sum(
        1
        for call in upstream.calls
        if call.request.method == "POST"
        and call.request.url.path.endswith("/auth/tokens")
        and b'"scope"' in call.request.content
    )


async def test_upstream_401_rescopes_once_and_retries(logged_in, upstream):
    tokens = []

    def cloudkitty(request):
        tokens.append(request.headers["X-Auth-Token"])
        if len(tokens) == 1:
            return httpx.Response(401, json={"error": "token rejected"})
        return httpx.Response(200, json={"results": [], "total": 0})

    upstream.get(f"{CLOUDKITTY}/v2/summary").mock(side_effect=cloudkitty)
    before = _scoped_posts(upstream)
    response = await logged_in.get(
        "/api/usage/summary", headers={"X-Request-ID": "req-hive-1"}
    )
    assert response.status_code == 200, response.text
    assert len(tokens) == 2
    assert _scoped_posts(upstream) == before + 1
    # Hive's request id reaches the upstream for correlation.
    request = upstream.calls.last.request
    assert request.headers["X-OpenStack-Request-ID"] == "req-hive-1"
    # The session survives.
    assert (await logged_in.get("/api/me")).status_code == 200


async def test_upstream_401_after_rescope_ends_the_session(
    logged_in, upstream
):
    route = upstream.get(f"{CLOUDKITTY}/v2/summary").mock(
        return_value=httpx.Response(401, json={"error": "token rejected"})
    )
    response = await logged_in.get("/api/usage/summary")
    assert response.status_code == 401
    assert response.json()["error"] == "session_expired"
    assert route.call_count == 2


async def test_compute_rescopes_after_401(logged_in, upstream):
    calls = []

    def nova(request):
        calls.append(request.headers["X-Auth-Token"])
        if len(calls) == 1:
            return httpx.Response(401, json={"error": "token rejected"})
        return httpx.Response(200, json={"keypairs": []})

    upstream.get("https://nova.test/v2.1/os-keypairs").mock(side_effect=nova)
    response = await logged_in.get("/api/compute/keypairs")
    assert response.status_code == 200, response.text
    assert len(calls) == 2


async def test_client_refresh_skips_streamed_bodies(settings):
    from hive.clients.base import ServiceClient
    from hive.session.model import ProjectRef, ScopedToken

    def scoped(token):
        return ScopedToken(
            token=token,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
            project=ProjectRef(id="p1", name="pt-50"),
        )

    refreshed = []

    async def refresh():
        refreshed.append(1)
        return scoped("fresh")

    class Client(ServiceClient):
        service_type = "rating"

    async def body():
        yield b"x"

    with respx.mock() as router:
        route = router.put("https://ck.test/x").mock(
            side_effect=lambda request: httpx.Response(
                200 if request.headers["X-Auth-Token"] == "fresh" else 401
            )
        )
        async with httpx.AsyncClient() as http:
            client = Client(http, settings, scoped("old"), refresh=refresh)
            client._endpoint = "https://ck.test"
            await client.request("PUT", "/x", content=b"bytes")
            assert client.scoped.token == "fresh"
            client.scoped = scoped("old")
            with pytest.raises(SessionExpired):
                await client.request("PUT", "/x", content=body())
    assert refreshed == [1]
    assert route.call_count == 3


async def test_logout_revoke_tolerates_expired_tokens(
    logged_in, app, upstream
):
    app.state.settings.logout_revokes_tokens = True
    upstream.delete(f"{KEYSTONE}/auth/tokens").mock(
        return_value=httpx.Response(
            401, json={"error": {"message": "token expired"}}
        )
    )
    response = await logged_in.post(
        "/api/auth/logout", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 204
