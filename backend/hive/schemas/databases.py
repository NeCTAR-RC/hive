"""Request bodies for the Database (Trove) panels."""

from typing import Self

from pydantic import Field, field_validator, model_validator

from hive.nectar import databases as rules
from hive.schemas import StrictModel


class InstanceLaunch(StrictModel):
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

    @field_validator("allowed_cidrs")
    @classmethod
    def _allowed_cidrs(cls, value: list[str]) -> list[str]:
        return rules.validate_cidrs(value)

    @model_validator(mode="after")
    def _launch(self) -> Self:
        rules.validate_launch(
            name=self.name,
            volume=self.volume,
            datastore=self.datastore,
            version=self.version,
            flavor=self.flavor,
            network=self.network_id,
        )
        rules.validate_initial_user(
            self.user, self.password, rules.split_databases(self.databases)
        )
        return self


class InstanceUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    allowed_cidrs: list[str] | None = Field(default=None, max_length=50)

    @field_validator("allowed_cidrs")
    @classmethod
    def _allowed_cidrs(cls, value: list[str] | None) -> list[str] | None:
        return None if value is None else rules.validate_cidrs(value)


class ResizeVolume(StrictModel):
    size: int = Field(ge=1, le=10000)


class DatabaseResizeInstance(StrictModel):
    flavor: str = Field(min_length=1)


class UpgradeInstance(StrictModel):
    version_id: str = Field(min_length=1)


class AttachConfiguration(StrictModel):
    configuration_id: str = Field(min_length=1)


class UserCreate(StrictModel):
    name: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=rules.PASSWORD_MIN_LENGTH, max_length=255)
    host: str | None = Field(default=None, max_length=255)
    databases: list[str] = Field(default_factory=list, max_length=100)


class UserUpdate(StrictModel):
    """A user's new name, password or host; at least one is given."""

    name: str | None = Field(default=None, max_length=128)
    password: str | None = Field(
        default=None, min_length=rules.PASSWORD_MIN_LENGTH, max_length=255
    )
    host: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def _changes(self) -> Self:
        rules.user_update_fields(self.name, self.password, self.host)
        return self


class UserAccess(StrictModel):
    databases: list[str] = Field(min_length=1, max_length=100)


class DatabaseCreate(StrictModel):
    name: str = Field(min_length=1, max_length=128)
    character_set: str | None = Field(default=None, max_length=64)
    collate: str | None = Field(default=None, max_length=64)


class DatabaseBackupCreate(StrictModel):
    name: str = Field(min_length=1, max_length=80)
    instance_id: str = Field(min_length=1)
    description: str | None = Field(default=None, max_length=512)
    parent_id: str | None = None


class DatabaseLogAction(StrictModel):
    """The action to take on a guest log (``logs/tables.py``)."""

    action: rules.LogAction


class ConfigurationCreate(StrictModel):
    name: str = Field(min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=255)
    datastore: str = Field(min_length=1)
    version: str = Field(min_length=1)


class ConfigurationValues(StrictModel):
    """``values`` as strings from the form; coerced by the parameter spec."""

    values: dict[str, str] = Field(max_length=200)
