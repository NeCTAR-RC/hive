from typing import get_args

import pytest

from hive.nectar import databases
from hive.nectar.violation import RuleViolation


def test_database_instance_actions_and_status():
    active = {"status": "ACTIVE", "configuration": None}
    assert databases.instance_actions(active) == [
        "backup",
        "update",
        "resize_volume",
        "root",
        "attach_configuration",
        "resize",
        "upgrade",
        "restart",
        "delete",
    ]
    attached = databases.instance_actions(
        {"status": "HEALTHY", "configuration": {"id": "c"}}
    )
    assert 'detach_configuration' in attached
    assert 'attach_configuration' not in attached
    assert databases.instance_actions({"status": "SHUTOFF"}) == [
        "resize",
        "upgrade",
        "delete",
    ]
    assert databases.instance_actions({"status": "RESTART_REQUIRED"}) == [
        "restart",
        "delete",
    ]
    assert databases.instance_actions({"status": "BUILD"}) == ["delete"]
    assert databases.instance_status_kind("UPGRADE") == "transitional"
    assert databases.instance_status_kind("ERROR") == "error"
    assert databases.instance_status_kind("BLOCKED") == "ok"
    assert databases.instance_status_kind("WHAT") == "unknown"
    assert databases.backup_status_kind("SAVING") == "transitional"
    assert databases.backup_status_kind("FAILED") == "error"
    assert databases.backup_status_kind("RESTORED") == "ok"
    assert databases.backup_status_kind("X") == "unknown"


def test_database_flavors_defaults_and_logs():
    flavors = [
        {"id": "a", "name": "a"},
        {"id": "b", "name": "b"},
        {"id": None, "name": "x"},
    ]
    assert [f["id"] for f in databases.resize_candidates(flavors, "a")] == [
        "b"
    ]
    stores = [
        {
            "id": "ds-1",
            "name": "mysql",
            "versions": [{"id": "v-1", "name": "8.0"}, {"name": "8.4"}],
        }
    ]
    assert databases.version_ids(stores, "mysql", "8.0") == ("ds-1", "v-1")
    assert databases.version_ids(stores, "mysql", "8.4") is None
    assert databases.version_ids(stores, "postgresql", "16") is None
    assert databases.configuration_defaults(
        {"port": 3306, "basedir": "/usr"}
    ) == [
        {"name": "basedir", "value": "/usr"},
        {"name": "port", "value": 3306},
    ]

    assert databases.log_status_kind("Published") == "ok"
    assert databases.log_status_kind("Failed") == "error"
    assert databases.log_status_kind("Restart_Required") == "warning"
    assert databases.log_status_kind("Disabled") == "unknown"
    user_log = {
        "name": "general",
        "type": "USER",
        "status": "Published",
        "published": 10,
        "container": "c",
    }
    assert databases.log_actions(user_log) == [
        "view",
        "publish",
        "disable",
        "discard",
    ]
    assert databases.log_actions(
        {"type": "USER", "status": "Disabled", "published": 0}
    ) == ["publish", "enable", "discard"]
    assert databases.log_actions(
        {"type": "SYS", "status": "Published", "published": 0}
    ) == ["publish", "discard"]
    summary = databases.log_summary(
        {
            "name": "slow",
            "type": "USER",
            "container": "None",
            "prefix": "None",
            "published": "0",
        }
    )
    assert summary['container'] is None
    assert summary['prefix'] is None
    assert summary['published'] == 0
    for action in get_args(databases.LogAction):
        assert databases.log_action_body("general", action) == {
            "name": "general",
            action: 1,
        }

    parts = [
        {"name": "p1", "last_modified": "2026-10-01", "lines": 3},
        {"name": "p3", "last_modified": "2026-10-03", "lines": 2},
        {"name": "p2", "last_modified": "2026-10-02", "lines": 4},
    ]
    assert databases.select_log_parts(parts, 0) == (["p1", "p2", "p3"], 0)
    assert databases.select_log_parts(parts, 2) == (["p3"], 2)
    assert databases.select_log_parts(parts, 3) == (["p2", "p3"], 1)
    assert databases.select_log_parts(parts, 6) == (["p2", "p3"], 4)
    assert databases.select_log_parts(parts, 9) == (["p1", "p2", "p3"], 3)
    assert databases.select_log_parts(parts, 50) == (["p1", "p2", "p3"], 50)
    assert databases.select_log_parts([], 5) == ([], 5)


def test_cidrs_are_trimmed_and_blanks_dropped():
    assert databases.validate_cidrs([" 10.0.0.0/8 ", ""]) == ["10.0.0.0/8"]


@pytest.mark.parametrize(
    ("cidrs", "says"), [([], "at least one"), (["nope"], "not a valid CIDR")]
)
def test_cidrs_that_break_the_rules(cidrs, says):
    with pytest.raises(RuleViolation, match=says):
        databases.validate_cidrs(cidrs)


@pytest.mark.parametrize(
    ("cidrs", "warned"), [(["0.0.0.0/0"], True), (["10.0.0.0/8"], False)]
)
def test_an_open_cidr_is_warned_about(cidrs, warned):
    assert (databases.cidr_warning(cidrs) is not None) is warned


LAUNCH = {
    "name": "db",
    "volume": 1,
    "datastore": "mysql",
    "version": "8.0",
    "flavor": "f",
    "network": "n",
}


def test_a_complete_launch_passes():
    databases.validate_launch(**LAUNCH)


@pytest.mark.parametrize(
    ("overrides", "says"),
    [
        ({"name": "x" * 81}, "80"),
        ({"volume": 0}, "volume"),
        ({"datastore": None}, "datastore"),
        ({"flavor": None}, "flavor"),
        ({"network": None}, "network"),
    ],
)
def test_launches_that_break_the_rules(overrides, says):
    with pytest.raises(RuleViolation, match=says):
        databases.validate_launch(**{**LAUNCH, **overrides})


@pytest.mark.parametrize(
    ("user", "password", "names"),
    [("u", "password", ["d"]), (None, None, [])],
)
def test_initial_users_that_pass(user, password, names):
    databases.validate_initial_user(user, password, names)


@pytest.mark.parametrize(
    ("password", "names", "says"),
    [
        (None, ["d"], "password"),
        ("short", ["d"], "at least 8"),
        ("password", [], "database"),
    ],
)
def test_initial_users_that_break_the_rules(password, names, says):
    with pytest.raises(RuleViolation, match=says):
        databases.validate_initial_user("u", password, names)


def test_a_volume_only_grows():
    databases.validate_resize_volume(5, 6)
    with pytest.raises(RuleViolation, match="greater than the current"):
        databases.validate_resize_volume(5, 5)


def test_split_databases():
    assert databases.split_databases(" a, b ,,c") == ["a", "b", "c"]


def test_launch_body():
    body = databases.launch_body(
        name="db",
        flavor="f",
        volume=5,
        datastore="mysql",
        version="8.0",
        network_id="net",
        availability_zone="ardctest-artm",
        allowed_cidrs=["10.0.0.0/8"],
        databases=["app"],
        user="u",
        password="p",
        host="%",
        configuration="cfg",
        backup_id="b",
    )
    assert body['nics'] == [{'net-id': 'net'}]
    assert body['volume'] == {'size': 5}
    assert "type" not in body["volume"]
    assert body["users"] == [
        {
            "name": "u",
            "password": "p",
            "databases": [{"name": "app"}],
            "host": "%",
        }
    ]
    assert body['restorePoint'] == {'backupRef': 'b'}
    assert body['configuration'] == 'cfg'
    assert body["access"] == {"allowed_cidrs": ["10.0.0.0/8"]}
    minimal = databases.launch_body(
        name="db",
        flavor="f",
        volume=1,
        datastore="m",
        version="v",
        network_id="n",
        availability_zone=None,
        allowed_cidrs=["0.0.0.0/0"],
        databases=[],
        user=None,
        password=None,
        host=None,
        configuration=None,
        backup_id=None,
    )
    assert 'users' not in minimal
    assert 'databases' not in minimal
    assert 'availability_zone' not in minimal


def test_database_summaries_and_parameters():
    datastores = [
        {
            "id": "ds1",
            "name": "mysql",
            "versions": [
                {"id": "v1", "name": "8.0", "active": True},
                {"id": "v0", "name": "5.7", "active": False},
            ],
        }
    ]
    assert databases.datastore_options(datastores) == [
        {
            "datastore": "mysql",
            "datastore_id": "ds1",
            "version": "8.0",
            "version_id": "v1",
            "label": "mysql - 8.0",
        }
    ]
    flavor = databases.flavor_summary(
        {"id": None, "str_id": "db3.small", "name": "db3.small", "ram": 2048}
    )
    assert flavor["id"] == "db3.small"
    assert databases.flavor_summary({"id": 7, "name": "x"})["id"] == "7"
    instance = {
        "id": "i",
        "name": "db",
        "status": "ACTIVE",
        "datastore": {"type": "mysql", "version": "8.0"},
        "flavor": {"id": "db3.small"},
        "volume": {"size": 5, "used": 1.2},
        "addresses": [{"type": "private", "address": "10.0.0.5"}],
        "access": {"allowed_cidrs": []},
    }
    summary = databases.instance_summary(
        instance, {"db3.small": {"name": "db3.small", "ram": 2048}}
    )
    assert summary['flavor_name'] == 'db3.small'
    assert summary['ram'] == 2048
    assert summary['addresses'] == ['10.0.0.5']
    detail = databases.instance_detail(instance)
    assert detail['allowed_cidrs'] == ['0.0.0.0/0']
    assert detail['port'] == 3306
    assert detail['cidr_warning'] is None
    backup = databases.backup_summary(
        {
            "id": "b",
            "status": "COMPLETED",
            "instance_id": "i",
            "parent_id": "p",
            "datastore": {"type": "mysql"},
        },
        {"i": "db"},
    )
    assert backup['instance_name'] == 'db'
    assert backup['incremental']
    assert backup['can_restore']
    assert databases.backup_body("b", "i", None, None) == {
        "name": "b",
        "instance": "i",
        "incremental": 0,
    }
    assert databases.backup_body("b", "i", "d", "p")["incremental"] == 1
    config = databases.configuration_summary(
        {
            "id": "c",
            "name": "cfg",
            "datastore_name": "mysql",
            "datastore_version_name": "8.0",
            "values": {"a": 1},
        }
    )
    assert config['datastore_version'] == '8.0'
    assert config['values'] == {'a': 1}
    assert databases.configuration_body("c", None, "mysql", "8.0") == {
        "name": "c",
        "values": {},
        "datastore": {"type": "mysql", "version": "8.0"},
    }
    assert (
        databases.coerce_parameter({"name": "b", "type": "boolean"}, "True")
        is True
    )
    assert (
        databases.coerce_parameter(
            {"name": "n", "type": "integer", "min": 1, "max": 10}, "5"
        )
        == 5
    )
    assert (
        databases.coerce_parameter({"name": "f", "type": "float"}, "0.5")
        == 0.5
    )
    assert (
        databases.coerce_parameter({"name": "s", "type": "string"}, " x ")
        == "x"
    )
    for spec, value in (
        ({"name": "b", "type": "boolean"}, "maybe"),
        ({"name": "n", "type": "integer"}, "x"),
        ({"name": "n", "type": "integer", "min": 1}, "0"),
        ({"name": "n", "type": "long", "max": 1}, "2"),
    ):
        with pytest.raises(ValueError):
            databases.coerce_parameter(spec, value)
    assert databases.user_summary(
        {"name": "u", "databases": [{"name": "d"}]}
    ) == {"name": "u", "host": "%", "databases": ["d"]}
    assert databases.user_ident("u", None) == "u"
    assert databases.user_ident("u", "%") == "u"
    assert databases.user_ident("u", "10.0.0.1") == "u@10.0.0.1"


def test_a_user_edit_sends_only_what_changes():
    assert databases.user_update_fields(None, "secret-pw", "") == {
        "password": "secret-pw"
    }
    assert databases.user_update_fields("bob", None, "10.0.0.5") == {
        "name": "bob",
        "host": "10.0.0.5",
    }
    with pytest.raises(RuleViolation, match="must be specified"):
        databases.user_update_fields(None, "", None)
