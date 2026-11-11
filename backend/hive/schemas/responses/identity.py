"""Replies of the Identity dashboard panels: Project Members, Application
Credentials, EC2 credentials and the user's Keystone credentials."""

from pydantic import ConfigDict

from hive.schemas.responses import Items, ResponseModel


class MemberRow(ResponseModel):
    """One user and role on the Members panel. ``id`` is
    ``"{user_id}-{role_id}"``; nobody may remove their own rows."""

    id: str
    user_id: str
    name: str
    role_id: str | None
    role_name: str
    is_self: bool
    can_remove: bool


class RoleChoice(ResponseModel):
    """A role the Add Member form offers: member or tenantmanager."""

    id: str
    name: str


class MembersResponse(Items[MemberRow]):
    roles: list[RoleChoice]


class AppCredRole(ResponseModel):
    id: str | None
    name: str | None
    domain_id: str | None


class AccessRule(ResponseModel):
    """A Keystone access rule, passed through as Keystone returns it."""

    model_config = ConfigDict(extra="allow")

    service: str | None = None
    method: str | None = None
    path: str | None = None


class ApplicationCredential(ResponseModel):
    id: str
    name: str
    description: str | None
    project_id: str | None
    expires_at: str | None
    unrestricted: bool
    roles: list[AppCredRole]
    access_rules: list[AccessRule]


class ApplicationCredentialCreated(ApplicationCredential):
    """The create reply: the only one that ever carries the secret."""

    secret: str | None


class ApplicationCredentialOptions(ResponseModel):
    """What the create form needs: the token's role names, the prefilled
    expiry date and the openrc details."""

    roles: list[str]
    default_expiration_date: str
    auth_url: str
    region: str


class Ec2Credential(ResponseModel):
    access: str
    secret: str
    project_id: str


class Ec2Response(ResponseModel):
    """The project's EC2 pair, ``None`` when it has none; ``created`` says
    whether this request made it."""

    credential: Ec2Credential | None
    created: bool


class Credential(ResponseModel):
    """A generic Keystone credential (TOTP, EC2 or certificate)."""

    id: str
    type: str
    project_id: str | None
    blob: str
