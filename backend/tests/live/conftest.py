"""Live tests against the rctest cloud.

Enabled only when ``HIVE_TEST_CRED`` names a credentials file in the
``test-cred`` format (``export OS_*=...``). The app runs with a fake Redis
and a real HTTP client, so the whole login path is exercised end to end
against Keystone, manuka, langstroth and friends.
"""

import os
from pathlib import Path
import shlex

import fakeredis.aioredis
import httpx
import pytest

from hive.config import Settings
from hive.web.app import create_app


def read_cred(path: str) -> dict:
    values = {}
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :]
        key, sep, value = line.partition("=")
        if sep:
            parts = shlex.split(value) if value else [""]
            values[key.strip()] = parts[0] if parts else ""
    return values


@pytest.fixture(scope="session")
def cred():
    path = os.environ.get("HIVE_TEST_CRED", "")
    if not path or not Path(path).exists():
        pytest.skip("HIVE_TEST_CRED not set")
    values = read_cred(path)
    for key in ("OS_AUTH_URL", "OS_USERNAME", "OS_PASSWORD"):
        if not values.get(key):
            pytest.skip(f"{key} missing from {path}")
    return values


@pytest.fixture(scope="session")
def keystone_url(cred):
    url = cred["OS_AUTH_URL"].rstrip("/")
    return url if url.endswith("/v3") else url + "/v3"


@pytest.fixture
def live_settings(keystone_url):
    public = "http://testserver"
    return Settings(
        _env_file=None,  # pyright: ignore[reportCallIssue]
        env="test",
        secret_key="live-tests-" + "x" * 32,
        keystone_url=keystone_url,
        public_url=public,
        cookie_secure=False,
        websso_allowed_origins=[],
        web_static=None,
        log_format="console",
        log_level="WARNING",
    )


@pytest.fixture
async def live_app(live_settings):
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    http = httpx.AsyncClient()
    app = create_app(live_settings, redis=redis, http=http)
    async with app.router.lifespan_context(app):
        yield app
    await http.aclose()
    await redis.aclose()


@pytest.fixture
async def live_client(live_app):
    transport = httpx.ASGITransport(app=live_app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        yield client


@pytest.fixture
async def unscoped_token(live_app, cred):
    """A fresh unscoped token from a password login, as dev-login.py does."""
    result = await live_app.state.keystone.password_token(
        cred["OS_USERNAME"],
        cred["OS_PASSWORD"],
        cred.get("OS_USER_DOMAIN_NAME", "Default"),
    )
    return result.token
