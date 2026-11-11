import sentry_sdk

from hive.config import Settings
from hive.observability import sentry


def test_scrub_drops_credentials():
    event = {
        "request": {
            "headers": {"X-Auth-Token": "t", "Cookie": "c", "Accept": "a"},
            "cookies": {"hive_session": "s"},
            "data": {"password": "p"},
        }
    }
    request = sentry._scrub(event, None)["request"]
    assert request["headers"] == {
        "X-Auth-Token": "[Filtered]",
        "Cookie": "[Filtered]",
        "Accept": "a",
    }
    assert 'cookies' not in request
    assert 'data' not in request


def make(**overrides) -> Settings:
    return Settings(
        _env_file=None,  # pyright: ignore[reportCallIssue]
        secret_key="s" * 32,
        **overrides,
    )


def test_sentry_stays_off_without_a_dsn(monkeypatch):
    calls = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **kw: calls.append(kw))
    assert sentry.init_sentry(make(), "1.0") is False
    assert calls == []


def test_sentry_never_ships_locals_or_bodies(monkeypatch):
    calls = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **kw: calls.append(kw))
    assert sentry.init_sentry(make(sentry_dsn="https://k@sentry.test/1"), "1")
    (options,) = calls
    assert options["include_local_variables"] is False
    assert options["max_request_body_size"] == "never"
    assert options["send_default_pii"] is False
    assert options["before_send"] is sentry._scrub
