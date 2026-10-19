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
    settings = make(login_url="https://accounts.test/login?x=1")
    assert settings.login_start_url().startswith(
        "https://accounts.test/login?x=1&return-path="
    )
