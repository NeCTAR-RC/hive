"""Replies of the Database (Trove) panels: instances, backups,
configuration groups, users, databases and guest logs."""

from typing import Any, Literal

from pydantic import ConfigDict, Field

from hive.schemas.responses import Items, ResponseModel

StatusKind = Literal["ok", "error", "transitional", "unknown"]


class DbFlavor(ResponseModel):
    """A Trove flavour; ``id`` is null when rctest's Trove sends neither an
    id nor a ``str_id``."""

    id: str | None
    name: str | None
    ram: int | None
    vcpus: int | None
    disk: int | None
    ephemeral: int | None


class DatastoreOption(ResponseModel):
    """One active datastore version, as the launch and upgrade pickers
    list it."""

    datastore: str | None
    datastore_id: str | None
    version: str | None
    version_id: str | None
    label: str


class DbQuota(ResponseModel):
    """The project's absolute Trove limits."""

    max_instances: int | None
    max_backups: int | None
    max_volumes: int | None
    max_ram: int | None


class DbConfigurationRef(ResponseModel):
    """The configuration group reference Trove embeds in an instance,
    passed through as Trove sends it."""

    model_config = ConfigDict(extra="allow")

    id: str
    name: str | None = None


class DbConfiguration(ResponseModel):
    """A configuration group row."""

    id: str
    name: str | None
    description: str | None
    datastore: str | None
    datastore_version: str | None
    datastore_version_id: str | None
    values: dict[str, Any]
    created: str | None
    updated: str | None


class DbInstance(ResponseModel):
    """A database instance row; ``actions`` are the row actions its status
    allows."""

    id: str
    name: str | None
    status: str | None
    status_kind: StatusKind
    operating_status: str | None
    datastore: str | None
    datastore_version: str | None
    flavor_id: str | None
    flavor_name: str | None
    ram: int | None
    hostname: str | None
    addresses: list[str]
    volume_size: int | None
    volume_used: float | None
    region: str | None
    created: str | None
    updated: str | None
    configuration: DbConfigurationRef | None
    replica_of: Any
    replicas: list[Any]
    is_transitional: bool
    actions: list[str]


class DbAddress(ResponseModel):
    """One instance address, passed through as Trove sends it."""

    model_config = ConfigDict(extra="allow")

    type: str | None = None
    address: str | None = None


class DbFault(ResponseModel):
    """The instance fault, passed through as Trove sends it."""

    model_config = ConfigDict(extra="allow")

    message: str | None = None
    details: str | None = None
    created: str | None = None


class DbInstanceDetail(DbInstance):
    """The instance overview. ``configuration`` is the full group when it
    could be read, otherwise Trove's reference to it."""

    configuration: DbConfiguration | DbConfigurationRef | None = Field(
        union_mode="left_to_right"
    )
    allowed_cidrs: list[str]
    is_public: bool
    addresses_detail: list[DbAddress]
    availability_zone: str | None
    fault: DbFault | None
    service_status_updated: str | None
    port: int | None
    cidr_warning: str | None


class DbInstancesResponse(Items[DbInstance]):
    quota: DbQuota


class DbInstanceRef(ResponseModel):
    """The instance a change was accepted for (update, restart, detach a
    configuration group)."""

    id: str


class DbVolumeResized(DbInstanceRef):
    size: int


class DbInstanceResized(DbInstanceRef):
    flavor: str


class DbInstanceUpgraded(DbInstanceRef):
    version_id: str


class DbConfigurationAttached(DbInstanceRef):
    configuration_id: str


class DbNetworkOption(ResponseModel):
    """A network the launch form offers; ``classic`` marks the Nectar
    classic network."""

    id: str
    name: str | None
    classic: bool


class DbBackup(ResponseModel):
    """A backup row; ``can_restore`` marks a COMPLETED or RESTORED backup."""

    id: str
    name: str | None
    description: str | None
    status: str | None
    status_kind: StatusKind
    datastore: str | None
    datastore_version: str | None
    instance_id: str | None
    instance_name: str | None
    parent_id: str | None
    incremental: bool
    size: float | None
    location: str | None
    created: str | None
    updated: str | None
    is_transitional: bool
    can_restore: bool


class DbBackupDetail(DbBackup):
    """The backup overview. ``instance_status`` is absent when the source
    instance is gone and ``parent_name`` when the backup is not
    incremental or its parent is gone."""

    instance_status: str | None = None
    parent_name: str | None = None


class DbInstanceName(ResponseModel):
    """An instance as a picker or a link lists it."""

    id: str
    name: str | None


class DbBackupsResponse(Items[DbBackup]):
    """The backups page; ``instances`` are the active instances a new
    backup can be taken from."""

    quota: DbQuota
    instances: list[DbInstanceName]


class DbOptions(ResponseModel):
    """The launch form's pickers. ``flavors_by_version`` is keyed
    ``datastore/version``."""

    datastores: list[DatastoreOption]
    flavors: list[DbFlavor]
    flavors_by_version: dict[str, list[DbFlavor]]
    availability_zones: list[str]
    networks: list[DbNetworkOption]
    configurations: list[DbConfiguration]
    backups: list[DbBackup]
    quota: DbQuota


class DbParameterSpec(ResponseModel):
    """A configuration parameter of the group's datastore version."""

    name: str | None
    type: str | None
    min: int | float | None
    max: int | float | None
    restart_required: bool


class DbConfigurationDetail(DbConfiguration):
    """The configuration group page with the instances using it."""

    instances: list[DbInstanceName]
    parameters: list[DbParameterSpec]


class DbConfigurationsResponse(Items[DbConfiguration]):
    """The configuration groups page; ``datastores`` feed the create form."""

    datastores: list[DatastoreOption]


class DbConfigurationValues(ResponseModel):
    """The values a group now holds, coerced by the parameter spec."""

    id: str
    values: dict[str, Any]


class DbResizeFlavors(Items[DbFlavor]):
    """The flavours an instance can be resized to."""

    current: str | None
    datastore: str | None
    datastore_version: str | None


class DbUpgradeTargets(Items[DatastoreOption]):
    """The other versions of the instance's datastore; ``current`` is its
    version now."""

    current: str | None


class DbConfigDefault(ResponseModel):
    """One effective configuration value of an instance (Defaults tab)."""

    name: str
    value: str | int | float | bool | None


class DbLog(ResponseModel):
    """A guest log row; ``published`` and ``pending`` are byte counts."""

    name: str | None
    type: str | None
    status: str | None
    status_kind: Literal["ok", "error", "warning", "unknown"]
    published: int
    pending: int
    container: str | None
    prefix: str | None
    metafile: str | None
    actions: list[str]


class DbLogContents(ResponseModel):
    """The tail of a published log for the viewer. ``partial`` says older
    lines exist; ``truncated`` that the viewer's size cap cut the text."""

    name: str
    lines: int
    text: str
    partial: bool
    truncated: bool
    parts: int
    published: int


class DbRootStatus(ResponseModel):
    id: str
    root_enabled: bool


class DbRootEnabled(ResponseModel):
    """The generated root password, shown once."""

    id: str
    name: str | None
    password: str | None


class DbUser(ResponseModel):
    """A database user; ``host`` is ``%`` for any host."""

    name: str | None
    host: str
    databases: list[str]


class DbCreated(ResponseModel):
    """The name of a user or database Trove accepted for creation."""

    name: str


class DbUserUpdated(ResponseModel):
    """The user as Trove names it after an accepted edit."""

    name: str
    host: str


class DbDatabase(ResponseModel):
    name: str | None


class DbDatabaseAccess(ResponseModel):
    """A database of the instance and whether the user may use it."""

    name: str | None
    granted: bool


class DbAccessGranted(ResponseModel):
    name: str
    databases: list[str]
