"""Replies of the Kubernetes (Magnum) panels: clusters, templates and node
groups."""

from typing import Literal

from pydantic import ConfigDict

from hive.schemas.responses import Items, ResponseModel

type ClusterAction = Literal[
    "config", "certificate", "sign", "upgrade", "nodegroups", "delete"
]


class ClusterTemplate(ResponseModel):
    """A cluster template. ``kubernetes_version``, ``availability_zone``
    and ``template_version`` come from the Nectar template name
    (``kubernetes-v<version>-<zone>-<driver>-v<template version>``);
    ``upgrade_targets`` from the ``upgrade_targets`` label."""

    id: str
    name: str
    coe: str | None
    image_id: str | None
    flavor_id: str | None
    master_flavor_id: str | None
    keypair_id: str | None
    network_driver: str | None
    external_network_id: str | None
    fixed_network: str | None
    fixed_subnet: str | None
    dns_nameserver: str | None
    master_lb_enabled: bool | None
    floating_ip_enabled: bool | None
    tls_disabled: bool | None
    public: bool | None
    hidden: bool | None
    server_type: str | None
    cluster_distro: str | None
    volume_driver: str | None
    docker_storage_driver: str | None
    docker_volume_size: int | None
    registry_enabled: bool | None
    labels: dict[str, str]
    kubernetes_version: str | None
    availability_zone: str | None
    template_version: str | None
    upgrade_targets: list[str]
    created_at: str | None
    updated_at: str | None


class Cluster(ResponseModel):
    """A cluster, with the row ``actions`` its status allows."""

    id: str
    name: str
    status: str | None
    status_reason: str | None
    health_status: str | None
    health_status_reason: dict[str, str] | str | None
    master_count: int | None
    node_count: int | None
    coe_version: str | None
    cluster_template_id: str | None
    template_name: str | None
    keypair: str | None
    api_address: str | None
    master_addresses: list[str]
    node_addresses: list[str]
    master_flavor_id: str | None
    flavor_id: str | None
    create_timeout: int | None
    labels: dict[str, str]
    availability_zone: str | None
    network_driver: str | None
    kubernetes_version: str | None
    upgrade_targets: list[str]
    stack_id: str | None
    created_at: str | None
    updated_at: str | None
    actions: list[ClusterAction]


class ClusterQuota(ResponseModel):
    """The project's cluster count and node count against Magnum's
    cluster quota (``hard_limit``)."""

    clusters: int | None
    nodes: int | None
    hard_limit: int


class ClustersResponse(Items[Cluster]):
    quota: ClusterQuota


class TemplateCombination(ResponseModel):
    """The newest template for one (version, zone, driver) choice in the
    create workflow."""

    kubernetes_version: str
    availability_zone: str
    network_driver: str
    template_id: str


class ClusterFlavor(ResponseModel):
    """A Nova flavour the create workflow offers, by name."""

    name: str | None
    vcpus: int | None
    ram_mb: int | None
    disk_gb: int | None


class ClusterOptions(ResponseModel):
    """What the create cluster workflow needs: the version, zone and
    driver pickers, the templates behind them, the flavours, the control
    plane sizes and the quota."""

    versions: list[str]
    availability_zones: list[str]
    network_drivers: list[str]
    combinations: list[TemplateCombination]
    templates: list[ClusterTemplate]
    flavors: list[ClusterFlavor]
    control_plane_sizes: list[int]
    quota: ClusterQuota


class ClusterCreated(ResponseModel):
    id: str
    name: str


class UpgradeTarget(ResponseModel):
    template_id: str
    name: str
    kubernetes_version: str | None


class UpgradeOptions(ResponseModel):
    """The templates a cluster can upgrade to, newest first."""

    cluster_id: str
    can_upgrade: bool
    current_version: str | None
    targets: list[UpgradeTarget]


class ClusterUpgrading(ResponseModel):
    id: str
    status: Literal["UPDATE_IN_PROGRESS"]


class ClusterCertificate(ResponseModel):
    """A certificate Magnum signed for the cluster, PEM encoded."""

    pem: str


class ClusterConfig(ResponseModel):
    """A kubeconfig with embedded admin credentials, plus the key, CA and
    certificate as separate files; the three are ``None`` when the
    cluster's template disables TLS."""

    name: str | None
    api_address: str
    kubeconfig: str
    key: str | None
    ca: str | None
    cert: str | None


class NodeTaint(ResponseModel):
    """A Kubernetes node taint, passed through from Magnum's node group."""

    model_config = ConfigDict(extra="allow")

    key: str
    # Magnum may store a value-less taint as null rather than "".
    value: str | None
    effect: str


class NodeGroup(ResponseModel):
    """A node group. ``auto_scaling`` reads the ``auto_scaling_enabled``
    label."""

    id: str
    name: str
    role: str | None
    is_default: bool
    status: str | None
    status_reason: str | None
    flavor_id: str | None
    image_id: str | None
    node_count: int | None
    min_node_count: int | None
    max_node_count: int | None
    node_addresses: list[str]
    labels: dict[str, str]
    auto_scaling: bool
    node_labels: dict[str, str]
    node_taints: list[NodeTaint]
    created_at: str | None
    updated_at: str | None


class NodeGroupsResponse(Items[NodeGroup]):
    """A cluster's node groups; ``can_change`` says whether the cluster's
    status allows changing them."""

    can_change: bool
    cluster_status: str | None


class NodeGroupResized(ResponseModel):
    id: str
    node_count: int
