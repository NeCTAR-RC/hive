"""Replies of the Share (Manila) panels: shares, access rules, snapshots,
security services, share groups and share group snapshots."""

from typing import Any

from pydantic import ConfigDict

from hive.schemas.responses import Items, ResponseModel


class ShareType(ResponseModel):
    """A share type and its extra specs. The create form only offers types
    without ``driver_handles_share_servers``: Nectar has no share
    networks."""

    id: str
    name: str | None
    description: str | None
    is_public: bool
    driver_handles_share_servers: bool
    snapshot_support: bool
    extra_specs: dict[str, str]


class ShareSnapshotChoice(ResponseModel):
    """An available snapshot the create-share form can restore from."""

    id: str
    name: str | None
    size: int
    share_id: str


class ShareGroupChoice(ResponseModel):
    """An available share group the create-share form can add to."""

    id: str
    name: str | None
    availability_zone: str | None


class ShareGroupType(ResponseModel):
    """A share group type the create-group form offers."""

    id: str
    name: str | None
    share_types: list[str]
    group_specs: dict[str, str]


class ShareOptions(ResponseModel):
    """Pickers for the create forms, plus the quota state behind the create
    and snapshot buttons. ``quota`` is Manila's absolute limits as sent;
    ``public_shares_allowed`` says whether members may make a share visible
    to all projects (the deployment's setting)."""

    protocols: list[str]
    share_types: list[ShareType]
    availability_zones: list[str]
    snapshots: list[ShareSnapshotChoice]
    share_groups: list[ShareGroupChoice]
    share_group_types: list[ShareGroupType]
    quota: dict[str, int]
    can_create: bool
    create_reason: str | None
    can_snapshot: bool
    snapshot_reason: str | None
    public_shares_allowed: bool
    access_types: list[str]
    access_levels: list[str]
    security_service_types: list[str]


class Share(ResponseModel):
    """A share row; ``actions`` are the row actions its status allows."""

    id: str
    name: str | None
    description: str | None
    size: int | None
    status: str | None
    protocol: str | None
    is_public: bool
    share_type: str | None
    share_type_id: str | None
    availability_zone: str | None
    share_group_id: str | None
    snapshot_id: str | None
    metadata: dict[str, str]
    created_at: str | None
    snapshot_support: bool
    revert_to_snapshot_support: bool
    mount_snapshot_support: bool
    has_snapshot: bool
    is_transitional: bool
    actions: list[str]


class ShareExportLocation(ResponseModel):
    """Where a client mounts the share from."""

    path: str | None
    preferred: bool
    id: str | None


class ShareAccessRule(ResponseModel):
    id: str
    access_type: str | None
    access_to: str | None
    access_level: str | None
    state: str | None
    access_key: str | None
    metadata: dict[str, str]
    created_at: str | None
    updated_at: str | None


class ShareDetail(Share):
    """The share overview page."""

    host: str | None
    task_state: str | None
    export_locations: list[ShareExportLocation]
    access_rules: list[ShareAccessRule]


class SharesResponse(Items[Share]):
    """The shares list with the quota state behind the create button."""

    quota: dict[str, int]
    can_create: bool
    create_reason: str | None


class ShareAccessResponse(Items[ShareAccessRule]):
    """The manage rules page: the share and its access rules; ``can_add``
    is whether the share's status lets a rule be added."""

    share: Share
    can_add: bool


class ShareMetadataSaved(ResponseModel):
    """The metadata a share holds after the edit metadata form."""

    metadata: dict[str, str]


class ShareResized(ResponseModel):
    """A resize Manila accepted; the share reports extending or shrinking
    until it is done."""

    id: str
    size: int


class ShareReverted(ResponseModel):
    """A revert to the newest snapshot that Manila accepted."""

    id: str
    snapshot_id: str


class ShareSnapshot(ResponseModel):
    """A share snapshot row; ``share_name`` is filled where the share was
    looked up and ``None`` otherwise."""

    id: str
    name: str | None
    description: str | None
    size: int | None
    status: str | None
    share_id: str | None
    share_name: str | None
    share_proto: str | None
    share_size: int | None
    created_at: str | None
    is_transitional: bool
    actions: list[str]


class ShareSnapshotExportLocation(ResponseModel):
    """Manila's snapshot export location, passed through as sent."""

    model_config = ConfigDict(extra="allow")

    id: str
    path: str


class ShareSnapshotAccessRule(ResponseModel):
    """Manila's snapshot access rule, passed through as sent."""

    model_config = ConfigDict(extra="allow")

    id: str
    access_type: str
    access_to: str
    state: str


class ShareSnapshotDetail(ShareSnapshot):
    """The snapshot overview. Export locations and access rules are only
    looked up, and only present, when the share supports mounting
    snapshots; they are ``None`` otherwise."""

    mount_snapshot_support: bool
    export_locations: list[ShareSnapshotExportLocation] | None = None
    access_rules: list[ShareSnapshotAccessRule] | None = None


class ShareSnapshotsResponse(Items[ShareSnapshot]):
    """The snapshots list with Manila's absolute limits as sent."""

    quota: dict[str, int]


class SecurityService(ResponseModel):
    """A security service row; ``type_label`` is the type as the table
    shows it ("Active Directory")."""

    id: str
    name: str | None
    description: str | None
    type: str | None
    type_label: str | None
    dns_ip: str | None
    ou: str | None
    server: str | None
    domain: str | None
    user: str | None
    status: str | None
    created_at: str | None


class SecurityServicesResponse(Items[SecurityService]):
    """The security services list with the types the create form offers."""

    types: list[str]


class ShareGroup(ResponseModel):
    """A share group row; ``actions`` are the row actions its status
    allows."""

    id: str
    name: str | None
    description: str | None
    status: str | None
    availability_zone: str | None
    share_group_type_id: str | None
    share_types: list[str]
    source_share_group_snapshot_id: str | None
    consistent_snapshot_support: str | None
    created_at: str | None
    is_transitional: bool
    actions: list[str]


class ShareGroupShareType(ResponseModel):
    """A share type of a group that the project's type list lacks; its id
    stands in for the name."""

    id: str
    name: str


class ShareGroupDetail(ShareGroup):
    """The share group overview. Each of ``share_types_detail`` is the full
    share type when the project can see it, otherwise its id."""

    share_types_detail: list[ShareType | ShareGroupShareType]
    members: list[Share]


class ShareGroupSnapshot(ResponseModel):
    """A share group snapshot row; ``members`` are Manila's member records
    as sent and ``share_group_name`` is ``None`` where the group was not
    looked up."""

    id: str
    name: str | None
    description: str | None
    status: str | None
    share_group_id: str | None
    share_group_name: str | None
    created_at: str | None
    members: list[dict[str, Any]]
    is_transitional: bool
    actions: list[str]
