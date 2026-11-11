from pydantic import TypeAdapter, ValidationError
import pytest

from hive.schemas.instance_actions import (
    AttachInterface,
    InstanceActionRequest,
    ResizeInstance,
)

ACTIONS = TypeAdapter(InstanceActionRequest)


def test_the_action_name_picks_the_model():
    action = ACTIONS.validate_python({"action": "resize", "flavor_id": "f"})
    assert isinstance(action, ResizeInstance)


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"action": "explode"},
        {"action": "resize"},
        {"action": "resize", "flavor_id": ""},
        {"action": "reboot", "type": "GENTLE"},
        {"action": "reboot", "flavor_id": "f"},
        {"action": "update-metadata"},
    ],
)
def test_bodies_that_are_refused(body):
    with pytest.raises(ValidationError):
        ACTIONS.validate_python(body)


@pytest.mark.parametrize(
    "fields",
    [{}, {"network_id": "n", "port_id": "p"}, {"network_id": ""}],
)
def test_attach_interface_takes_exactly_one_target(fields):
    with pytest.raises(ValidationError, match="exactly one"):
        AttachInterface.model_validate(
            {"action": "attach-interface", **fields}
        )
