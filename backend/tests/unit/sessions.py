"""Sessions to test with: one user, ``projects`` scoped projects."""

from datetime import datetime, timedelta, UTC

from hive.session.model import (
    ProjectRef,
    ScopedToken,
    SessionData,
    TokenInfo,
    UserRef,
)


def scoped_token(index: int, expires: datetime) -> ScopedToken:
    return ScopedToken(
        token=f"scoped-{index}",
        expires_at=expires,
        project=ProjectRef(id=f"p{index}", name=f"proj{index}"),
        roles=["member"],
        endpoints={"compute": f"https://nova.test/{index}"},
        last_used=float(index),
    )


def make_session(expires_in=3600, projects=1) -> SessionData:
    expires = datetime.now(UTC) + timedelta(seconds=expires_in)
    tokens = [scoped_token(index, expires) for index in range(projects)]
    return SessionData(
        user=UserRef(id="u1", name="sam"),
        unscoped=TokenInfo(token="unscoped", expires_at=expires),
        csrf="csrf-token",
        current_project_id="p0",
        projects=[token.project for token in tokens],
        scoped={token.project.id: token for token in tokens},
    )
