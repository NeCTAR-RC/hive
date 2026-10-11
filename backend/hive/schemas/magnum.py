"""Request bodies for the Kubernetes (Magnum) panels."""

from pydantic import BaseModel, Field


class ClusterCreate(BaseModel):
    """The Nectar create workflow: name, template by version/zone/driver,
    sizes and flavours, optional etcd volume."""

    name: str = Field(min_length=1, max_length=255)
    cluster_template_id: str = Field(min_length=1)
    master_count: int = Field(default=1, ge=1, le=7)
    master_flavor_id: str = Field(min_length=1)
    node_count: int = Field(default=1, ge=0)
    flavor_id: str = Field(min_length=1)
    etcd_volume_size: int | None = Field(default=None, ge=1)
    etcd_volume_type: str | None = None


class ClusterUpgrade(BaseModel):
    cluster_template_id: str = Field(min_length=1)
    max_batch_size: int = Field(default=1, ge=1)


class NodeGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255, pattern=r"^[a-zA-Z][a-zA-Z0-9_\-.]*$")
    flavor_id: str = Field(min_length=1)
    node_count: int = Field(default=1, ge=1)
    autoscaling: bool = False
    min_node_count: int | None = Field(default=None, ge=0)
    max_node_count: int | None = Field(default=None, ge=1)
    boot_volume_size: int | None = Field(default=None, ge=1)
    boot_volume_type: str | None = None
    node_labels: str | None = None
    node_taints: str | None = None


class NodeGroupResize(BaseModel):
    node_count: int = Field(ge=0)


class NodeGroupAutoscaling(BaseModel):
    min_node_count: int = Field(ge=0)
    max_node_count: int = Field(ge=1)


class NodeGroupLabels(BaseModel):
    node_labels: str | None = None
    node_taints: str | None = None


class SignRequest(BaseModel):
    csr: str = Field(min_length=1)
