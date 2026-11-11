import pytest

from hive.session.store import SessionStore


@pytest.fixture
def store(redis):
    return SessionStore(redis, "secret" * 4, timeout=600)
