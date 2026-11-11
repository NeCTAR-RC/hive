"""What a session holds. ``SessionStore`` keeps each part in its own
Redis hash field, so writers never rewrite each other's data."""

from datetime import datetime
import time
from typing import Annotated, ClassVar

from pydantic import BaseModel, Field, PlainSerializer, SecretStr

# Bumped whenever the stored shape changes; a session stored with another
# version reads as logged out.
SESSION_VERSION = 2

# A token prints as ``**********`` in reprs, logs and error reports, and
# is written in clear only when the session is serialised for Redis.
# Read it with ``get_secret_value()`` at the HTTP boundary and nowhere else.
Token = Annotated[
    SecretStr,
    PlainSerializer(
        lambda value: value.get_secret_value(),
        return_type=str,
        when_used="json",
    ),
]


class UserRef(BaseModel):
    id: str
    name: str
    domain_id: str | None = None


class ProjectRef(BaseModel):
    id: str
    name: str
    domain_id: str | None = None
    enabled: bool = True


class TokenInfo(BaseModel):
    token: Token
    expires_at: datetime


class ScopedToken(TokenInfo):
    """A project-scoped token. ``endpoints`` is the catalog cut down at
    scope time to the one URL per service type Hive calls (the configured
    region and interface), which is all a request needs."""

    project: ProjectRef
    roles: list[str] = Field(default_factory=list)
    endpoints: dict[str, str] = Field(default_factory=dict)
    last_used: float = Field(default_factory=time.time)


class SessionCore(BaseModel):
    """The part of a session written once, at login."""

    v: int = SESSION_VERSION
    user: UserRef
    csrf: str
    created_at: float = Field(default_factory=time.time)


class SessionData(SessionCore):
    """Everything a request knows about its logged-in browser.

    ``unscoped`` is the manuka-issued token that every rescope derives from
    (Horizon does the same). ``scoped`` holds the project tokens loaded for
    this request: the current project's, plus any scoped while it runs.
    The store keeps up to ``MAX_SCOPED`` of them per session, evicting the
    least recently used.
    """

    MAX_SCOPED: ClassVar[int] = 20

    unscoped: TokenInfo
    current_project_id: str | None = None
    projects: list[ProjectRef] = Field(default_factory=list)
    scoped: dict[str, ScopedToken] = Field(default_factory=dict)

    @property
    def current(self) -> ScopedToken | None:
        if self.current_project_id is None:
            return None
        return self.scoped.get(self.current_project_id)
