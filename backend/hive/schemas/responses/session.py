"""Replies the SPA shell is built from: the public configuration, the
session probe, ``/me`` and the project list."""

from typing import Literal

from hive.schemas.responses import Items, ResponseModel


class PublicConfig(ResponseModel):
    """Settings the SPA needs before anyone logs in; none are secret."""

    site_name: str
    env: Literal["dev", "test", "prod"]
    version: str
    login_url: str
    login_base_url: str
    receiver_url: str
    horizon_url: str
    help_url: str
    outage_base_url: str
    ga_id: str | None
    freshworks_widget_id: str | None
    banner_url: str | None
    trial_project_prefix: str


class SignedOut(ResponseModel):
    """The session probe without a session: where to log in."""

    authenticated: Literal[False]
    login_url: str
    server_time: float


class SignedIn(ResponseModel):
    """The session probe with a session. ``expires_at`` (epoch seconds) is
    the earlier of the token expiry and the idle timeout."""

    authenticated: Literal[True]
    user_id: str
    project_id: str | None
    expires_at: float
    server_time: float
    csrf_token: str


class UserRef(ResponseModel):
    id: str
    name: str
    domain_id: str | None


class ProjectRef(ResponseModel):
    id: str
    name: str
    domain_id: str | None
    enabled: bool


class CurrentProject(ProjectRef):
    is_trial: bool


class Capabilities(ResponseModel):
    """What the user may do here. ``services`` maps each panel's service
    key (``hive.services.me.SERVICE_KEYS``) to whether the project's
    catalog has it."""

    tenantmanager: bool
    user_lookup: bool
    services: dict[str, bool]


class SessionTimes(ResponseModel):
    """The token's hard expiry and the server clock, both epoch seconds,
    so the SPA can warn before the session ends whatever its own clock
    says."""

    expires_at: float
    server_time: float


class Me(ResponseModel):
    user: UserRef
    project: CurrentProject
    roles: list[str]
    projects: list[ProjectRef]
    capabilities: Capabilities
    session: SessionTimes


class ProjectList(Items[ProjectRef]):
    current_project_id: str | None
