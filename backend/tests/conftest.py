"""Shared fixtures: settings, fakeredis, a respx-mocked upstream, the app
with its lifespan run, and an ASGI test client that can log in."""

from datetime import datetime, timedelta, UTC
import json

import fakeredis.aioredis
import httpx
import pytest
import respx

from hive.config import Settings
from hive.web.app import create_app

KEYSTONE = "https://keystone.test/v3"
ACCOUNTS = "https://accounts.test"
HORIZON = "https://horizon.test"
MANUKA = "https://manuka.test"
LANGSTROTH = "https://langstroth.test"
VARROA = "https://varroa.test"
CLOUDKITTY = "https://cloudkitty.test"
WARRE = "https://warre.test"
GNOCCHI = "https://gnocchi.test"
SWIFT = "https://swift.test/swift/v1"
MAGNUM = "https://magnum.test/v1"
OCTAVIA = "https://octavia.test"
HEAT = "https://heat.test/v1/p1"
DESIGNATE = "https://designate.test"
MANILA = "https://manila.test/v2/p1"
TROVE = "https://trove.test/v1.0/p1"

USER = {"id": "u1", "name": "sam@example.edu", "domain": {"id": "default"}}
PROJECTS = [
    {"id": "p1", "name": "pt-50", "domain_id": "default", "enabled": True},
    {"id": "p2", "name": "research", "domain_id": "default", "enabled": True},
    {"id": "p3", "name": "old", "domain_id": "default", "enabled": False},
]
ROLES = {"p1": ["member"], "p2": ["member", "tenantmanager"]}


def catalog():
    def entry(stype, name, url):
        return {
            "type": stype,
            "name": name,
            "endpoints": [
                {"interface": "public", "region": "Melbourne", "url": url}
            ],
        }

    return [
        entry("identity", "keystone", KEYSTONE),
        entry("compute", "nova", "https://nova.test/v2.1"),
        entry("account", "manuka", MANUKA),
        entry("nectar-ops", "langstroth", LANGSTROTH),
        entry("security", "varroa", VARROA),
        entry("rating", "cloudkitty", CLOUDKITTY),
        entry("allocations", "allocations", HORIZON + "/rest_api"),
        entry("nectar-reservation", "warre", WARRE),
        entry("metric", "gnocchi", GNOCCHI),
        entry("object-store", "swift", SWIFT),
        entry("container-infra", "magnum", MAGNUM),
        entry("load-balancer", "octavia", OCTAVIA),
        entry("orchestration", "heat", HEAT),
        entry("dns", "designate", DESIGNATE),
        entry("sharev2", "manilav2", MANILA),
        entry("database", "trove", TROVE),
    ]


def expires_in(seconds: int) -> str:
    when = datetime.now(UTC) + timedelta(seconds=seconds)
    return when.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def token_response(request: httpx.Request, *, token_ttl=3600):
    """Answer POST /auth/tokens for both unscoped and scoped requests."""
    body = json.loads(request.content)
    auth = body["auth"]
    incoming = auth["identity"].get("token", {}).get("id")
    if incoming == "bad-token":
        return httpx.Response(
            404, json={"error": {"message": "Could not find token"}}
        )
    scope = auth.get("scope")
    token_body = {
        "expires_at": expires_in(token_ttl),
        "user": USER,
        "methods": ["token"],
    }
    if scope:
        pid = scope["project"]["id"]
        project = next((p for p in PROJECTS if p["id"] == pid), None)
        if project is None or not project["enabled"]:
            return httpx.Response(
                401, json={"error": {"message": "not authorized"}}
            )
        token_body["project"] = {
            "id": pid,
            "name": project["name"],
            "domain": {"id": "default"},
        }
        token_body["roles"] = [{"name": r} for r in ROLES.get(pid, [])]
        token_body["catalog"] = catalog()
        subject = f"scoped-{pid}"
    else:
        subject = "unscoped-fresh"
    return httpx.Response(
        201,
        json={"token": token_body},
        headers={"X-Subject-Token": subject},
    )


def mock_keystone(router: respx.MockRouter, **kwargs):
    router.post(f"{KEYSTONE}/auth/tokens").mock(
        side_effect=lambda request: token_response(request, **kwargs)
    )
    router.get(f"{KEYSTONE}/auth/projects").mock(
        return_value=httpx.Response(200, json={"projects": PROJECTS})
    )
    router.get(KEYSTONE).mock(
        return_value=httpx.Response(200, json={"version": {}})
    )
    router.delete(f"{KEYSTONE}/auth/tokens").mock(
        return_value=httpx.Response(204)
    )


@pytest.fixture
def static_dir(tmp_path):
    root = tmp_path / "static"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text("<!doctype html><title>Hive</title>")
    (root / "assets" / "app-abc123.js").write_text("console.log(1)")
    return root


@pytest.fixture
def settings(static_dir):
    return Settings(
        _env_file=None,  # pyright: ignore[reportCallIssue]
        env="test",
        secret_key="x" * 32,
        keystone_url=KEYSTONE,
        public_url="http://testserver",
        cookie_secure=False,
        login_url=f"{ACCOUNTS}/login",
        websso_allowed_origins=[ACCOUNTS, "http://127.0.0.1:8765"],
        horizon_url=HORIZON,
        allocation_api_url=f"{HORIZON}/rest_api",
        outage_base_url="https://status.test/outages/",
        rss_url="https://news.test/feed/",
        web_static=static_dir,
        log_format="console",
        role_member_id="r-member",
        role_tenantmanager_id="r-tm",
        orcid_link_url="https://orcid.test/oauth/authorize?client_id=x",
        orcid_unlink_url="https://manuka.test/orcid/unlink/",
        password_reset_token="reset-secret",
        password_reset_delay=0,
    )


@pytest.fixture
async def redis():
    client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    yield client
    await client.aclose()


@pytest.fixture
def upstream():
    with respx.mock(assert_all_called=False) as router:
        mock_keystone(router)
        yield router


@pytest.fixture
async def app(settings, redis, upstream):
    http = httpx.AsyncClient()
    application = create_app(settings, redis=redis, http=http)
    async with application.router.lifespan_context(application):
        yield application
    await http.aclose()


@pytest.fixture
async def client(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as test_client:
        yield test_client


async def login(client: httpx.AsyncClient, token="good-token", **extra):
    """POST the manuka form exactly as the browser would."""
    data = {"token": token, "tenant_id": extra.pop("tenant_id", "")}
    params = {"next": extra.pop("next")} if "next" in extra else None
    headers = {"Origin": extra.pop("origin", ACCOUNTS)}
    response = await client.post(
        "/auth/websso/",
        data=data,
        params=params,
        headers=headers,
        follow_redirects=False,
    )
    return response


def csrf_headers(client: httpx.AsyncClient) -> dict:
    return {"X-CSRF-Token": client.cookies.get("hive_csrf", "")}


@pytest.fixture
async def logged_in(client):
    response = await login(client)
    assert response.status_code == 303, response.text
    return client
