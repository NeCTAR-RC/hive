"""The body of ``POST /compute/instances/{id}/actions``: one model per
server action, told apart by ``action``.

Each model carries only its own fields, so a resize without a flavour or
a reboot with a stray ``flavor_id`` is a 422 on the field, and an action
name nobody handles is a 422 on ``action``.
"""

from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from hive.schemas import StrictModel

Required = Annotated[str, Field(min_length=1)]


class StartInstance(StrictModel):
    action: Literal["start"]


class StopInstance(StrictModel):
    action: Literal["stop"]


class PauseInstance(StrictModel):
    action: Literal["pause"]


class UnpauseInstance(StrictModel):
    action: Literal["unpause"]


class SuspendInstance(StrictModel):
    action: Literal["suspend"]


class ResumeInstance(StrictModel):
    action: Literal["resume"]


class ShelveInstance(StrictModel):
    action: Literal["shelve"]


class UnshelveInstance(StrictModel):
    action: Literal["unshelve"]


class LockInstance(StrictModel):
    action: Literal["lock"]


class UnlockInstance(StrictModel):
    action: Literal["unlock"]


class RebootInstance(StrictModel):
    action: Literal["reboot"]
    type: Literal["SOFT", "HARD"] = "SOFT"


class ResizeInstance(StrictModel):
    action: Literal["resize"]
    flavor_id: Required


class ConfirmResize(StrictModel):
    action: Literal["confirm-resize"]


class RevertResize(StrictModel):
    action: Literal["revert-resize"]


class RebuildInstance(StrictModel):
    """Rebuild from an image, optionally renaming the server and setting
    a new admin password."""

    action: Literal["rebuild"]
    image_id: Required
    name: str | None = None
    password: str | None = None


class RescueInstance(StrictModel):
    """Boot the rescue image (Nova's default when none is named)."""

    action: Literal["rescue"]
    rescue_image_id: str | None = None


class UnrescueInstance(StrictModel):
    action: Literal["unrescue"]


class SnapshotInstance(StrictModel):
    action: Literal["snapshot"]
    name: Required


class AddSecurityGroup(StrictModel):
    action: Literal["add-security-group"]
    security_group: Required


class RemoveSecurityGroup(StrictModel):
    action: Literal["remove-security-group"]
    security_group: Required


class AttachVolume(StrictModel):
    action: Literal["attach-volume"]
    volume_id: Required


class DetachVolume(StrictModel):
    action: Literal["detach-volume"]
    volume_id: Required


class AttachInterface(StrictModel):
    """A new interface on a network, or an existing port; exactly one."""

    action: Literal["attach-interface"]
    network_id: str | None = None
    port_id: str | None = None

    @model_validator(mode="after")
    def _network_or_port(self) -> Self:
        if bool(self.network_id) == bool(self.port_id):
            raise ValueError("give exactly one of network_id or port_id")
        return self


class DetachInterface(StrictModel):
    action: Literal["detach-interface"]
    port_id: Required


class AssociateFloatingIp(StrictModel):
    """Associate a floating IP with the instance; without ``port_id`` it
    goes to the first port that has a fixed IP."""

    action: Literal["associate-fip"]
    floating_ip_id: Required
    port_id: str | None = None


class DisassociateFloatingIp(StrictModel):
    action: Literal["disassociate-fip"]
    floating_ip_id: Required


class UpdateMetadata(StrictModel):
    """Set the server's metadata: keys left out are removed."""

    action: Literal["update-metadata"]
    metadata: dict[str, str]


type InstanceActionRequest = Annotated[
    StartInstance
    | StopInstance
    | PauseInstance
    | UnpauseInstance
    | SuspendInstance
    | ResumeInstance
    | ShelveInstance
    | UnshelveInstance
    | LockInstance
    | UnlockInstance
    | RebootInstance
    | ResizeInstance
    | ConfirmResize
    | RevertResize
    | RebuildInstance
    | RescueInstance
    | UnrescueInstance
    | SnapshotInstance
    | AddSecurityGroup
    | RemoveSecurityGroup
    | AttachVolume
    | DetachVolume
    | AttachInterface
    | DetachInterface
    | AssociateFloatingIp
    | DisassociateFloatingIp
    | UpdateMetadata,
    Field(discriminator="action"),
]
