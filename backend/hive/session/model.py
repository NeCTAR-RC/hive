"""What a session holds. Serialised as JSON into one Redis hash field."""

from datetime import datetime
import time
from typing import ClassVar

from pydantic import BaseModel, Field


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
    # repr=False keeps the token out of every repr (logs, tracebacks,
    # error reporting); serialisation is unaffected.
    token: str = Field(repr=False)
    expires_at: datetime


class ScopedToken(TokenInfo):
    project: ProjectRef
    roles: list[str] = Field(default_factory=list)
    catalog: list[dict] = Field(default_factory=list)
    last_used: float = Field(default_factory=time.time)


class SessionData(BaseModel):
    """Everything Hive remembers about a logged-in browser.

    ``unscoped`` is the manuka-issued token that every rescope derives from
    (Horizon does the same). ``scoped`` caches one project-scoped token and
    its catalog per project the user has switched to, bounded by
    ``MAX_SCOPED`` and evicted least-recently-used.
    """

    MAX_SCOPED: ClassVar[int] = 20

    v: int = 1
    user: UserRef
    unscoped: TokenInfo
    current_project_id: str | None = None
    projects: list[ProjectRef] = Field(default_factory=list)
    scoped: dict[str, ScopedToken] = Field(default_factory=dict)
    csrf: str
    created_at: float = Field(default_factory=time.time)

    @property
    def current(self) -> ScopedToken | None:
        if self.current_project_id is None:
            return None
        return self.scoped.get(self.current_project_id)

    def put_scoped(self, scoped: ScopedToken) -> None:
        self.scoped[scoped.project.id] = scoped
        while len(self.scoped) > self.MAX_SCOPED:
            oldest = min(
                (pid for pid in self.scoped if pid != self.current_project_id),
                key=lambda pid: self.scoped[pid].last_used,
            )
            del self.scoped[oldest]
