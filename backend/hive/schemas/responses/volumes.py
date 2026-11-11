"""Replies of the volume panels: volumes, snapshots, backups and types."""

from pydantic import ConfigDict

from hive.schemas.responses import (
    Accepted,
    AvailabilityZone,
    ResponseModel,
)


class VolumeAttachment(ResponseModel):
    id: str | None
    server_id: str | None
    device: str | None
    attached_at: str | None


class VolumeImage(ResponseModel):
    """The image a volume was created from, as Cinder recorded it in the
    volume's image metadata."""

    id: str
    name: str | None


class VolumeFault(ResponseModel):
    """Cinder's newest user message about a volume in an error status,
    such as why no backend could hold it (the Messages tab of Horizon's
    volume detail)."""

    message: str
    created: str | None


class Volume(ResponseModel):
    """A volume. ``has_snapshots`` is ``None`` when the reply did not
    check (a create, or the volumes the create options offer); ``fault``
    is read only by the detail of a volume in an error status, and is
    ``None`` everywhere else."""

    id: str
    name: str
    description: str | None
    size_gb: int | None
    status: str
    volume_type: str | None
    availability_zone: str | None
    bootable: bool
    encrypted: bool
    multiattach: bool
    attachments: list[VolumeAttachment]
    snapshot_id: str | None
    source_volume_id: str | None
    image: VolumeImage | None
    group_id: str | None
    metadata: dict[str, str]
    created_at: str | None
    updated_at: str | None
    has_snapshots: bool | None
    fault: VolumeFault | None


class VolumeSnapshot(ResponseModel):
    id: str
    name: str
    description: str | None
    size_gb: int | None
    status: str
    volume_id: str | None
    volume_name: str | None
    progress: str | None
    group_snapshot_id: str | None
    metadata: dict[str, str]
    created_at: str | None
    updated_at: str | None


class VolumeBackup(ResponseModel):
    id: str
    name: str
    description: str | None
    size_gb: int | None
    status: str
    availability_zone: str | None
    volume_id: str | None
    volume_name: str | None
    snapshot_id: str | None
    snapshot_name: str | None
    container: str | None
    is_incremental: bool
    has_dependent_backups: bool
    data_timestamp: str | None
    fail_reason: str | None
    created_at: str | None
    updated_at: str | None


class VolumeType(ResponseModel):
    """A volume type; ``zones`` lists the zones its
    ``RESKEY:availability_zones`` extra spec limits it to, ``None`` for any
    zone."""

    id: str
    name: str
    description: str | None
    is_public: bool
    zones: list[str] | None


class VolumeLimits(ResponseModel):
    """Cinder's absolute limits passed through by name
    (``maxTotalVolumeGigabytes``, ``totalGigabytesUsed`` and the like),
    with negative "used" figures raised to 0. Which names appear is
    Cinder's choice, so none is declared."""

    model_config = ConfigDict(extra="allow")
    __pydantic_extra__: dict[str, int]


class VolumeOptionImage(ResponseModel):
    """An active image the create volume form offers as a source."""

    id: str
    name: str | None
    size: int | None
    min_disk: int
    disk_format: str | None
    is_snapshot: bool


class VolumeOptionError(ResponseModel):
    """Why one section of the create options could not be loaded."""

    error: str
    message: str


class VolumeOptions(ResponseModel):
    """Everything the create volume and restore forms need. A section that
    failed is empty and named in ``errors``."""

    availability_zones: list[AvailabilityZone]
    volume_types: list[VolumeType]
    has_zoned_types: bool
    images: list[VolumeOptionImage]
    snapshots: list[VolumeSnapshot]
    volumes: list[Volume]
    limits: VolumeLimits
    errors: dict[str, VolumeOptionError]


class VolumeExtended(Accepted):
    size_gb: int


class VolumeAttached(Accepted):
    device: str | None
    server_id: str


class VolumeUploadedToImage(Accepted):
    """The image Cinder is writing the volume into."""

    image_id: str | None
    image_name: str | None


class VolumeMetadataSaved(ResponseModel):
    """The metadata a volume or a volume snapshot holds after an update."""

    metadata: dict[str, str]


class VolumeTransferCreated(ResponseModel):
    """A transfer of ``volume_id`` to another project. The receiving
    project needs ``id`` and ``auth_key``; Cinder returns the key only
    in this reply."""

    id: str
    name: str | None
    volume_id: str
    auth_key: str
    created_at: str | None


class VolumeTransferAccepted(ResponseModel):
    """A transfer this project accepted: ``volume_id`` is now its own."""

    id: str
    name: str | None
    volume_id: str


class RestoreResult(Accepted):
    """A backup restore into the existing volume ``volume_id``."""

    backup_id: str
    volume_id: str | None
    new_volume: bool


class RestoreResultNewVolume(RestoreResult):
    """A backup restore into a volume created for it, which ``volume``
    describes."""

    volume: Volume
