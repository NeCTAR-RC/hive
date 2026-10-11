import httpx


async def test_healthz(client):
    body = (await client.get("/healthz")).json()
    assert body["status"] == "ok"


async def test_readyz_reports_checks(client, upstream):
    response = await client.get("/readyz")
    assert response.status_code == 200
    assert response.json()["checks"] == {"redis": "ok", "keystone": "ok"}
    upstream.get("https://keystone.test/v3").mock(
        side_effect=httpx.ConnectError("down")
    )
    response = await client.get("/readyz")
    assert response.status_code == 200  # keystone is informational
    assert response.json()["checks"]["keystone"] == "degraded"


async def test_metrics_exposed(client):
    await client.get("/healthz")
    response = await client.get("/metrics")
    assert response.status_code == 200
    assert b"hive_http_requests_total" in response.content


async def test_security_headers_and_request_id(client):
    response = await client.get("/healthz")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-request-id"].startswith("req-")
    assert "content-security-policy-report-only" in response.headers
    echoed = await client.get("/healthz", headers={"X-Request-ID": "abc"})
    assert echoed.headers["x-request-id"] == "abc"


async def test_spa_fallback_and_assets(client):
    index = await client.get("/compute/instances")
    assert index.status_code == 200
    assert "Hive" in index.text
    assert index.headers["cache-control"] == "no-cache"
    asset = await client.get("/assets/app-abc123.js")
    assert asset.status_code == 200
    assert "immutable" in asset.headers["cache-control"]
    missing_api = await client.get("/api/does-not-exist")
    assert missing_api.status_code == 404
    assert missing_api.json()["error"] == "not_found"


async def test_horizon_redirects(client):
    response = await client.get(
        "/project/instances/abc/", follow_redirects=False
    )
    assert response.status_code == 301
    assert response.headers["location"] == "/compute/instances/abc"
    response = await client.get(
        "/settings/my-details/?orcid=linked", follow_redirects=False
    )
    assert response.headers["location"] == "/account/my-details?orcid=linked"
    response = await client.get("/app-catalog/", follow_redirects=False)
    assert response.status_code == 410


async def test_path_traversal_is_blocked(client):
    response = await client.get("/assets/../../etc/passwd")
    assert response.status_code in (200, 404)
    assert "root:" not in response.text


async def test_validation_errors_use_the_envelope(logged_in):
    from tests.conftest import csrf_headers

    response = await logged_in.post(
        "/api/session/project",
        json={"nope": 1},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 422
    assert response.json()["error"] == "validation"
