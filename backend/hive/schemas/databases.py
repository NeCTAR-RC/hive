"""Request bodies for the Database (Trove) panels."""

from pydantic import BaseModel, Field


class InstanceLaunch(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    flavor: str = Field(min_length=1)
    volume: int = Field(ge=1, le=10000)
    datastore: str = Field(min_length=1)
    version: str = Field(min_length=1)
    network_id: str = Field(min_length=1)
    availability_zone: str | None = None
    allowed_cidrs: list[str] = Field(min_length=1, max_length=50)
    databases: str | None = Field(default=None, max_length=2000)
    user: str | None = Field(default=None, max_length=128)
    password: str | None = Field(default=None, max_length=255)
    host: str | None = Field(default=None, max_length=255)
    configuration: str | None = None
    backup_id: str | None = None


class InstanceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    allowed_cidrs: list[str] | None = Field(default=None, max_length=50)


class ResizeVolume(BaseModel):
    size: int = Field(ge=1, le=10000)


class ResizeInstance(BaseModel):
    flavor: str = Field(min_length=1)


class UpgradeInstance(BaseModel):
    version_id: str = Field(min_length=1)


class AttachConfiguration(BaseModel):
    configuration_id: str = Field(min_length=1)


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=255)
    host: str | None = Field(default=None, max_length=255)
    databases: list[str] = Field(default_factory=list, max_length=100)


class UserAccess(BaseModel):
    databases: list[str] = Field(min_length=1, max_length=100)


class DatabaseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    character_set: str | None = Field(default=None, max_length=64)
    collate: str | None = Field(default=None, max_length=64)


class BackupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    instance_id: str = Field(min_length=1)
    description: str | None = Field(default=None, max_length=512)
    parent_id: str | None = None


class ConfigurationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=255)
    datastore: str = Field(min_length=1)
    version: str = Field(min_length=1)


class ConfigurationValues(BaseModel):
    """``values`` as strings from the form; coerced by the parameter spec."""

    values: dict[str, str] = Field(max_length=200)
