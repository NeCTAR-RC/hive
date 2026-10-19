import httpx
from pydantic import BaseModel, field_validator, SecretStr


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


async def test_untrusted_request_ids_are_replaced(client):
    for bad in ("a b", "x" * 129, "a/b", "<script>"):
        response = await client.get("/healthz", headers={"X-Request-ID": bad})
        assert response.headers["x-request-id"].startswith("req-"), bad
    ok = await client.get("/healthz", headers={"X-Request-ID": "req-a.b_c-1"})
    assert ok.headers["x-request-id"] == "req-a.b_c-1"


async def test_unmatched_routes_share_one_metric_label(client):
    await client.post("/zz-attacker-chosen/segment")
    metrics = (await client.get("/metrics")).text
    assert "zz-attacker-chosen" not in metrics


async def test_gone_horizon_path_serves_the_spa(client):
    response = await client.get("/app-catalog/", follow_redirects=False)
    assert response.status_code == 410
    assert "Hive" in response.text
    assert response.headers["cache-control"] == "no-cache"


async def test_gone_without_a_bundle_is_json(settings, redis):
    from hive.web.app import create_app

    bare = settings.model_copy(update={"web_static": None})
    application = create_app(bare, redis=redis, http=httpx.AsyncClient())
    async with application.router.lifespan_context(application):
        transport = httpx.ASGITransport(app=application)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as bare_client:
            response = await bare_client.get("/app-catalog/")
            assert response.status_code == 410
            assert response.json()["error"] == "gone"
            missing = await bare_client.get("/compute/instances")
            assert missing.status_code == 404
        await application.state.http.aclose()


def test_posture_warning_without_websso_origins(settings):
    from structlog.testing import capture_logs

    from hive.web.app import warn_posture

    with capture_logs() as logs:
        warn_posture(settings)
        warn_posture(settings.model_copy(update={"env": "dev"}))
    assert logs == []
    with capture_logs() as logs:
        warn_posture(
            settings.model_copy(
                update={"env": "prod", "websso_allowed_origins": []}
            )
        )
    assert [entry["log_level"] for entry in logs] == ["warning"]


class Strict(BaseModel):
    name: str
    password: str

    @field_validator("name")
    @classmethod
    def no_admin(cls, value: str) -> str:
        if value == "admin":
            raise ValueError("reserved name")
        return value


async def test_validation_errors_are_sanitised(app, client):
    @app.post("/zz-test/strict")
    async def strict(body: Strict):  # pragma: no cover - never reached
        return {}

    response = await client.post(
        "/zz-test/strict", json={"name": "admin", "password": "hunter2"}
    )
    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert detail[0]["msg"] == "Value error, reserved name"
    assert set(detail[0]) == {"type", "loc", "msg"}
    assert "hunter2" not in response.text

    response = await client.post(
        "/zz-test/strict", json={"password": "hunter2"}
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "name"]
    assert "hunter2" not in response.text


def test_sentry_drops_locals_and_scrubs_requests(settings, monkeypatch):
    import sentry_sdk

    from hive.observability import sentry

    assert sentry.init_sentry(settings, "1") is False
    seen = {}
    monkeypatch.setattr(sentry_sdk, "init", lambda **kw: seen.update(kw))
    dsn = settings.model_copy(
        update={"sentry_dsn": SecretStr("https://k@sentry.test/1")}
    )
    assert sentry.init_sentry(dsn, "1") is True
    assert seen["include_local_variables"] is False
    assert seen["send_default_pii"] is False
    event = {
        "request": {
            "headers": {"X-Auth-Token": "t", "Accept": "json"},
            "cookies": {"hive_session": "s"},
            "data": {"password": "p"},
        }
    }
    scrubbed = seen["before_send"](event, None)["request"]
    assert scrubbed == {
        "headers": {"X-Auth-Token": "[Filtered]", "Accept": "json"}
    }


async def test_horizon_redirect_backend_targets_exist(client):
    """Every map row that lands on /api/ names a real API route.

    Unknown /api/ paths fall through to the SPA handler's JSON 404, so a
    target that exists answers anything else (401 here, logged out).
    """
    import json
    import re

    from hive.redirects import DATA_FILE

    rows = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    targets = [row["to"] for row in rows if row["to"].startswith("/api/")]
    assert targets, "the map should have backend download rows"
    for target in targets:
        path = re.sub(r":[A-Za-z_][A-Za-z0-9_]*", "x", target.split("?")[0])
        response = await client.get(path, follow_redirects=False)
        assert response.status_code != 404, target
