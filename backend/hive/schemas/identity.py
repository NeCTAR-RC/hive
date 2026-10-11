"""Request bodies for the Identity dashboard panels."""

from typing import Literal

from pydantic import BaseModel, Field


class MemberAdd(BaseModel):
    """``nectar_dashboard/project_members/forms.py:32-45``: the username
    is the account email, the role one of the two configured ids."""

    email: str = Field(
        min_length=3, max_length=255, pattern=r"^[^@\s]+@[^@\s]+$"
    )
    role_id: str = Field(min_length=1)


class ApplicationCredentialCreate(BaseModel):
    """``identity/application_credentials/forms.py:42-73``."""

    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    secret: str | None = Field(default=None, max_length=255)
    expiration_date: str | None = Field(
        default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"
    )
    expiration_time: str | None = Field(
        default=None, pattern=r"^\d{2}:\d{2}(:\d{2})?$"
    )
    roles: list[str] = Field(default_factory=list)
    access_rules: str | None = None
    unrestricted: bool = False


class CredentialCreate(BaseModel):
    """``identity/credentials/forms.py:22-70``: type, data and project."""

    type: Literal["totp", "ec2", "cert"]
    blob: str = Field(min_length=1)
    project_id: str | None = None
