import pytest

pytestmark = pytest.mark.live


async def login(live_client, unscoped_token):
    response = await live_client.post(
        "/auth/websso/",
        data={"token": unscoped_token, "tenant_id": ""},
        follow_redirects=False,
    )
    assert response.status_code == 303, response.text
    return response


async def test_receiver_creates_a_session(live_client, unscoped_token):
    await login(live_client, unscoped_token)
    me = (await live_client.get("/api/me")).json()
    assert me["user"]["id"]
    assert me["project"]["id"]
    assert me["capabilities"]["services"]["compute"] is True
    assert me["session"]["expires_at"] > me["session"]["server_time"]


async def test_token_from_token_inherits_expiry(live_app, unscoped_token):
    """Keystone bounds a token issued from a token to the original's
    expiry; the session cap relies on it."""
    keystone = live_app.state.keystone
    first = await keystone.token_from_token(unscoped_token)
    second = await keystone.token_from_token(first.token)
    assert second.expires_at <= first.expires_at


async def test_home_endpoints_answer(live_client, unscoped_token):
    await login(live_client, unscoped_token)
    for path in (
        "/api/me/profile",
        "/api/outages",
        "/api/allocation/summary",
        "/api/usage/summary",
        "/api/security/risks",
        "/api/news/ardc",
    ):
        response = await live_client.get(path)
        assert response.status_code == 200, (path, response.text)


async def test_project_switch_and_logout(live_client, unscoped_token):
    await login(live_client, unscoped_token)
    me = (await live_client.get("/api/me")).json()
    others = [p for p in me["projects"] if p["id"] != me["project"]["id"]]
    headers = {"X-CSRF-Token": live_client.cookies["hive_csrf"]}
    if others:
        switched = await live_client.post(
            "/api/session/project",
            json={"project_id": others[0]["id"]},
            headers=headers,
        )
        assert switched.status_code == 200, switched.text
        assert switched.json()["project"]["id"] == others[0]["id"]
    response = await live_client.post("/api/auth/logout", headers=headers)
    assert response.status_code == 204
    assert (await live_client.get("/api/me")).status_code == 401
