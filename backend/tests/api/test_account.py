"""My Details, Reset Password and the helpdesk user lookup."""

import json

import httpx

from tests import conftest
from tests.conftest import csrf_headers, KEYSTONE, login, MANUKA

USER = {
    "id": "u1",
    "first_name": "Sam",
    "surname": "Example",
    "displayname": "Sam Example",
    "email": "sam@example.edu",
    "organisation": "Example University",
    "affiliation": "staff",
    "phone_number": None,
    "mobile_number": "0400 000 000",
    "orcid": None,
    "external_ids": [{"idp": "https://idp.example.edu", "last_login": "2026-10-09"}],
}


async def test_profile_carries_orcid_links(logged_in, upstream):
    upstream.get(f"{MANUKA}/v1/users/u1/").mock(
        return_value=httpx.Response(200, json=USER)
    )
    body = (await logged_in.get("/api/me/profile")).json()
    assert body["partial"] is False
    assert body["organisation"] == "Example University"
    assert body["external_ids"][0]["idp"] == "https://idp.example.edu"
    assert body["orcid_link_url"] == (
        "https://orcid.test/oauth/authorize?client_id=x"
        "?next=http%3A%2F%2Ftestserver%2Faccount%2Fmy-details"
    )
    assert body["orcid_unlink_url"] == "https://manuka.test/orcid/unlink/"
    assert body["affiliations"][0] == {"id": "faculty", "label": "Faculty"}


async def test_update_profile(logged_in, upstream):
    patched = upstream.patch(f"{MANUKA}/v1/users/u1/").mock(
        return_value=httpx.Response(200, json={})
    )
    upstream.get(f"{MANUKA}/v1/users/u1/").mock(
        return_value=httpx.Response(200, json={**USER, "affiliation": "student"})
    )
    response = await logged_in.patch(
        "/api/me/profile",
        json={"affiliation": "student", "mobile_number": "0400 111 222"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200, response.text
    assert response.json()["affiliation"] == "student"
    assert json.loads(patched.calls.last.request.content) == {
        "affiliation": "student",
        "phone_number": "",
        "mobile_number": "0400 111 222",
    }
    bad = await logged_in.patch(
        "/api/me/profile",
        json={"affiliation": "pirate"},
        headers=csrf_headers(logged_in),
    )
    assert bad.status_code == 422


async def test_reset_password_relogs_the_session(logged_in, upstream):
    changed = upstream.post(f"{KEYSTONE}/users/u1/password").mock(
        return_value=httpx.Response(204)
    )
    response = await logged_in.post(
        "/api/me/reset-password", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["username"] == "sam@example.edu"
    assert len(body["password"]) == 20
    sent = json.loads(changed.calls.last.request.content)
    assert sent["user"]["original_password"] == "reset-secret"
    assert sent["user"]["password"] == body["password"]
    # The session keeps working on the re-issued tokens.
    me = await logged_in.get("/api/me")
    assert me.status_code == 200
    assert me.json()["project"]["id"] == "p1"


async def test_reset_password_unavailable_without_token(
    client, upstream, app
):
    app.state.settings.password_reset_token = None
    assert (await login(client)).status_code == 303
    response = await client.post(
        "/api/me/reset-password", headers=csrf_headers(client)
    )
    assert response.status_code == 503
    assert response.json()["error"] == "password_reset_unavailable"


async def test_user_lookup_needs_a_helpdesk_role(logged_in):
    response = await logged_in.get("/api/identity/users/search", params={"q": "sam"})
    assert response.status_code == 403


async def test_user_lookup(client, upstream, monkeypatch):
    monkeypatch.setitem(conftest.ROLES, "p1", ["member", "helpdesk"])
    assert (await login(client)).status_code == 303
    search = upstream.post(f"{MANUKA}/v1/users/search/").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {"id": "u2", "displayname": "Ann", "email": "ann@example.edu"}
                ]
            },
        )
    )
    short = (await client.get("/api/identity/users/search", params={"q": "an"})).json()
    assert short == {"items": []}
    assert not search.called
    body = (await client.get("/api/identity/users/search", params={"q": "ann"})).json()
    assert body["items"] == [
        {"id": "u2", "displayname": "Ann", "email": "ann@example.edu"}
    ]
    assert json.loads(search.calls.last.request.content) == {"search": "ann"}

    upstream.get(f"{MANUKA}/v1/users/u2/").mock(
        return_value=httpx.Response(200, json={**USER, "id": "u2"})
    )
    detail = (await client.get("/api/identity/users/u2")).json()
    assert detail["id"] == "u2" and detail["surname"] == "Example"
    assert "affiliations" not in detail and "orcid_link_url" not in detail
