"""Request bodies for the Share (Manila) panels."""

from typing import Literal, Self

from pydantic import Field, model_validator

from hive.nectar import shares as rules
from hive.schemas import StrictModel


class ShareCreate(StrictModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)
    protocol: str = Field(min_length=1, max_length=20)
    size: int = Field(ge=1, le=100000)
    share_type: str = Field(min_length=1, max_length=255)
    availability_zone: str | None = None
    snapshot_id: str | None = None
    share_group_id: str | None = None
    metadata: str | None = Field(default=None, max_length=10000)
    is_public: bool = False


class ShareUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)
    is_public: bool | None = None


class ShareMetadata(StrictModel):
    metadata: str = Field(max_length=10000)


class ShareResize(StrictModel):
    size: int = Field(ge=1, le=100000)


class ShareRevert(StrictModel):
    snapshot_id: str = Field(min_length=1)


class AccessRuleCreate(StrictModel):
    access_type: Literal["ip", "user", "cert", "cephx"]
    access_to: str = Field(min_length=1, max_length=255)
    access_level: Literal["rw", "ro"] = "rw"

    @model_validator(mode="after")
    def _access(self) -> Self:
        rules.validate_access(
            self.access_type, self.access_to, self.access_level
        )
        return self


class ShareSnapshotCreate(StrictModel):
    share_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


class ShareSnapshotUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


class SnapshotAccessCreate(StrictModel):
    """Snapshot access is always read-write (``rw``), as in Horizon."""

    access_type: Literal["ip", "user", "cert", "cephx"]
    access_to: str = Field(min_length=1, max_length=255)

    @model_validator(mode="after")
    def _access(self) -> Self:
        rules.validate_access(self.access_type, self.access_to, "rw")
        return self


class SecurityServiceCreate(StrictModel):
    name: str = Field(min_length=1, max_length=255)
    type: Literal["active_directory", "ldap", "kerberos"]
    dns_ip: str = Field(min_length=1, max_length=255)
    server: str = Field(min_length=1, max_length=255)
    domain: str = Field(min_length=1, max_length=255)
    ou: str | None = Field(default=None, max_length=255)
    user: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=255)


class SecurityServiceUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    dns_ip: str | None = Field(default=None, max_length=255)
    server: str | None = Field(default=None, max_length=255)
    domain: str | None = Field(default=None, max_length=255)
    ou: str | None = Field(default=None, max_length=255)
    user: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=255)


class ShareGroupCreate(StrictModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)
    share_group_type_id: str | None = None
    share_types: list[str] | None = None
    availability_zone: str | None = None
    snapshot_id: str | None = None


class ShareGroupUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


class ShareGroupSnapshotCreate(StrictModel):
    share_group_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)
