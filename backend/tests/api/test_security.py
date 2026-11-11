"""Security negatives in one place: what the BFF must refuse, hide or never
cache, whatever a browser or another website sends it."""

from fastapi import FastAPI
import httpx
from pydantic import BaseModel, field_validator
import pytest

from tests import conftest
from tests.conftest import (
    ACCOUNTS,
    CINDER,
    CINDER_ENTRY,
    csrf_headers,
    GLANCE_ENTRY,
    login,
    NEUTRON_ENTRY,
    NOVA,
)


@pytest.fixture
def services(with_services, upstream):
    """Neutron, Glance and Cinder in the scoped catalog, before login."""
    with_services(NEUTRON_ENTRY, GLANCE_ENTRY, CINDER_ENTRY)
    return upstream


@pytest.fixture
async def member(services, client):
    assert (await login(client)).status_code == 303
    return client


async def switch(client, project_id):
    response = await client.post(
        "/api/session/project",
        json={"project_id": project_id},
        headers=csrf_headers(client),
    )
    assert response.status_code == 200, response.text


def by_project(key, public, private_to_p1):
    """An upstream list that, like Nova and Cinder, includes the private
    items granted to the calling project."""

    def answer(request):
        items = [public]
        if request.headers["X-Auth-Token"] == "scoped-p1":
            items.append(private_to_p1)
        return httpx.Response(200, json={key: items})

    return answer


async def test_private_flavours_stay_with_their_project(member, services):
    services.get(f"{NOVA}/flavors/detail").mock(
        side_effect=by_project(
            "flavors",
            {"id": "f-public", "name": "m3.small"},
            {"id": "f-gpu", "name": "g1.large"},
        )
    )

    async def flavour_ids():
        response = await member.get("/api/compute/flavors")
        return {f["id"] for f in response.json()["items"]}

    assert await flavour_ids() == {"f-public", "f-gpu"}
    await switch(member, "p2")
    assert await flavour_ids() == {"f-public"}
    await switch(member, "p1")
    assert await flavour_ids() == {"f-public", "f-gpu"}


async def test_private_volume_types_stay_with_their_project(member, services):
    services.get(f"{CINDER}/types").mock(
        side_effect=by_project(
            "volume_types",
            {"id": "t-std", "name": "standard", "extra_specs": {}},
            {"id": "t-secret", "name": "secret", "extra_specs": {}},
        )
    )

    async def type_ids():
        response = await member.get("/api/volumes/types")
        return {t["id"] for t in response.json()["items"]}

    assert await type_ids() == {"t-std", "t-secret"}
    await switch(member, "p2")
    assert await type_ids() == {"t-std"}


@pytest.mark.parametrize(
    "path",
    [
        "/api/compute/instances/%2E%2E",
        "/api/compute/instances/%2E",
        "/api/compute/keypairs/%2E%2E",
        "/api/compute/server-groups/%2E%2E",
    ],
)
async def test_dot_segments_never_reach_upstream(member, services, path):
    before = services.calls.call_count
    response = await member.delete(path, headers=csrf_headers(member))
    assert response.status_code == 400
    assert response.json()["error"] == "bad_request"
    assert services.calls.call_count == before


async def test_ids_in_bodies_are_encoded_too(member, services):
    services.get(f"{CINDER}/volumes/vol-1").mock(
        return_value=httpx.Response(
            200, json={"volume": {"id": "vol-1", "status": "available"}}
        )
    )
    before = services.calls.call_count
    response = await member.post(
        "/api/volumes/vol-1/attach",
        json={"instance_id": ".."},
        headers=csrf_headers(member),
    )
    assert response.status_code == 400
    assert all(
        "os-volume_attachments" not in str(call.request.url)
        for call in list(services.calls)[before:]
    )


async def test_query_characters_stay_inside_the_id(member, services):
    route = services.delete(f"{NOVA}/os-keypairs/a%3Fall_tenants%3D1").mock(
        return_value=httpx.Response(202)
    )
    response = await member.delete(
        "/api/compute/keypairs/a%3Fall_tenants%3D1",
        headers=csrf_headers(member),
    )
    assert response.status_code == 204
    assert route.called
    assert route.calls.last.request.url.params == httpx.QueryParams()


async def test_every_api_answer_is_no_store(member, services):
    services.get(f"{NOVA}/os-keypairs").mock(
        return_value=httpx.Response(200, json={"keypairs": []})
    )
    for path in ("/api/session", "/api/compute/keypairs", "/api/nope"):
        response = await member.get(path)
        assert response.headers["cache-control"] == "no-store", path


@pytest.mark.parametrize(
    ("method", "path", "upstream_call", "body"),
    [
        (
            "POST",
            "/api/compute/keypairs",
            ("POST", f"{NOVA}/os-keypairs", {"keypair": {"name": "k"}}),
            {"name": "k"},
        ),
        (
            "POST",
            "/api/compute/instances/srv-1/console",
            (
                "POST",
                f"{NOVA}/servers/srv-1/remote-consoles",
                {"remote_console": {"url": "https://vnc.test/?token=t"}},
            ),
            None,
        ),
    ],
)
async def test_secret_bearing_answers_are_no_store(
    member, services, method, path, upstream_call, body
):
    up_method, up_url, up_json = upstream_call
    services.request(up_method, up_url).mock(
        return_value=httpx.Response(200, json=up_json)
    )
    response = await member.request(
        method, path, json=body, headers=csrf_headers(member)
    )
    assert response.status_code < 300, response.text
    assert response.headers["cache-control"] == "no-store"


async def test_spa_assets_keep_their_own_caching(client):
    asset = await client.get("/assets/app-abc123.js")
    assert "immutable" in asset.headers["cache-control"]


@pytest.mark.parametrize(
    "origin", ["https://evil.example", "null", "https://accounts.test.evil"]
)
async def test_websso_refuses_unlisted_origins(client, upstream, origin):
    response = await login(client, origin=origin)
    assert response.status_code == 400
    assert "hive_session" not in client.cookies


async def test_websso_fails_closed_without_an_allow_list(app, client):
    app.state.settings.websso_allowed_origins = []
    response = await login(client, origin=ACCOUNTS)
    assert response.status_code == 400
    assert response.json()["message"] == "unexpected origin"


async def test_websso_rejects_a_bad_content_length(client):
    response = await client.post(
        "/auth/websso/",
        content=b"token=abc",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": "abc",
            "Origin": ACCOUNTS,
        },
    )
    assert response.status_code == 400


async def test_cross_site_requests_are_refused_beyond_project_switch(
    member, services
):
    response = await member.post(
        "/api/compute/keypairs",
        json={"name": "k"},
        headers={**csrf_headers(member), "Sec-Fetch-Site": "cross-site"},
    )
    assert response.status_code == 403
    assert response.json()["error"] == "csrf"


async def test_oversized_json_bodies_are_refused(member):
    big = {"name": "k", "public_key": "x" * (1024 * 1024)}
    response = await member.post(
        "/api/compute/keypairs", json=big, headers=csrf_headers(member)
    )
    assert response.status_code == 413
    assert response.json()["error"] == "payload_too_large"
    assert response.json()["request_id"]


async def test_streamed_json_bodies_are_limited_too(member):
    async def chunks():
        yield b'{"name": "k", "public_key": "'
        for _ in range(17):
            yield b"x" * 65536
        yield b'"}'

    response = await member.post(
        "/api/compute/keypairs",
        content=chunks(),
        headers={**csrf_headers(member), "Content-Type": "application/json"},
    )
    assert response.status_code == 413


async def test_validation_errors_do_not_echo_input(member):
    response = await member.post(
        "/api/compute/keypairs",
        json={"name": "k", "type": "hunter2-secret"},
        headers=csrf_headers(member),
    )
    assert response.status_code == 422
    assert "hunter2-secret" not in response.text
    (detail,) = response.json()["detail"]
    assert set(detail) == {"loc", "msg", "type"}


async def test_a_raising_validator_is_a_422_not_a_500(app: FastAPI, client):
    class Strict(BaseModel):
        value: str

        @field_validator("value")
        @classmethod
        def _refuse(cls, value: str) -> str:
            raise ValueError("never valid")

    @app.post("/api/test-validator")
    async def _route(body: Strict):
        return body

    response = await client.post("/api/test-validator", json={"value": "x"})
    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == "Value error, never valid"


async def test_unknown_request_fields_are_refused(member):
    response = await member.post(
        "/api/session/project",
        json={"project_id": "p2", "projectId": "p2"},
        headers=csrf_headers(member),
    )
    assert response.status_code == 422


async def test_bad_query_values_are_a_422(member, services):
    response = await member.get("/api/compute/instances?limit=abc")
    assert response.status_code == 422
    response = await member.get("/api/compute/instances?sort_key=password")
    assert response.status_code == 422


async def test_routing_errors_use_the_envelope(client):
    response = await client.post("/api/session")
    assert response.status_code == 405
    body = response.json()
    assert body["error"] == "method_not_allowed"
    assert body["request_id"]
    assert "GET" in response.headers["allow"]


async def test_inbound_request_ids_are_checked(client):
    bad = await client.get("/healthz", headers={"X-Request-ID": "a\tb"})
    assert bad.headers["x-request-id"].startswith("req-")
    good = await client.get("/healthz", headers={"X-Request-ID": "ing-42"})
    assert good.headers["x-request-id"] == "ing-42"


async def test_upstream_calls_carry_the_request_id(member, services):
    route = services.get(f"{NOVA}/os-keypairs").mock(
        return_value=httpx.Response(200, json={"keypairs": []})
    )
    rid = "req-0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b"
    await member.get("/api/compute/keypairs", headers={"X-Request-ID": rid})
    sent = route.calls.last.request.headers["X-OpenStack-Request-ID"]
    assert sent == rid


async def test_metrics_are_for_allowed_networks_only(app):
    transport = httpx.ASGITransport(app=app, client=("203.0.113.9", 1234))
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as outsider:
        response = await outsider.get("/metrics")
    assert response.status_code == 404
    assert b"hive_http_requests_total" not in response.content


async def test_logout_revokes_every_token_when_configured(
    app, client, upstream
):
    app.state.settings.logout_revokes_tokens = True
    revoke = upstream.delete(f"{conftest.KEYSTONE}/auth/tokens").mock(
        return_value=httpx.Response(204)
    )
    assert (await login(client)).status_code == 303
    response = await client.post(
        "/api/auth/logout", headers=csrf_headers(client)
    )
    assert response.status_code == 204
    revoked = {c.request.headers["X-Subject-Token"] for c in revoke.calls}
    assert revoked == {"unscoped-fresh", "scoped-p1"}


async def test_logout_keeps_tokens_by_default_as_horizon(client, upstream):
    revoke = upstream.delete(f"{conftest.KEYSTONE}/auth/tokens").mock(
        return_value=httpx.Response(204)
    )
    assert (await login(client)).status_code == 303
    await client.post("/api/auth/logout", headers=csrf_headers(client))
    assert not revoke.called
