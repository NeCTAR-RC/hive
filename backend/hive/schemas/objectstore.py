"""Request bodies for the Object Store panel."""

from typing import Annotated

from pydantic import Field, field_validator, StringConstraints

from hive.nectar import objectstore as rules
from hive.schemas import StrictModel

# A metadata key becomes part of a header name (``X-Container-Meta-<key>``)
# and a value a header value, so both are limited to what HTTP carries
# unchanged: token characters for keys, printable ASCII (no CR/LF) for
# values.
MetadataKey = Annotated[
    str, StringConstraints(pattern=r"^[A-Za-z0-9-]+$", max_length=128)
]
MetadataValue = Annotated[
    str, StringConstraints(pattern=r"^[\x20-\x7e]*$", max_length=256)
]


class ContainerCreate(StrictModel):
    name: str = Field(min_length=1, max_length=256)
    is_public: bool = False
    # Sent as the X-Storage-Policy header; Swift policy names are ASCII.
    storage_policy: str | None = Field(
        default=None, max_length=128, pattern=r"^[A-Za-z0-9_.-]+$"
    )

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        rules.validate_container_name(value)
        return value


class ContainerUpdate(StrictModel):
    """An empty metadata value removes the key."""

    is_public: bool | None = None
    metadata: dict[MetadataKey, MetadataValue] | None = Field(
        default=None, max_length=90
    )


class FolderCreate(StrictModel):
    """``path`` is the folder's full name inside the container, with or
    without the trailing slash."""

    path: str = Field(min_length=1, max_length=1024)


class CopyRequest(StrictModel):
    dest_container: str = Field(min_length=1, max_length=256)
    dest_name: str = Field(min_length=1, max_length=1024)

    @field_validator("dest_name")
    @classmethod
    def _dest_name(cls, value: str) -> str:
        rules.validate_object_name(value)
        return value


class UploadItem(StrictModel):
    name: str = Field(min_length=1, max_length=1024)
    size: int = Field(ge=0)
    content_type: str | None = Field(default=None, max_length=255)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        rules.validate_object_name(value)
        return value


class UploadPlanRequest(StrictModel):
    objects: list[UploadItem] = Field(min_length=1, max_length=200)


class DeleteRequest(StrictModel):
    """Object names (folders end in ``/``) to delete, folders recursively."""

    names: list[str] = Field(min_length=1, max_length=1000)


class ManifestSegment(StrictModel):
    path: str = Field(min_length=1)
    size_bytes: int = Field(ge=0)
    etag: str | None = None


class CompleteUpload(StrictModel):
    segments: list[ManifestSegment] = Field(min_length=1, max_length=1000)
