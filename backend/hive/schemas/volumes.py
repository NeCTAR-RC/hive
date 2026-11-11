"""Request bodies for the volume, snapshot and backup endpoints."""

from typing import Annotated, Literal

from pydantic import Field, field_validator, StringConstraints

from hive.nectar import volumes as rules
from hive.schemas import StrictModel, UpdateModel

# Cinder's metadata limits: a key of 1 to 255 characters, a value of up
# to 255.
MetadataKey = Annotated[str, StringConstraints(min_length=1, max_length=255)]
MetadataValue = Annotated[str, StringConstraints(max_length=255)]


class VolumeListQuery(StrictModel):
    """``GET /volumes``: the Cinder filters the list accepts."""

    status: str | None = None
    name: str | None = None
    bootable: str | None = None
    availability_zone: str | None = None

    def cinder_params(self) -> dict:
        return {
            key: value
            for key, value in self.model_dump(exclude_none=True).items()
            if value != ""
        }


class VolumeSource(StrictModel):
    type: Literal["image", "snapshot", "volume"]
    id: str = Field(min_length=1)


class VolumeCreate(StrictModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=255)
    size: int = Field(ge=1)
    availability_zone: str | None = None
    volume_type: str | None = None
    source: VolumeSource | None = None


class VolumeUpdate(UpdateModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=255)
    bootable: bool | None = None


class ExtendRequest(StrictModel):
    new_size: int = Field(ge=1)


class AttachRequest(StrictModel):
    instance_id: str = Field(min_length=1)
    device: str | None = Field(default=None, max_length=255)


class DetachRequest(StrictModel):
    instance_id: str = Field(min_length=1)


class UploadToImageRequest(StrictModel):
    image_name: str = Field(min_length=1, max_length=255)
    # The formats qemu-img can convert to, as Horizon's UploadToImageForm.
    disk_format: Literal["raw", "qcow2", "vmdk", "vdi"] = "raw"
    force: bool = False


class RetypeRequest(StrictModel):
    """Change a volume's type, as Horizon's RetypeForm: the new type by
    name and whether Cinder may move the volume to another backend to
    apply it."""

    volume_type: str = Field(min_length=1, max_length=255)
    migration_policy: Literal["never", "on-demand"] = "never"


class MetadataUpdate(StrictModel):
    """The whole metadata of a volume or a volume snapshot: keys left out
    are removed."""

    metadata: dict[MetadataKey, MetadataValue]


class TransferCreate(StrictModel):
    name: str = Field(max_length=255)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return rules.validate_transfer_name(value)


class TransferAccept(StrictModel):
    """The id and key the giving project passed on, pasted; surrounding
    spaces are dropped. The lengths are Cinder's, as Horizon's
    AcceptTransferForm checks them."""

    transfer_id: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=36),
    ]
    auth_key: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=16),
    ]


class VolumeSnapshotCreate(StrictModel):
    volume_id: str = Field(min_length=1)
    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=255)


class VolumeSnapshotUpdate(UpdateModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=255)


class VolumeBackupCreate(StrictModel):
    volume_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)
    container: str | None = Field(default=None, max_length=255)
    snapshot_id: str | None = None
    incremental: bool = False


class RestoreRequest(StrictModel):
    """Restore into an existing volume, or into a new one in a zone."""

    volume_id: str | None = None
    name: str | None = Field(default=None, max_length=255)
    availability_zone: str | None = None
    volume_type: str | None = None
