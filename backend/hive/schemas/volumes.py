"""Request bodies for the volume, snapshot and backup endpoints."""

from typing import Literal

from pydantic import BaseModel, Field


class VolumeSource(BaseModel):
    type: Literal["image", "snapshot", "volume"]
    id: str = Field(min_length=1)


class VolumeCreate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=255)
    size: int = Field(ge=1)
    availability_zone: str | None = None
    volume_type: str | None = None
    source: VolumeSource | None = None


class VolumeUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=255)
    bootable: bool | None = None


class ExtendRequest(BaseModel):
    new_size: int = Field(ge=1)


class AttachRequest(BaseModel):
    instance_id: str = Field(min_length=1)
    device: str | None = Field(default=None, max_length=255)


class DetachRequest(BaseModel):
    instance_id: str = Field(min_length=1)


class UploadToImageRequest(BaseModel):
    image_name: str = Field(min_length=1, max_length=255)
    # The formats qemu-img can convert to, as Horizon's UploadToImageForm.
    disk_format: Literal["raw", "qcow2", "vmdk", "vdi"] = "raw"
    force: bool = False


class SnapshotCreate(BaseModel):
    volume_id: str = Field(min_length=1)
    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=255)


class SnapshotUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=255)


class BackupCreate(BaseModel):
    volume_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)
    container: str | None = Field(default=None, max_length=255)
    snapshot_id: str | None = None
    incremental: bool = False


class RestoreRequest(BaseModel):
    """Restore into an existing volume, or into a new one in a zone."""

    volume_id: str | None = None
    name: str | None = Field(default=None, max_length=255)
    availability_zone: str | None = None
    volume_type: str | None = None
