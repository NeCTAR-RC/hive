import pytest

from hive.nectar import orchestration
from hive.nectar.violation import RuleViolation


@pytest.mark.parametrize(
    ("status", "transitional"),
    [("CREATE_IN_PROGRESS", True), ("CREATE_COMPLETE", False)],
)
def test_is_transitional(status, transitional):
    assert orchestration.is_transitional(status) is transitional


@pytest.mark.parametrize(
    ("status", "actions"),
    [
        ("CREATE_COMPLETE", ["suspend", "check", "update", "delete"]),
        ("SUSPEND_COMPLETE", ["resume", "update", "delete"]),
        ("CREATE_FAILED", ["update", "delete"]),
        ("DELETE_IN_PROGRESS", []),
        ("DELETE_COMPLETE", ["delete"]),
    ],
)
def test_stack_actions_follow_the_status(status, actions):
    assert orchestration.stack_actions(status) == actions


def test_a_valid_stack_name_passes():
    orchestration.validate_stack_name("web-1")


@pytest.mark.parametrize("name", ["1web", ""])
def test_stack_names_start_with_a_letter(name):
    with pytest.raises(RuleViolation, match="start with a letter"):
        orchestration.validate_stack_name(name)


def test_parameter_specs_follow_group_order_and_heat_keys():
    validated = {
        "Description": "d",
        "ParameterGroups": [
            {"label": "Sizing", "parameters": ["flavor", "count"]}
        ],
        "Parameters": {
            "name": {
                "Type": "String",
                "Description": "n",
                "NoEcho": "false",
                "Label": "Name",
            },
            "count": {
                "Type": "Number",
                "Default": 1,
                "MinValue": 1,
                "MaxValue": 5,
                "Label": "Count",
            },
            "flavor": {
                "Type": "String",
                "Default": "m3.small",
                "CustomConstraint": "nova.flavor",
                "AllowedValues": ["m3.small", "m3.medium"],
            },
            "secret": {"Type": "String", "NoEcho": "true"},
            "tags": {"Type": "CommaDelimitedList", "Default": "a,b"},
            "meta": {"Type": "Json", "Default": {}},
            "flag": {"Type": "Boolean", "Default": False},
        },
    }
    specs = orchestration.parameter_specs(validated)
    assert [s["name"] for s in specs] == [
        "flavor",
        "count",
        "name",
        "secret",
        "tags",
        "meta",
        "flag",
    ]
    by_name = {s["name"]: s for s in specs}
    assert by_name["flavor"]["group"] == "Sizing"
    assert by_name["flavor"]["custom_constraint"] == "nova.flavor"
    assert by_name["flavor"]["allowed_values"] == ["m3.small", "m3.medium"]
    assert by_name['count']['type'] == 'number'
    assert by_name['count']['min_value'] == 1
    assert by_name['name']['required']
    assert by_name['name']['label'] == 'Name'
    assert by_name['secret']['no_echo']
    assert by_name['secret']['label'] == 'secret'
    assert by_name["tags"]["type"] == "comma_delimited_list"
    assert by_name['meta']['type'] == 'json'
    assert by_name['flag']['type'] == 'boolean'


def test_coerce_parameters_by_type():
    specs = orchestration.parameter_specs(
        {
            "Parameters": {
                "count": {"Type": "Number"},
                "flag": {"Type": "Boolean"},
                "tags": {"Type": "CommaDelimitedList"},
                "meta": {"Type": "Json"},
                "name": {"Type": "String", "Default": "x"},
                "ratio": {"Type": "Number", "Default": 1},
            }
        }
    )
    out = orchestration.coerce_parameters(
        {
            "count": "3",
            "flag": "yes",
            "tags": ["a", "b"],
            "meta": '{"k": 1}',
            "name": "",
            "ratio": "1.5",
        },
        specs,
    )
    assert out == {
        "count": 3,
        "flag": True,
        "tags": "a,b",
        "meta": {"k": 1},
        "ratio": 1.5,
    }
    assert orchestration.coerce_parameters(
        {"flag": False, "meta": {"a": 1}}, specs
    ) == {"flag": False, "meta": {"a": 1}}
    # A list of numbers joins too.
    assert orchestration.coerce_parameters({"tags": [1, 2]}, specs) == {
        "tags": "1,2"
    }
    with pytest.raises(ValueError, match="required"):
        orchestration.coerce_parameters({"count": ""}, specs)
    with pytest.raises(ValueError, match="number"):
        orchestration.coerce_parameters({"count": "abc"}, specs)
    with pytest.raises(ValueError, match="JSON"):
        orchestration.coerce_parameters({"meta": "{nope"}, specs)
    assert orchestration.coerce_parameters({"unknown": "v"}, specs) == {
        "unknown": "v"
    }


def test_stack_body_and_summaries():
    body = orchestration.stack_body(
        name="s",
        source={
            "template": {"heat_template_version": "2021-04-16"},
            "environment": {"parameters": {}},
            "files": {"a.yaml": "x"},
        },
        parameters={"count": 1},
        timeout_mins=30,
        rollback=True,
        tags=["a", "b"],
    )
    assert body['disable_rollback'] is False
    assert body['tags'] == 'a,b'
    assert body["template"]["heat_template_version"] == "2021-04-16"
    by_url = orchestration.stack_body(
        name="s",
        source={"template_url": "https://x/t.yaml"},
        parameters={},
        timeout_mins=60,
        rollback=False,
    )
    assert by_url['template_url'] == 'https://x/t.yaml'
    assert 'template' not in by_url
    summary = orchestration.stack_summary(
        {
            "id": "1",
            "stack_name": "s",
            "stack_status": "UPDATE_IN_PROGRESS",
            "tags": None,
        }
    )
    assert summary['is_transitional']
    assert summary['actions'] == ['cancel_update', 'delete']
    assert summary['tags'] == []
    detail = orchestration.stack_detail(
        {
            "id": "1",
            "stack_name": "s",
            "stack_status": "CREATE_COMPLETE",
            "outputs": [{"output_key": "ip", "output_value": "1.2.3.4"}],
            "parameters": {"OS::stack_id": "1"},
        }
    )
    assert detail['outputs'][0]['key'] == 'ip'
    assert detail['parameters'] == {'OS::stack_id': '1'}
    resource = orchestration.resource_summary(
        {
            "resource_name": "server",
            "resource_type": "OS::Nova::Server",
            "resource_status": "CREATE_IN_PROGRESS",
        }
    )
    assert resource['is_transitional']
    assert resource['type'] == 'OS::Nova::Server'
    event = orchestration.event_summary(
        {
            "id": "e",
            "resource_name": "server",
            "resource_status": "CREATE_COMPLETE",
        }
    )
    assert event["status"] == "CREATE_COMPLETE"
