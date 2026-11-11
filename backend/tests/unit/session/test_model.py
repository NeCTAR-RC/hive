from datetime import datetime, UTC

from pydantic import SecretStr

from hive.clients.base import endpoints_for
from hive.session.model import ProjectRef, ScopedToken, SessionData, TokenInfo
from tests.fixtures.loader import fixture
from tests.unit.sessions import make_session


def test_current_is_the_current_projects_token():
    data = make_session(projects=2)
    assert data.current is data.scoped["p0"]


def test_no_current_project_means_no_current_token():
    data = make_session()
    data.current_project_id = None
    assert data.current is None


def test_tokens_never_show_in_reprs_or_python_dumps():
    data = make_session()
    data.unscoped = TokenInfo(
        token="gAAAAA-secret", expires_at=data.unscoped.expires_at
    )
    shown = [repr(data), str(data), repr(data.current), data.model_dump()]
    for text in map(str, shown):
        assert "gAAAAA-secret" not in text
        assert "scoped-0" not in text


def test_tokens_survive_the_json_round_trip():
    data = make_session()
    reloaded = SessionData.model_validate_json(data.model_dump_json())
    assert reloaded.unscoped.token.get_secret_value() == "unscoped"
    assert reloaded.current is not None
    assert reloaded.current.token.get_secret_value() == "scoped-0"


def test_a_scoped_token_stays_small_with_a_full_catalog():
    """Each request reads one project token: with Nectar's catalog cut
    down to one URL per service it stays a few KB (a full catalog per
    token was about 23 KB)."""
    catalog = fixture("keystone", "catalog")["catalog"]
    token = ScopedToken(
        token=SecretStr("gAAAAA" + "x" * 177),
        expires_at=datetime.now(UTC),
        project=ProjectRef(id="0" * 32, name="project", domain_id="default"),
        roles=["member", "reader"],
        endpoints=endpoints_for(catalog, "public", "Melbourne"),
    )
    assert len(token.endpoints) == len(catalog)
    assert len(token.model_dump_json()) < 3000
