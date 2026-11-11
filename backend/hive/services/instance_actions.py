"""Server actions: one handler per action model, chosen by the model's
type from ``HANDLERS``.

Each handler reproduces the Horizon action named in its docstring (files
under ``openstack_dashboard/dashboards/project/`` of the Nectar horizon
branch) and sends only what that action needs; the request model has
already checked the fields.
"""

from collections.abc import Awaitable, Callable
from typing import Any

from hive.errors import BadRequest
from hive.schemas.instance_actions import (
    AddSecurityGroup,
    AssociateFloatingIp,
    AttachInterface,
    AttachVolume,
    ConfirmResize,
    DetachInterface,
    DetachVolume,
    DisassociateFloatingIp,
    InstanceActionRequest,
    LockInstance,
    PauseInstance,
    RebootInstance,
    RebuildInstance,
    RemoveSecurityGroup,
    RescueInstance,
    ResizeInstance,
    ResumeInstance,
    RevertResize,
    ShelveInstance,
    SnapshotInstance,
    StartInstance,
    StopInstance,
    SuspendInstance,
    UnlockInstance,
    UnpauseInstance,
    UnrescueInstance,
    UnshelveInstance,
    UpdateMetadata,
)
from hive.schemas.responses.compute import ActionResult
from hive.services.compute import invalidate_project_images
from hive.services.context import Context
from hive.services import network as network_service

# The reply of every action but a snapshot; never mutated.
ACCEPTED = ActionResult(status="accepted")


async def _server_action(
    ctx: Context, server_id: str, body: dict
) -> ActionResult:
    await ctx.nova.server_action(server_id, body)
    return ACCEPTED


async def start(
    ctx: Context, server_id: str, _: StartInstance
) -> ActionResult:
    """``instances/tables.py`` ``StartInstance``."""
    return await _server_action(ctx, server_id, {"os-start": None})


async def stop(ctx: Context, server_id: str, _: StopInstance) -> ActionResult:
    """``instances/tables.py`` ``StopInstance``."""
    return await _server_action(ctx, server_id, {"os-stop": None})


async def pause(
    ctx: Context, server_id: str, _: PauseInstance
) -> ActionResult:
    """``instances/tables.py`` ``TogglePause``, pausing."""
    return await _server_action(ctx, server_id, {"pause": None})


async def unpause(
    ctx: Context, server_id: str, _: UnpauseInstance
) -> ActionResult:
    """``instances/tables.py`` ``TogglePause``, resuming."""
    return await _server_action(ctx, server_id, {"unpause": None})


async def suspend(
    ctx: Context, server_id: str, _: SuspendInstance
) -> ActionResult:
    """``instances/tables.py`` ``ToggleSuspend``, suspending."""
    return await _server_action(ctx, server_id, {"suspend": None})


async def resume(
    ctx: Context, server_id: str, _: ResumeInstance
) -> ActionResult:
    """``instances/tables.py`` ``ToggleSuspend``, resuming."""
    return await _server_action(ctx, server_id, {"resume": None})


async def shelve(
    ctx: Context, server_id: str, _: ShelveInstance
) -> ActionResult:
    """``instances/tables.py`` ``ToggleShelve``, shelving."""
    return await _server_action(ctx, server_id, {"shelve": None})


async def unshelve(
    ctx: Context, server_id: str, _: UnshelveInstance
) -> ActionResult:
    """``instances/tables.py`` ``ToggleShelve``, unshelving."""
    return await _server_action(ctx, server_id, {"unshelve": None})


async def lock(ctx: Context, server_id: str, _: LockInstance) -> ActionResult:
    """``instances/tables.py`` ``LockInstance``."""
    return await _server_action(ctx, server_id, {"lock": None})


async def unlock(
    ctx: Context, server_id: str, _: UnlockInstance
) -> ActionResult:
    """``instances/tables.py`` ``UnlockInstance``."""
    return await _server_action(ctx, server_id, {"unlock": None})


async def reboot(
    ctx: Context, server_id: str, action: RebootInstance
) -> ActionResult:
    """``instances/tables.py`` ``RebootInstance`` (hard) and
    ``SoftRebootInstance``."""
    return await _server_action(
        ctx, server_id, {"reboot": {"type": action.type}}
    )


async def resize(
    ctx: Context, server_id: str, action: ResizeInstance
) -> ActionResult:
    """``instances/workflows/resize_instance.py`` ``ResizeInstance``."""
    return await _server_action(
        ctx, server_id, {"resize": {"flavorRef": action.flavor_id}}
    )


async def confirm_resize(
    ctx: Context, server_id: str, _: ConfirmResize
) -> ActionResult:
    """``instances/tables.py`` ``ConfirmResize``."""
    return await _server_action(ctx, server_id, {"confirmResize": None})


async def revert_resize(
    ctx: Context, server_id: str, _: RevertResize
) -> ActionResult:
    """``instances/tables.py`` ``RevertResize``."""
    return await _server_action(ctx, server_id, {"revertResize": None})


async def rebuild(
    ctx: Context, server_id: str, action: RebuildInstance
) -> ActionResult:
    """``instances/forms.py`` ``RebuildInstanceForm``: the image and an
    optional admin password, plus Nova's optional new name. An empty
    name or password counts as not given, as in the form."""
    body: dict = {"imageRef": action.image_id}
    if action.name:
        body["name"] = action.name
    if action.password:
        body["adminPass"] = action.password
    return await _server_action(ctx, server_id, {"rebuild": body})


async def rescue(
    ctx: Context, server_id: str, action: RescueInstance
) -> ActionResult:
    """``instances/forms.py`` ``RescueInstanceForm``; without an image
    Nova boots its default rescue image."""
    body = (
        {"rescue_image_ref": action.rescue_image_id}
        if action.rescue_image_id
        else None
    )
    return await _server_action(ctx, server_id, {"rescue": body})


async def unrescue(
    ctx: Context, server_id: str, _: UnrescueInstance
) -> ActionResult:
    """``instances/tables.py`` ``UnRescueInstance``."""
    return await _server_action(ctx, server_id, {"unrescue": None})


async def snapshot(
    ctx: Context, server_id: str, action: SnapshotInstance
) -> ActionResult:
    """``images/snapshots/forms.py`` ``CreateSnapshot``. Older Nova
    answers 202 with no body; the snapshot still starts, so the image id
    is then ``None``."""
    reply = await ctx.nova.server_action(
        server_id,
        {"createImage": {"name": action.name, "metadata": {}}},
        timeout=60,
    )
    await invalidate_project_images(ctx)
    return ActionResult(status="accepted", image_id=reply.get("image_id"))


async def add_security_group(
    ctx: Context, server_id: str, action: AddSecurityGroup
) -> ActionResult:
    """``instances/workflows/update_instance.py``
    ``UpdateInstanceSecurityGroups``, adding one group. Horizon sets the
    groups on each port through Neutron; Nova's ``addSecurityGroup`` adds
    the group to every port of the server, to the same effect."""
    return await _server_action(
        ctx, server_id, {"addSecurityGroup": {"name": action.security_group}}
    )


async def remove_security_group(
    ctx: Context, server_id: str, action: RemoveSecurityGroup
) -> ActionResult:
    """``instances/workflows/update_instance.py``
    ``UpdateInstanceSecurityGroups``, removing one group from every port
    (Nova's ``removeSecurityGroup``)."""
    return await _server_action(
        ctx,
        server_id,
        {"removeSecurityGroup": {"name": action.security_group}},
    )


async def attach_volume(
    ctx: Context, server_id: str, action: AttachVolume
) -> ActionResult:
    """``instances/forms.py`` ``AttachVolume``; Nova picks the device."""
    await ctx.nova.attach_volume(server_id, action.volume_id)
    return ACCEPTED


async def detach_volume(
    ctx: Context, server_id: str, action: DetachVolume
) -> ActionResult:
    """``instances/forms.py`` ``DetachVolume``."""
    await ctx.nova.detach_volume(server_id, action.volume_id)
    return ACCEPTED


async def attach_interface(
    ctx: Context, server_id: str, action: AttachInterface
) -> ActionResult:
    """``instances/forms.py`` ``AttachInterface``: a new port on a
    network, or an existing port."""
    if action.port_id:
        attachment = {"port_id": action.port_id}
    else:
        attachment = {"net_id": action.network_id}
    await ctx.nova.attach_interface(server_id, attachment)
    return ACCEPTED


async def detach_interface(
    ctx: Context, server_id: str, action: DetachInterface
) -> ActionResult:
    """``instances/forms.py`` ``DetachInterface``."""
    await ctx.nova.detach_interface(server_id, action.port_id)
    return ACCEPTED


async def associate_floating_ip(
    ctx: Context, server_id: str, action: AssociateFloatingIp
) -> ActionResult:
    """``floating_ips/workflows.py`` ``IPAssociationWorkflow``. Without a
    port the floating IP goes to the first IPv4 address on a reachable
    subnet, the same targets the association dialog offers
    (``FloatingIpManager.list_targets``)."""
    fields: dict = {"port_id": action.port_id}
    if not action.port_id:
        targets = await network_service.floating_ip_targets(ctx, server_id)
        if not targets:
            raise BadRequest("the instance has no port to associate with")
        fields = {
            "port_id": targets[0].port_id,
            "fixed_ip_address": targets[0].ip_address,
        }
    await ctx.neutron.update_floatingip(action.floating_ip_id, fields)
    return ACCEPTED


async def disassociate_floating_ip(
    ctx: Context, _server_id: str, action: DisassociateFloatingIp
) -> ActionResult:
    """``instances/forms.py`` ``Disassociate``; the floating IP alone
    names what to undo."""
    await ctx.neutron.update_floatingip(
        action.floating_ip_id, {"port_id": None}
    )
    return ACCEPTED


async def update_metadata(
    ctx: Context, server_id: str, action: UpdateMetadata
) -> ActionResult:
    """``instances/tables.py`` ``UpdateMetadata``. Horizon sends the
    added and the removed keys separately; one PUT of the whole set has
    the same effect."""
    await ctx.nova.set_server_metadata(server_id, action.metadata)
    return ACCEPTED


type Handler = Callable[[Context, str, Any], Awaitable[ActionResult]]

HANDLERS: dict[type, Handler] = {
    StartInstance: start,
    StopInstance: stop,
    PauseInstance: pause,
    UnpauseInstance: unpause,
    SuspendInstance: suspend,
    ResumeInstance: resume,
    ShelveInstance: shelve,
    UnshelveInstance: unshelve,
    LockInstance: lock,
    UnlockInstance: unlock,
    RebootInstance: reboot,
    ResizeInstance: resize,
    ConfirmResize: confirm_resize,
    RevertResize: revert_resize,
    RebuildInstance: rebuild,
    RescueInstance: rescue,
    UnrescueInstance: unrescue,
    SnapshotInstance: snapshot,
    AddSecurityGroup: add_security_group,
    RemoveSecurityGroup: remove_security_group,
    AttachVolume: attach_volume,
    DetachVolume: detach_volume,
    AttachInterface: attach_interface,
    DetachInterface: detach_interface,
    AssociateFloatingIp: associate_floating_ip,
    DisassociateFloatingIp: disassociate_floating_ip,
    UpdateMetadata: update_metadata,
}


async def perform(
    ctx: Context, server_id: str, action: InstanceActionRequest
) -> ActionResult:
    """Run one server action with the handler for its model."""
    return await HANDLERS[type(action)](ctx, server_id, action)
