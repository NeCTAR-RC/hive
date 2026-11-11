"""Request bodies for the compute and network endpoints."""

from typing import Literal

from pydantic import Field, field_validator, model_validator

from hive.nectar import secgroups as secgroup_rules
from hive.schemas import StrictModel, UpdateModel

SourceType = Literal["image", "snapshot", "volume", "volume_snapshot"]
ServerSortKey = Literal[
    "display_name",
    "created_at",
    "updated_at",
    "status",
    "vm_state",
    "power_state",
    "availability_zone",
    "key_name",
    "locked",
]
# As Horizon (API_RESULT_LIMIT 1000).
MAX_LIST_LIMIT = 1000


class ServerListQuery(StrictModel):
    """``GET /compute/instances``: Nova's paging, sorting and the server
    filters a member may use; ``sort_dir`` is sent only with a key.

    Nova accepts the extra filter attributes from microversion 2.83; the
    fork pinned 2.83-2.90 so they work (commit d911bda0e).
    """

    limit: int = Field(50, ge=1, le=MAX_LIST_LIMIT)
    marker: str | None = None
    sort_key: ServerSortKey | None = None
    sort_dir: Literal["asc", "desc"] = "desc"
    name: str | None = None
    status: str | None = None
    image: str | None = None
    flavor: str | None = None
    ip: str | None = None
    ip6: str | None = None
    availability_zone: str | None = None
    key_name: str | None = None
    power_state: str | None = None
    task_state: str | None = None
    vm_state: str | None = None
    locked: str | None = None
    changes_since: str | None = Field(None, alias="changes-since")
    host: str | None = None
    uuid: str | None = None

    def nova_params(self) -> dict:
        params = self.model_dump(by_alias=True, exclude_none=True)
        if self.sort_key is None:
            del params["sort_dir"]
        return {key: value for key, value in params.items() if value != ""}


class LaunchSource(StrictModel):
    type: SourceType
    id: str


class LaunchRequest(StrictModel):
    """``POST /compute/instances``.

    No ``availability_zone`` lets the scheduler pick one (Horizon's "Any
    Availability Zone", ``launch-instance-model.service.js``). With
    ``create_volume`` an image or instance snapshot is copied to a new
    volume of ``volume_size_gb`` that the instance boots from, as the
    source step's "Create New Volume" does.
    """

    name: str = Field(min_length=1, max_length=255)
    count: int = Field(default=1, ge=1, le=100)
    source: LaunchSource
    flavor_id: str
    availability_zone: str | None = Field(default=None, min_length=1)
    create_volume: bool = False
    volume_size_gb: int | None = Field(default=None, ge=1)
    # The new volume's type, a Hive addition (Horizon sends none).
    volume_type: str | None = Field(default=None, min_length=1)
    config_drive: bool = False
    networks: list[str] = Field(default_factory=list)
    ports: list[str] = Field(default_factory=list)
    security_groups: list[str] = Field(default_factory=list)
    key_name: str | None = None
    user_data: str | None = None
    metadata: dict[str, str] = Field(default_factory=dict)
    description: str | None = None
    server_group_id: str | None = None
    delete_volume_on_termination: bool = False

    @field_validator("networks", "ports")
    @classmethod
    def _unique(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))

    @model_validator(mode="after")
    def _boot_volume(self) -> "LaunchRequest":
        if self.create_volume:
            if self.source.type not in ("image", "snapshot"):
                raise ValueError(
                    "a new volume is made from an image or instance snapshot"
                )
            if self.volume_size_gb is None:
                raise ValueError("give the new volume's size")
        elif self.volume_size_gb is not None:
            raise ValueError("a volume size needs create_volume")
        elif self.volume_type is not None:
            raise ValueError("a volume type needs create_volume")
        return self


class ServerUpdate(UpdateModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class ConsoleRequest(StrictModel):
    type: Literal["novnc", "spice-html5", "serial"] = "novnc"


class KeypairCreate(StrictModel):
    name: str = Field(min_length=1, max_length=255)
    public_key: str | None = None
    type: Literal["ssh", "x509"] = "ssh"


class ServerGroupCreate(StrictModel):
    name: str = Field(min_length=1, max_length=255)
    policy: Literal[
        "affinity", "anti-affinity", "soft-affinity", "soft-anti-affinity"
    ] = "anti-affinity"


class ImageCreate(StrictModel):
    name: str = Field(min_length=1, max_length=255)
    disk_format: str = "qcow2"
    container_format: str = "bare"
    visibility: Literal["private", "shared", "community", "public"] | None = (
        None
    )
    min_disk: int = Field(default=0, ge=0)
    min_ram: int = Field(default=0, ge=0)
    protected: bool = False
    properties: dict[str, str] = Field(default_factory=dict)
    source_url: str | None = None


class ImageUpdate(StrictModel):
    name: str | None = None
    visibility: Literal["private", "shared", "community", "public"] | None = (
        None
    )
    min_disk: int | None = Field(default=None, ge=0)
    min_ram: int | None = Field(default=None, ge=0)
    protected: bool | None = None
    properties: dict[str, str | None] | None = None


class SecurityGroupCreate(StrictModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = ""


class SecurityGroupUpdate(UpdateModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class RuleCreate(StrictModel):
    direction: Literal["ingress", "egress"] = "ingress"
    ethertype: Literal["IPv4", "IPv6"] = "IPv4"
    preset: str | None = None
    protocol: str | None = None
    port_range_min: int | None = Field(default=None, ge=-1, le=65535)
    port_range_max: int | None = Field(default=None, ge=-1, le=65535)
    remote_ip_prefix: str | None = None
    remote_group_id: str | None = None
    description: str = ""

    @field_validator("protocol")
    @classmethod
    def _protocol(cls, value: str | None) -> str | None:
        return secgroup_rules.normalise_protocol(value)
