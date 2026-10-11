"""Project Members, application, EC2 and generic credentials."""

import json

import httpx

from tests.conftest import csrf_headers, KEYSTONE, MANUKA

ASSIGNMENTS = {
    "role_assignments": [
        {
            "user": {"id": "u1", "name": "sam@example.edu"},
            "role": {"id": "r-member", "name": "member"},
            "scope": {"project": {"id": "p2"}},
        },
        {
            "user": {"id": "u2", "name": "ann@example.edu"},
            "role": {"id": "r-tm", "name": "tenantmanager"},
            "scope": {"project": {"id": "p2"}},
        },
        {
            "user": {"id": "u3", "name": "bot"},
            "role": {"id": "r-bot", "name": "reservation_bot"},
            "scope": {"project": {"id": "p2"}},
        },
    ]
}

APP_CRED = {
    "id": "ac-1",
    "name": "deploy",
    "description": None,
    "project_id": "p1",
    "expires_at": "2027-01-10T00:00:00.000000Z",
    "unrestricted": False,
    "roles": [{"id": "r-member", "name": "member", "domain_id": None}],
    "access_rules": [],
}


async def as_manager(client):
    response = await client.post(
        "/api/session/project",
        json={"project_id": "p2"},
        headers=csrf_headers(client),
    )
    assert response.status_code == 200, response.text
    return client


async def test_members_need_the_tenantmanager_role(logged_in):
    response = await logged_in.get("/api/identity/members")
    assert response.status_code == 403


async def test_members_list_add_and_remove(logged_in, upstream):
    client = await as_manager(logged_in)
    upstream.get(f"{KEYSTONE}/role_assignments").mock(
        return_value=httpx.Response(200, json=ASSIGNMENTS)
    )
    body = (await client.get("/api/identity/members")).json()
    assert [m["id"] for m in body["items"]] == ["u2-r-tm", "u1-r-member"]
    assert body["items"][1]["can_remove"] is False
    assert [r["name"] for r in body["roles"]] == ["member", "tenantmanager"]

    upstream.get(
        f"{MANUKA}/v1/keystone-ext/user-by-name/new@example.edu/"
    ).mock(
        return_value=httpx.Response(
            200, json={"id": "u9", "name": "new@example.edu"}
        )
    )
    grant = upstream.put(
        f"{KEYSTONE}/projects/p2/users/u9/roles/r-member"
    ).mock(return_value=httpx.Response(204))
    response = await client.post(
        "/api/identity/members",
        json={"email": "new@example.edu", "role_id": "r-member"},
        headers=csrf_headers(client),
    )
    assert response.status_code == 201, response.text
    assert response.json()["role_name"] == "member"
    assert grant.called

    revoke = upstream.delete(
        f"{KEYSTONE}/projects/p2/users/u2/roles/r-tm"
    ).mock(return_value=httpx.Response(204))
    response = await client.delete(
        "/api/identity/members/u2/roles/r-tm", headers=csrf_headers(client)
    )
    assert response.status_code == 204
    assert revoke.called


async def test_members_add_rejects_unknown_accounts_and_self_removal(
    logged_in, upstream
):
    client = await as_manager(logged_in)
    upstream.get(
        f"{MANUKA}/v1/keystone-ext/user-by-name/nobody@example.edu/"
    ).mock(
        return_value=httpx.Response(404, json={"error": "User doesn't exist"})
    )
    response = await client.post(
        "/api/identity/members",
        json={"email": "nobody@example.edu", "role_id": "r-member"},
        headers=csrf_headers(client),
    )
    assert response.status_code == 404
    assert response.json()["error"] == "user_not_found"
    assert "no Nectar RC account" in response.json()["message"]

    response = await client.post(
        "/api/identity/members",
        json={"email": "ann@example.edu", "role_id": "r-admin"},
        headers=csrf_headers(client),
    )
    assert response.status_code == 400

    response = await client.delete(
        "/api/identity/members/u1/roles/r-member", headers=csrf_headers(client)
    )
    assert response.status_code == 403
    response = await client.delete(
        "/api/identity/members/u2/roles/r-bot", headers=csrf_headers(client)
    )
    assert response.status_code == 400


async def test_application_credentials(logged_in, upstream):
    upstream.get(f"{KEYSTONE}/users/u1/application_credentials").mock(
        return_value=httpx.Response(
            200, json={"application_credentials": [APP_CRED]}
        )
    )
    body = (
        await logged_in.get("/api/identity/application-credentials")
    ).json()
    assert body["items"][0]["roles"][0]["name"] == "member"
    options = (
        await logged_in.get("/api/identity/application-credentials/options")
    ).json()
    assert options["roles"] == ["member"]
    assert options["default_expiration_date"] > "2026"
    assert options["auth_url"] == KEYSTONE

    created = upstream.post(
        f"{KEYSTONE}/users/u1/application_credentials"
    ).mock(
        return_value=httpx.Response(
            201,
            json={"application_credential": {**APP_CRED, "secret": "s3cret"}},
        )
    )
    response = await logged_in.post(
        "/api/identity/application-credentials",
        json={
            "name": "deploy",
            "expiration_date": "2027-01-10",
            "roles": ["member"],
            "access_rules": "",
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 201, response.text
    assert response.json()["secret"] == "s3cret"
    sent = json.loads(created.calls.last.request.content)[
        "application_credential"
    ]
    assert sent["expires_at"] == "2027-01-10T00:00:00.000000Z"
    assert sent["roles"] == [{"name": "member"}]
    assert "access_rules" not in sent

    upstream.get(f"{KEYSTONE}/users/u1/application_credentials/ac-1").mock(
        return_value=httpx.Response(
            200, json={"application_credential": APP_CRED}
        )
    )
    detail = await logged_in.get("/api/identity/application-credentials/ac-1")
    assert detail.json()["name"] == "deploy"
    upstream.delete(f"{KEYSTONE}/users/u1/application_credentials/ac-1").mock(
        return_value=httpx.Response(204)
    )
    response = await logged_in.delete(
        "/api/identity/application-credentials/ac-1",
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 204


async def test_application_credential_errors(logged_in, upstream):
    upstream.post(f"{KEYSTONE}/users/u1/application_credentials").mock(
        return_value=httpx.Response(
            409, json={"error": {"message": "Duplicate entry"}}
        )
    )
    response = await logged_in.post(
        "/api/identity/application-credentials",
        json={"name": "deploy"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 409
    assert 'name "deploy" is already used' in response.json()["message"]
    response = await logged_in.post(
        "/api/identity/application-credentials",
        json={"name": "deploy", "access_rules": "nope"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400
    assert "JSON list" in response.json()["message"]


async def test_ec2_credentials(logged_in, upstream):
    listing = upstream.get(f"{KEYSTONE}/users/u1/credentials/OS-EC2").mock(
        return_value=httpx.Response(
            200,
            json={
                "credentials": [
                    {"tenant_id": "p2", "access": "other", "secret": "x"}
                ]
            },
        )
    )
    body = (await logged_in.get("/api/identity/ec2-credentials")).json()
    assert body == {"credential": None, "created": False}

    upstream.post(f"{KEYSTONE}/users/u1/credentials/OS-EC2").mock(
        return_value=httpx.Response(
            201,
            json={
                "credential": {
                    "tenant_id": "p1",
                    "access": "AK",
                    "secret": "SK",
                }
            },
        )
    )
    response = await logged_in.post(
        "/api/identity/ec2-credentials", headers=csrf_headers(logged_in)
    )
    assert response.json() == {
        "credential": {"access": "AK", "secret": "SK", "project_id": "p1"},
        "created": True,
    }

    listing.mock(
        return_value=httpx.Response(
            200,
            json={
                "credentials": [
                    {"tenant_id": "p1", "access": "AK", "secret": "SK"}
                ]
            },
        )
    )
    deleted = upstream.delete(
        f"{KEYSTONE}/users/u1/credentials/OS-EC2/AK"
    ).mock(return_value=httpx.Response(204))
    response = await logged_in.post(
        "/api/identity/ec2-credentials/recreate",
        headers=csrf_headers(logged_in),
    )
    assert response.json()["created"] is True
    assert deleted.called
    response = await logged_in.delete(
        "/api/identity/ec2-credentials/AK", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 204


async def test_generic_credentials(logged_in, upstream):
    upstream.get(f"{KEYSTONE}/credentials").mock(
        return_value=httpx.Response(
            200,
            json={
                "credentials": [
                    {
                        "id": "c1",
                        "type": "ec2",
                        "project_id": "p1",
                        "blob": "{}",
                    }
                ]
            },
        )
    )
    body = (await logged_in.get("/api/identity/credentials")).json()
    assert body["items"][0]["type"] == "ec2"
    created = upstream.post(f"{KEYSTONE}/credentials").mock(
        return_value=httpx.Response(
            201,
            json={
                "credential": {
                    "id": "c2",
                    "type": "totp",
                    "project_id": None,
                    "blob": "SEED",
                }
            },
        )
    )
    response = await logged_in.post(
        "/api/identity/credentials",
        json={"type": "totp", "blob": "SEED"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 201
    assert json.loads(created.calls.last.request.content) == {
        "credential": {"user_id": "u1", "type": "totp", "blob": "SEED"}
    }
    upstream.delete(f"{KEYSTONE}/credentials/c2").mock(
        return_value=httpx.Response(204)
    )
    response = await logged_in.delete(
        "/api/identity/credentials/c2", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 204
