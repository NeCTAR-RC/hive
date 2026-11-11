import json
from pathlib import Path
import re

import httpx
import pytest
from starlette.routing import Match

from hive.redirects import DATA_FILE

FRONTEND = Path(__file__).resolve().parents[3] / "frontend"


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


async def test_unmatched_routes_share_one_metric_label(client):
    await client.post("/zz-attacker-chosen/segment")
    metrics = (await client.get("/metrics")).text
    assert "zz-attacker-chosen" not in metrics


async def test_openapi_document_is_public_and_docs_page_is_not(client):
    """The contract is served without a session; the docs page stays a
    development aid (``HIVE_DOCS_ENABLED`` is off in the tests)."""
    document = await client.get("/api/openapi.json")
    assert document.status_code == 200
    assert "/api/compute/instances" in document.json()["paths"]
    assert (await client.get("/api/docs")).status_code == 404


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


async def test_horizon_redirects(app, client):
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
    response = await client.get(
        "/ngdetails/OS::Magnum::Cluster/c-1", follow_redirects=False
    )
    assert response.headers["location"] == "/kubernetes/clusters/c-1"
    response = await client.get("/allocation/request/", follow_redirects=False)
    assert response.status_code == 301
    assert response.headers["location"] == (
        app.state.settings.horizon_url.rstrip("/") + "/allocation/request/"
    )


async def test_retired_pages_render_the_spa_shell_with_410(client):
    response = await client.get("/app-catalog/")
    assert response.status_code == 410
    assert response.headers["content-type"].startswith("text/html")
    assert "Hive" in response.text


async def test_retired_pages_without_a_bundle_use_the_envelope(app, client):
    from hive.web import app as web_app

    bare = web_app.create_app(
        app.state.settings.model_copy(update={"web_static": None})
    )
    transport = httpx.ASGITransport(app=bare)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as bare_client:
        response = await bare_client.get("/app-catalog/")
    assert response.status_code == 410
    assert response.json()["error"] == "gone"
    assert response.json()["request_id"]


def _api_route_exists(app, path: str) -> bool:
    """Whether a GET for ``path`` reaches an API route, not the SPA."""
    scope = {"type": "http", "path": path, "method": "GET", "root_path": ""}
    return any(
        route.matches(scope)[0] is Match.FULL
        for route in app.router.routes
        if getattr(route, "path", None) != "/{full_path:path}"
    )


ROUTE_MODULES = ("src/app/*.tsx", "src/features/*/routes.tsx")


def _spa_route_patterns() -> list[re.Pattern]:
    """The SPA's routes, read from its route modules (``$param`` and ``$``
    splats): the shared ones under ``app/`` and one per feature group."""
    source = "".join(
        module.read_text()
        for pattern in ROUTE_MODULES
        for module in sorted(FRONTEND.glob(pattern))
    )
    patterns = []
    for route in re.findall(r'path: "(/[^"]*)"', source):
        parts = []
        for segment in route.strip("/").split("/"):
            if segment == "$":
                parts.append(".+")
            elif segment.startswith("$"):
                parts.append("[^/]+")
            else:
                parts.append(re.escape(segment))
        patterns.append(re.compile("/" + "/".join(parts)))
    return patterns


@pytest.mark.skipif(
    not (FRONTEND / "src" / "app" / "router.tsx").exists(),
    reason="the frontend sources are not checked out",
)
def test_every_redirect_lands_somewhere(app):
    rows = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    pages = _spa_route_patterns()
    for row in rows:
        target = re.sub(r":\w+", "x", row["to"].split("?")[0])
        if row["kind"] == "download":
            assert _api_route_exists(app, target), row
        elif row["kind"] == "page":
            assert any(p.fullmatch(target) for p in pages), row


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
