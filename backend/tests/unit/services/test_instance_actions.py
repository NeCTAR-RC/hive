from types import SimpleNamespace
from typing import get_args
from unittest.mock import AsyncMock, call

from pydantic import TypeAdapter
import pytest

from hive.errors import BadRequest
from hive.schemas.instance_actions import InstanceActionRequest
from hive.services import instance_actions
from hive.services.instance_actions import HANDLERS, perform

ACTIONS = TypeAdapter(InstanceActionRequest)


def fake_ctx(server_action_reply: dict | None = None, ports=()):
    nova = AsyncMock()
    nova.server_action.return_value = server_action_reply or {}
    neutron = AsyncMock()
    neutron.ports.return_value = list(ports)
    return SimpleNamespace(nova=nova, neutron=neutron, forget=AsyncMock())


def test_every_action_model_has_a_handler():
    members = get_args(get_args(InstanceActionRequest.__value__)[0])
    assert set(HANDLERS) == set(members)


@pytest.mark.parametrize(
    ("body", "nova_body"),
    [
        ({"action": "start"}, {"os-start": None}),
        ({"action": "stop"}, {"os-stop": None}),
        ({"action": "pause"}, {"pause": None}),
        ({"action": "unpause"}, {"unpause": None}),
        ({"action": "suspend"}, {"suspend": None}),
        ({"action": "resume"}, {"resume": None}),
        ({"action": "shelve"}, {"shelve": None}),
        ({"action": "unshelve"}, {"unshelve": None}),
        ({"action": "lock"}, {"lock": None}),
        ({"action": "unlock"}, {"unlock": None}),
        ({"action": "reboot"}, {"reboot": {"type": "SOFT"}}),
        ({"action": "reboot", "type": "HARD"}, {"reboot": {"type": "HARD"}}),
        (
            {"action": "resize", "flavor_id": "f-1"},
            {"resize": {"flavorRef": "f-1"}},
        ),
        ({"action": "confirm-resize"}, {"confirmResize": None}),
        ({"action": "revert-resize"}, {"revertResize": None}),
        (
            {"action": "rebuild", "image_id": "img-1"},
            {"rebuild": {"imageRef": "img-1"}},
        ),
        (
            {
                "action": "rebuild",
                "image_id": "img-1",
                "name": "again",
                "password": "s3cret",
            },
            {
                "rebuild": {
                    "imageRef": "img-1",
                    "name": "again",
                    "adminPass": "s3cret",
                }
            },
        ),
        (
            {"action": "rebuild", "image_id": "img-1", "name": ""},
            {"rebuild": {"imageRef": "img-1"}},
        ),
        ({"action": "rescue"}, {"rescue": None}),
        (
            {"action": "rescue", "rescue_image_id": "img-r"},
            {"rescue": {"rescue_image_ref": "img-r"}},
        ),
        ({"action": "unrescue"}, {"unrescue": None}),
        (
            {"action": "add-security-group", "security_group": "web"},
            {"addSecurityGroup": {"name": "web"}},
        ),
        (
            {"action": "remove-security-group", "security_group": "web"},
            {"removeSecurityGroup": {"name": "web"}},
        ),
    ],
)
async def test_server_action_bodies(body, nova_body):
    ctx = fake_ctx()
    result = await perform(ctx, "srv-1", ACTIONS.validate_python(body))
    assert ctx.nova.server_action.await_args == call("srv-1", nova_body)
    assert result.model_dump() == {"status": "accepted", "image_id": None}


async def test_snapshot_names_the_new_image_and_forgets_cached_images():
    ctx = fake_ctx({"image_id": "img-new"})
    action = ACTIONS.validate_python({"action": "snapshot", "name": "pre"})
    result = await perform(ctx, "srv-1", action)
    assert ctx.nova.server_action.await_args == call(
        "srv-1", {"createImage": {"name": "pre", "metadata": {}}}, timeout=60
    )
    assert result.image_id == "img-new"
    assert ctx.forget.await_count == 2


@pytest.mark.parametrize(
    ("body", "method", "args"),
    [
        (
            {"action": "attach-volume", "volume_id": "vol-1"},
            "attach_volume",
            ("srv-1", "vol-1"),
        ),
        (
            {"action": "detach-volume", "volume_id": "vol-1"},
            "detach_volume",
            ("srv-1", "vol-1"),
        ),
        (
            {"action": "attach-interface", "network_id": "net-1"},
            "attach_interface",
            ("srv-1", {"net_id": "net-1"}),
        ),
        (
            {"action": "attach-interface", "port_id": "port-1"},
            "attach_interface",
            ("srv-1", {"port_id": "port-1"}),
        ),
        (
            {"action": "detach-interface", "port_id": "port-1"},
            "detach_interface",
            ("srv-1", "port-1"),
        ),
        (
            {"action": "update-metadata", "metadata": {"a": "1"}},
            "set_server_metadata",
            ("srv-1", {"a": "1"}),
        ),
    ],
)
async def test_nova_resource_calls(body, method, args):
    ctx = fake_ctx()
    await perform(ctx, "srv-1", ACTIONS.validate_python(body))
    assert getattr(ctx.nova, method).await_args == call(*args)


async def test_associate_floating_ip_to_a_named_port():
    ctx = fake_ctx()
    action = ACTIONS.validate_python(
        {"action": "associate-fip", "floating_ip_id": "fip-1", "port_id": "p"}
    )
    await perform(ctx, "srv-1", action)
    ctx.neutron.ports.assert_not_awaited()
    assert ctx.neutron.update_floatingip.await_args == call(
        "fip-1", {"port_id": "p"}
    )


async def test_associate_floating_ip_picks_the_first_target(monkeypatch):
    targets = AsyncMock(
        return_value=[
            SimpleNamespace(port_id="p-v4", ip_address="10.0.0.5"),
            SimpleNamespace(port_id="p-other", ip_address="10.0.0.6"),
        ]
    )
    monkeypatch.setattr(
        instance_actions.network_service, "floating_ip_targets", targets
    )
    ctx = fake_ctx()
    action = ACTIONS.validate_python(
        {"action": "associate-fip", "floating_ip_id": "fip-1"}
    )
    await perform(ctx, "srv-1", action)
    assert targets.await_args == call(ctx, "srv-1")
    assert ctx.neutron.update_floatingip.await_args == call(
        "fip-1", {"port_id": "p-v4", "fixed_ip_address": "10.0.0.5"}
    )


async def test_associate_floating_ip_needs_a_target(monkeypatch):
    monkeypatch.setattr(
        instance_actions.network_service,
        "floating_ip_targets",
        AsyncMock(return_value=[]),
    )
    ctx = fake_ctx()
    action = ACTIONS.validate_python(
        {"action": "associate-fip", "floating_ip_id": "fip-1"}
    )
    with pytest.raises(BadRequest):
        await perform(ctx, "srv-1", action)
    ctx.neutron.update_floatingip.assert_not_awaited()


async def test_disassociate_floating_ip():
    ctx = fake_ctx()
    action = ACTIONS.validate_python(
        {"action": "disassociate-fip", "floating_ip_id": "fip-1"}
    )
    await perform(ctx, "srv-1", action)
    assert ctx.neutron.update_floatingip.await_args == call(
        "fip-1", {"port_id": None}
    )
