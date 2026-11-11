"""Request bodies for the Kubernetes (Magnum) panels."""

from pydantic import Field, field_validator

from hive.nectar import magnum as rules
from hive.schemas import StrictModel


class ClusterCreate(StrictModel):
    """The Nectar create workflow: name, template by version/zone/driver,
    sizes and flavours, optional etcd volume, and the key pair and worker
    autoscaling the Nectar form had removed."""

    name: str = Field(min_length=1, max_length=255)
    cluster_template_id: str = Field(min_length=1)
    master_count: int = Field(default=1, ge=1, le=7)
    master_flavor_id: str = Field(min_length=1)
    node_count: int = Field(default=1, ge=0)
    flavor_id: str = Field(min_length=1)
    etcd_volume_size: int | None = Field(default=None, ge=1)
    etcd_volume_type: str | None = None
    keypair: str | None = Field(default=None, min_length=1, max_length=255)
    autoscaling: bool = False
    min_node_count: int | None = Field(default=None, ge=0)
    max_node_count: int | None = Field(default=None, ge=1)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        rules.validate_cluster_name(value)
        return value


class ClusterUpgrade(StrictModel):
    cluster_template_id: str = Field(min_length=1)
    max_batch_size: int = Field(default=1, ge=1)


class NodeGroupCreate(StrictModel):
    name: str = Field(
        min_length=1, max_length=255, pattern=r"^[a-zA-Z][a-zA-Z0-9_\-.]*$"
    )
    flavor_id: str = Field(min_length=1)
    node_count: int = Field(default=1, ge=1)
    autoscaling: bool = False
    min_node_count: int | None = Field(default=None, ge=0)
    max_node_count: int | None = Field(default=None, ge=1)
    boot_volume_size: int | None = Field(default=None, ge=1)
    boot_volume_type: str | None = None
    node_labels: str | None = None
    node_taints: str | None = None


class NodeGroupResize(StrictModel):
    node_count: int = Field(ge=0)


class NodeGroupAutoscaling(StrictModel):
    min_node_count: int = Field(ge=0)
    max_node_count: int = Field(ge=1)


class NodeGroupLabels(StrictModel):
    node_labels: str | None = None
    node_taints: str | None = None


class SignRequest(StrictModel):
    csr: str = Field(min_length=1)
