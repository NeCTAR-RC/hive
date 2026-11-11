from hive.services.orchestration import editable_environment


def test_editable_environment_drops_parameters_and_empty_sections():
    stored = {
        "parameters": {"flavor": "m3.small", "db_password": "******"},
        "parameter_defaults": {"count": 2},
        "resource_registry": {
            "resources": {},
            "My::Server": "server.yaml",
        },
        "encrypted_param_names": ["db_password"],
        "event_sinks": [],
    }
    assert editable_environment(stored) == {
        "parameter_defaults": {"count": 2},
        "resource_registry": {"My::Server": "server.yaml"},
    }


def test_editable_environment_of_a_plain_stack_is_empty():
    assert (
        editable_environment(
            {
                "parameters": {"count": "1"},
                "parameter_defaults": {},
                "resource_registry": {"resources": {}},
                "encrypted_param_names": [],
                "event_sinks": [],
                "parameter_merge_strategies": {},
            }
        )
        == {}
    )
