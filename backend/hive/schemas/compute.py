"""Request bodies for the compute and network endpoints."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

SourceType = Literal["image", "snapshot", "volume", "volume_snapshot"]


class LaunchSource(BaseModel):
    type: SourceType
    id: str


class LaunchRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    count: int = Field(default=1, ge=1, le=100)
    source: LaunchSource
    flavor_id: str
    availability_zone: str = Field(min_length=1)
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


class ServerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class ActionRequest(BaseModel):
    """Body for ``POST /instances/{id}/actions/{action}``; which fields
    apply depends on the action."""

    type: Literal["SOFT", "HARD"] | None = None
    flavor_id: str | None = None
    image_id: str | None = None
    name: str | None = None
    password: str | None = None
    volume_id: str | None = None
    network_id: str | None = None
    port_id: str | None = None
    floating_ip_id: str | None = None
    security_group: str | None = None
    metadata: dict[str, str] | None = None
    rescue_image_id: str | None = None


class ConsoleRequest(BaseModel):
    type: Literal["novnc", "spice-html5", "serial"] = "novnc"


class KeypairCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    public_key: str | None = None
    type: Literal["ssh", "x509"] = "ssh"


class ServerGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    policy: Literal[
        "affinity", "anti-affinity", "soft-affinity", "soft-anti-affinity"
    ] = "anti-affinity"


class ImageCreate(BaseModel):
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


class ImageUpdate(BaseModel):
    name: str | None = None
    visibility: Literal["private", "shared", "community", "public"] | None = (
        None
    )
    min_disk: int | None = Field(default=None, ge=0)
    min_ram: int | None = Field(default=None, ge=0)
    protected: bool | None = None
    properties: dict[str, str | None] | None = None


class SecurityGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = ""


class SecurityGroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class RuleCreate(BaseModel):
    direction: Literal["ingress", "egress"] = "ingress"
    ethertype: Literal["IPv4", "IPv6"] = "IPv4"
    preset: str | None = None
    protocol: str | None = None
    port_range_min: int | None = Field(default=None, ge=-1, le=65535)
    port_range_max: int | None = Field(default=None, ge=-1, le=65535)
    remote_ip_prefix: str | None = None
    remote_group_id: str | None = None
    description: str = ""
