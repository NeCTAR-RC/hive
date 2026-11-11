"""Replies of the compute endpoints: instances, flavours, images, key
pairs, server groups and the launch wizard data."""

from typing import Any, Literal

from pydantic import RootModel

from hive.schemas.responses import Accepted, AvailabilityZone, ResponseModel
from hive.schemas.responses.network import Network, SecurityGroup
from hive.schemas.responses.volumes import VolumeType

ImageVisibility = Literal["private", "shared", "public", "community"]
ServerGroupPolicy = Literal[
    "affinity", "anti-affinity", "soft-affinity", "soft-anti-affinity"
]


class Flavor(ResponseModel):
    """A Nova flavour with the Nectar reading of its extra specs: the
    flavour class, the SU rate, whether it is preemptible, and the Blazar
    reservation it belongs to (``reservation_id``; ``None`` for an
    ordinary flavour)."""

    id: str
    name: str
    vcpus: int | None
    ram_mb: int | None
    disk_gb: int | None
    ephemeral_gb: int | None
    swap_mb: int
    is_public: bool
    flavor_class: str | None
    su_rate: float | None
    is_preemptible: bool
    is_reservation: bool
    reservation_id: str | None
    extra_specs: dict[str, str]


class FlavorClass(ResponseModel):
    """A flavour class the launch wizard groups flavours by, with the
    number of flavours in it; ``description`` is ``None`` for a class
    Hive has no sentence for."""

    id: str
    title: str
    description: str | None
    count: int


class ServerFlavor(Flavor):
    """The flavour embedded in a server. Nova 2.47+ embeds it by name, so
    it carries no id."""

    id: str | None


class Address(ResponseModel):
    network: str
    addr: str
    version: Literal[4, 6]
    type: Literal["fixed", "floating"] | None
    mac: str | None


class InstanceFault(ResponseModel):
    code: int | None
    message: str | None
    created: str | None


class InstanceImage(ResponseModel):
    """The image an instance booted from; ``name`` is ``None`` when the
    image is gone or not visible to the project."""

    id: str
    name: str | None


class Instance(ResponseModel):
    """A server as the instances table shows it."""

    id: str
    name: str
    description: str | None
    status: str
    power_state: str
    task_state: str | None
    vm_state: str | None
    availability_zone: str | None
    created: str
    updated: str
    locked: bool
    host_id: str | None
    key_name: str | None
    progress: int | None
    user_id: str
    project_id: str
    flavor: ServerFlavor | None
    image: InstanceImage | None
    boot_from_volume: bool
    addresses: list[Address]
    security_groups: list[str]
    volumes_attached: list[str]
    metadata: dict[str, str]
    fault: InstanceFault | None
    server_group_ids: list[str]


class InstanceHost(ResponseModel):
    instance_name: str | None
    hostname: str | None


class InstanceDetail(Instance):
    user_data: str | None
    os_ext_srv_attr: InstanceHost


class InstanceVolume(ResponseModel):
    """A volume attached to an instance, named by its id when Cinder
    cannot be read."""

    id: str
    device: str | None
    name: str
    size_gb: int | None
    status: str | None
    bootable: bool
    volume_type: str | None


class InstancePortFixedIp(ResponseModel):
    ip: str
    subnet_id: str


class InstancePortFloatingIp(ResponseModel):
    id: str
    address: str


class InstancePort(ResponseModel):
    """A Neutron port on an instance with the floating IPs on it."""

    id: str
    network_id: str
    mac_address: str | None
    status: str | None
    fixed_ips: list[InstancePortFixedIp]
    security_groups: list[str]
    port_security_enabled: bool | None
    floating_ips: list[InstancePortFloatingIp]


class InstanceAction(ResponseModel):
    """One entry of an instance's action log."""

    action: str
    request_id: str
    user_id: str | None
    start_time: str
    message: str | None


class ConsoleOutput(ResponseModel):
    output: str


class RemoteConsole(ResponseModel):
    url: str | None
    type: str | None


class ServerPassword(ResponseModel):
    """The admin password encrypted with the key pair's public key; the
    browser decrypts it, as Horizon does."""

    encrypted_password: str


class ActionResult(Accepted):
    """A server action Nova accepted; only a snapshot names its image."""

    image_id: str | None = None


class LaunchResult(Accepted):
    ids: list[str]


class ComputeLimits(RootModel[dict[str, int]]):
    """Nova's absolute limits as Nova names them (``maxTotalInstances``,
    ``totalCoresUsed``); -1 means unlimited."""


class Image(ResponseModel):
    """A Glance image or instance snapshot; ``properties`` holds the
    custom properties the image panel lists."""

    id: str
    name: str | None
    status: str
    visibility: ImageVisibility
    owner: str | None
    is_owner: bool
    is_snapshot: bool
    size: int | None
    disk_format: str | None
    container_format: str | None
    min_disk: int | None
    min_ram: int | None
    created_at: str | None
    updated_at: str | None
    protected: bool
    checksum: str | None
    os_distro: str | None
    os_version: str | None
    tags: list[str]
    properties: dict[str, Any]


class LaunchImage(Image):
    """An image in the launch wizard; other projects' community images
    start hidden and show only for a name search, as in the fork."""

    hidden_until_search: bool


class KeyPair(ResponseModel):
    name: str
    type: Literal["ssh", "x509"] | None
    fingerprint: str | None
    public_key: str | None


class KeyPairDetail(KeyPair):
    created_at: str | None


class KeyPairCreated(KeyPair):
    """A new key pair; a pair Nova generated carries its private key in
    this reply only."""

    private_key: str | None


class ServerGroup(ResponseModel):
    id: str
    name: str
    policy: ServerGroupPolicy
    members: list[str]


class LaunchVolume(ResponseModel):
    """An available bootable volume the wizard can boot from."""

    id: str
    name: str
    size_gb: int | None
    availability_zone: str | None
    status: str
    bootable: bool


class LaunchVolumeSnapshot(ResponseModel):
    id: str
    name: str
    size_gb: int | None
    status: str
    volume_id: str | None


class LaunchSectionError(ResponseModel):
    """Why one section of the launch options could not be loaded."""

    error: str
    message: str


class LaunchDefaults(ResponseModel):
    create_volume: bool
    config_drive: bool
    network_ports: bool
    classic_network_id: str | None
    preemptible_notice: str


class LaunchOptions(ResponseModel):
    """Everything the launch wizard needs. A section that failed to load
    is ``None`` and named in ``errors``; the rest still load."""

    flavors: list[Flavor] | None
    # The classes among ``flavors``; ``None`` when the flavours failed.
    flavor_classes: list[FlavorClass] | None
    images: list[LaunchImage] | None
    snapshots: list[Image] | None
    volumes: list[LaunchVolume] | None
    volume_snapshots: list[LaunchVolumeSnapshot] | None
    networks: list[Network] | None
    key_pairs: list[KeyPair] | None
    security_groups: list[SecurityGroup] | None
    availability_zones: list[AvailabilityZone] | None
    server_groups: list[ServerGroup] | None
    limits: ComputeLimits | None
    # The new boot volume's type picker filters by zone when any type is
    # limited to zones, as the create volume form does.
    volume_types: list[VolumeType] | None
    has_zoned_types: bool
    errors: dict[str, LaunchSectionError]
    defaults: LaunchDefaults
