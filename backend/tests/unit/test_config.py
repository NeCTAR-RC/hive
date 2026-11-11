from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import pytest

from hive.config import Settings


def make(**overrides: Any) -> Settings:
    overrides.setdefault("secret_key", "s" * 32)
    # _env_file is a pydantic-settings init argument Pyright cannot see.
    return Settings(_env_file=None, **overrides)  # pyright: ignore[reportCallIssue]


def test_comma_lists_are_split():
    settings = make(
        user_lookup_roles="helpdesk, admin",
        websso_allowed_origins="https://a.test,https://b.test",
        resize_hidden_flavor_classes="",
    )
    assert settings.user_lookup_roles == ["helpdesk", "admin"]
    assert settings.websso_allowed_origins == [
        "https://a.test",
        "https://b.test",
    ]
    assert settings.resize_hidden_flavor_classes == []


def test_secret_key_must_be_long():
    with pytest.raises(ValueError):
        make(secret_key="short")


def test_receiver_url_joins_public_url_and_path():
    settings = make(public_url="https://hive.test/")
    assert settings.receiver_url == "https://hive.test/auth/websso/"


def test_login_start_url_folds_next_into_return_path():
    settings = make(
        public_url="https://hive.test",
        login_url="https://accounts.test/login",
    )
    url = settings.login_start_url("/compute/instances?page=2")
    parsed = urlparse(url)
    assert parsed.netloc == "accounts.test"
    return_path = parse_qs(parsed.query)["return-path"][0]
    assert return_path.startswith("https://hive.test/auth/websso/?next=")
    assert unquote(return_path.split("next=")[1]) == (
        "/compute/instances?page=2"
    )


def test_login_start_url_appends_to_existing_query():
    settings = make(
        public_url="https://hive.test",
        login_url="https://accounts.test/login?x=1",
    )
    url = settings.login_start_url()
    assert url.startswith("https://accounts.test/login?x=1&return-path=")
    assert parse_qs(urlparse(url).query)["return-path"] == [
        "https://hive.test/auth/websso/"
    ]


PROD = {
    "env": "prod",
    "websso_allowed_origins": "https://accounts.test",
    "public_url": "https://dashboard.test",
    "keystone_url": "https://keystone.test/v3",
}


def test_production_settings_pass_when_complete():
    assert make(**PROD).env == "prod"


@pytest.mark.parametrize(
    ("override", "problem"),
    [
        ({"websso_allowed_origins": ""}, "HIVE_WEBSSO_ALLOWED_ORIGINS"),
        ({"cookie_secure": False}, "HIVE_COOKIE_SECURE"),
        ({"public_url": "http://dashboard.test"}, "HIVE_PUBLIC_URL"),
        ({"docs_enabled": True}, "HIVE_DOCS_ENABLED"),
    ],
)
def test_production_refuses_unsafe_defaults(override, problem):
    with pytest.raises(ValueError, match=problem):
        make(**{**PROD, **override})


def test_production_needs_an_explicit_keystone():
    settings = {k: v for k, v in PROD.items() if k != "keystone_url"}
    with pytest.raises(ValueError, match="HIVE_KEYSTONE_URL"):
        make(**settings)


def test_development_keeps_its_defaults():
    assert make(env="dev").websso_allowed_origins == []


def test_every_comma_list_reads_from_the_environment(monkeypatch):
    monkeypatch.setenv("HIVE_MANILA_SHARE_PROTOCOLS", "NFS, CephFS")
    monkeypatch.setenv("HIVE_SUBNET_DEFAULT_DNS_NAMESERVERS", "8.8.8.8")
    monkeypatch.setenv("HIVE_FORWARDED_ALLOW_IPS", "10.0.0.1,10.0.0.2")
    settings = make()
    assert settings.manila_share_protocols == ["NFS", "CephFS"]
    assert settings.subnet_default_dns_nameservers == ["8.8.8.8"]
    assert settings.forwarded_allow_ips == ["10.0.0.1", "10.0.0.2"]


def test_metrics_networks_must_parse():
    with pytest.raises(ValueError):
        make(metrics_allowed_networks="10.0.0.0/8,not-a-network")
