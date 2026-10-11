"""Rules behind the orchestration, DNS, share and database panels."""

import pytest

from hive.nectar import databases, dns, orchestration, shares

# --- orchestration ----------------------------------------------------------------


def test_stack_status_and_actions():
    assert orchestration.is_transitional("CREATE_IN_PROGRESS")
    assert not orchestration.is_transitional("CREATE_COMPLETE")
    assert orchestration.stack_actions("CREATE_COMPLETE") == [
        "suspend",
        "check",
        "update",
        "delete",
    ]
    assert orchestration.stack_actions("SUSPEND_COMPLETE") == [
        "resume",
        "update",
        "delete",
    ]
    assert orchestration.stack_actions("CREATE_FAILED") == ["update", "delete"]
    assert orchestration.stack_actions("DELETE_IN_PROGRESS") == []
    assert orchestration.stack_actions("DELETE_COMPLETE") == ["delete"]
    assert orchestration.validate_stack_name("web-1") is None
    assert orchestration.validate_stack_name("1web") is not None
    assert orchestration.validate_stack_name("") is not None


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
    assert (
        by_name["count"]["type"] == "number"
        and by_name["count"]["min_value"] == 1
    )
    assert by_name["name"]["required"] and by_name["name"]["label"] == "Name"
    assert (
        by_name["secret"]["no_echo"] and by_name["secret"]["label"] == "secret"
    )
    assert by_name["tags"]["type"] == "comma_delimited_list"
    assert (
        by_name["meta"]["type"] == "json"
        and by_name["flag"]["type"] == "boolean"
    )


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
        template={"heat_template_version": "2021-04-16"},
        template_url=None,
        environment={"parameters": {}},
        files={"a.yaml": "x"},
        parameters={"count": 1},
        timeout_mins=30,
        rollback=True,
        tags=["a", "b"],
    )
    assert body["disable_rollback"] is False and body["tags"] == "a,b"
    assert body["template"]["heat_template_version"] == "2021-04-16"
    by_url = orchestration.stack_body(
        name="s",
        template=None,
        template_url="https://x/t.yaml",
        environment=None,
        files=None,
        parameters={},
        timeout_mins=60,
        rollback=False,
    )
    assert (
        by_url["template_url"] == "https://x/t.yaml"
        and "template" not in by_url
    )
    summary = orchestration.stack_summary(
        {
            "id": "1",
            "stack_name": "s",
            "stack_status": "UPDATE_IN_PROGRESS",
            "tags": None,
        }
    )
    assert (
        summary["is_transitional"]
        and summary["actions"] == ["delete"]
        and summary["tags"] == []
    )
    detail = orchestration.stack_detail(
        {
            "id": "1",
            "stack_name": "s",
            "stack_status": "CREATE_COMPLETE",
            "outputs": [{"output_key": "ip", "output_value": "1.2.3.4"}],
            "parameters": {"OS::stack_id": "1"},
        }
    )
    assert detail["outputs"][0]["key"] == "ip" and detail["parameters"] == {
        "OS::stack_id": "1"
    }
    resource = orchestration.resource_summary(
        {
            "resource_name": "server",
            "resource_type": "OS::Nova::Server",
            "resource_status": "CREATE_IN_PROGRESS",
        }
    )
    assert (
        resource["is_transitional"] and resource["type"] == "OS::Nova::Server"
    )
    event = orchestration.event_summary(
        {
            "id": "e",
            "resource_name": "server",
            "resource_status": "CREATE_COMPLETE",
        }
    )
    assert event["status"] == "CREATE_COMPLETE"


# --- dns -----------------------------------------------------------------------


def test_zone_validation_and_body():
    assert (
        dns.validate_zone("example.com.", "a@b.co", 3600, "PRIMARY", None)
        is None
    )
    assert "dot" in dns.validate_zone(
        "example.com", "a@b.co", None, "PRIMARY", None
    )
    assert "email" in dns.validate_zone(
        "example.com.", "nope", None, "PRIMARY", None
    )
    assert "negative" in dns.validate_zone(
        "example.com.", "a@b.co", -1, "PRIMARY", None
    )
    assert "master" in dns.validate_zone(
        "example.com.", "a@b.co", None, "SECONDARY", []
    )
    assert "PRIMARY" in dns.validate_zone(
        "example.com.", "a@b.co", None, "WEIRD", None
    )
    assert dns.validate_fqdn("-bad.com.") is not None
    body = dns.zone_body(
        "example.com.", "a@b.co", 300, "d", "SECONDARY", ["1.2.3.4"]
    )
    assert body == {
        "name": "example.com.",
        "email": "a@b.co",
        "type": "SECONDARY",
        "ttl": 300,
        "description": "d",
        "masters": ["1.2.3.4"],
    }
    assert "masters" not in dns.zone_body(
        "example.com.", "a@b.co", None, None, "PRIMARY", None
    )


@pytest.mark.parametrize(
    "rtype, record, ok",
    [
        ("A", "10.0.0.1", True),
        ("A", "::1", False),
        ("AAAA", "2001:db8::1", True),
        ("AAAA", "10.0.0.1", False),
        ("CNAME", "www.example.com.", True),
        ("CNAME", "www.example.com", False),
        ("MX", "10 mail.example.com.", True),
        ("MX", "mail.example.com.", False),
        ("SRV", "10 5 5060 sip.example.com.", True),
        ("SRV", "10 5 sip.example.com.", False),
        ("TXT", "anything goes", True),
        ("SSHFP", "1 1 abcdef", True),
        ("SSHFP", "x 1 abcdef", False),
        ("CAA", '0 issue "letsencrypt.org"', True),
        ("CAA", "issue", False),
        ("PTR", "host.example.com.", True),
        ("NS", "", False),
    ],
)
def test_record_validation(rtype, record, ok):
    assert (dns.validate_record(rtype, record) is None) is ok


def test_recordset_rules():
    zone = "example.com."
    assert dns.recordset_name(zone, "www") == "www.example.com."
    assert dns.recordset_name(zone, "www.example.com.") == "www.example.com."
    assert (
        dns.recordset_name(zone, "") == zone
        and dns.recordset_name(zone, "@") == zone
    )
    assert (
        dns.validate_recordset(
            zone, "www.example.com.", "A", ["10.0.0.1"], 300
        )
        is None
    )
    assert "zone name" in dns.validate_recordset(
        zone, "www.other.com.", "A", ["10.0.0.1"], None
    )
    assert "one record" in dns.validate_recordset(
        zone, "a.example.com.", "CNAME", ["x.", "y."], None
    )
    assert "supported" in dns.validate_recordset(
        zone, "a.example.com.", "SOA", ["x"], None
    )
    assert "at least one" in dns.validate_recordset(
        zone, "a.example.com.", "A", [], None
    )
    assert "negative" in dns.validate_recordset(
        zone, "a.example.com.", "A", ["10.0.0.1"], -5
    )
    assert dns.quote_txt(['v=spf1 -all', '"already"', 'say "hi"']) == [
        '"v=spf1 -all"',
        '"already"',
        '"say \\"hi\\""',
    ]
    assert not dns.can_edit_recordset({"type": "SOA", "name": zone}, zone)
    assert not dns.can_edit_recordset({"type": "NS", "name": zone}, zone)
    assert dns.can_edit_recordset(
        {"type": "NS", "name": "sub.example.com."}, zone
    )
    assert dns.can_edit_recordset(
        {"type": "A", "name": "www.example.com."}, zone
    )
    summary = dns.recordset_summary(
        {
            "id": "r",
            "type": "A",
            "name": "www.example.com.",
            "status": "PENDING",
        },
        zone,
    )
    assert summary["is_transitional"] and summary["can_edit"]
    body = dns.recordset_body(
        "www.example.com.", "A", [" 10.0.0.1 ", ""], 60, "d"
    )
    assert body == {
        "name": "www.example.com.",
        "type": "A",
        "records": ["10.0.0.1"],
        "ttl": 60,
        "description": "d",
    }
    zone_summary = dns.zone_summary(
        {"id": "z", "name": zone, "status": "ACTIVE", "action": "NONE"}
    )
    assert (
        not zone_summary["is_transitional"] and zone_summary["masters"] == []
    )


# --- shares --------------------------------------------------------------------


def test_share_actions_follow_status_and_snapshots():
    available = {
        "status": "available",
        "snapshot_support": True,
        "revert_to_snapshot_support": True,
    }
    assert shares.share_actions(available, False) == [
        "edit",
        "metadata",
        "snapshot",
        "resize",
        "revert",
        "rules",
        "delete",
    ]
    assert "delete" not in shares.share_actions(available, True)
    assert shares.share_actions({"status": "creating"}, False) == ["rules"]
    assert shares.share_actions({"status": "error"}, False) == [
        "rules",
        "delete",
    ]
    assert "snapshot" not in shares.share_actions(
        {"status": "in-use", "snapshot_support": False}, False
    )
    assert shares.is_transitional("Migrating_To")
    assert shares.snapshot_actions(
        {"status": "available"}, {"mount_snapshot_support": True}
    ) == [
        "edit",
        "create_share",
        "rules",
        "delete",
    ]
    assert shares.snapshot_actions({"status": "creating"}, None) == ["edit"]
    assert shares.group_actions({"status": "available"}) == [
        "snapshot",
        "edit",
        "delete",
    ]
    assert shares.group_actions({"status": "creating"}) == []
    assert shares.group_snapshot_actions({"status": "error"}) == [
        "edit",
        "delete",
    ]


def test_share_metadata_parsing():
    assert shares.parse_metadata("a=1\n\n b = two \n") == {
        "a": "1",
        "b": "two",
    }
    for bad in ("novalue", "a b=1", "a=1\na=2", "=x", "k=" + "v" * 256):
        with pytest.raises(ValueError):
            shares.parse_metadata(bad)


def test_share_quota_and_sizes():
    assert shares.can_create(
        {
            "maxTotalShares": 2,
            "totalSharesUsed": 1,
            "maxTotalShareGigabytes": -1,
        }
    ) == (True, None)
    ok, reason = shares.can_create({"maxTotalShares": 1, "totalSharesUsed": 1})
    assert not ok and "shares quota" in reason
    ok, reason = shares.can_create(
        {"maxTotalShareGigabytes": 10, "totalShareGigabytesUsed": 10}
    )
    assert not ok and "storage" in reason
    ok, reason = shares.can_snapshot(
        {"maxTotalShareSnapshots": 0, "totalShareSnapshotsUsed": 0}
    )
    assert not ok
    assert shares.can_snapshot({}) == (True, None)
    limits = {"maxTotalShareGigabytes": 20, "totalShareGigabytesUsed": 15}
    assert shares.validate_resize(5, 10, limits) is None
    assert shares.validate_resize(5, 5, limits) is not None
    assert shares.validate_resize(5, 0, limits) is not None
    assert "quota" in shares.validate_resize(5, 11, limits)
    assert shares.validate_resize(5, 2, limits) is None
    assert (
        shares.validate_create(
            protocol="NFS",
            protocols=("NFS",),
            size=1,
            share_type="t",
            snapshot=None,
        )
        is None
    )
    assert "protocol" in shares.validate_create(
        protocol="GLUSTER",
        protocols=("NFS",),
        size=1,
        share_type="t",
        snapshot=None,
    )
    assert "snapshot size" in shares.validate_create(
        protocol="NFS",
        protocols=("NFS",),
        size=1,
        share_type="t",
        snapshot={"size": 5},
    )
    assert "share type" in shares.validate_create(
        protocol="NFS",
        protocols=("NFS",),
        size=1,
        share_type="",
        snapshot=None,
    )


def test_share_access_and_bodies():
    assert shares.validate_access("ip", "10.0.0.0/24", "rw") is None
    assert shares.validate_access("ip", "nope", "rw") is not None
    assert shares.validate_access("user", "alice", "ro") is None
    assert shares.validate_access("cert", "x" * 300, "ro") is not None
    assert shares.validate_access("bad", "x", "rw") is not None
    assert shares.validate_access("ip", "10.0.0.1", "rwx") is not None
    body = shares.create_body(
        name="s",
        description=None,
        protocol="NFS",
        size=2,
        share_type="cephfs",
        availability_zone="ardctest-artm",
        snapshot_id="snap",
        share_group_id=None,
        metadata={"k": "v"},
        is_public=False,
    )
    assert (
        body["snapshot_id"] == "snap"
        and body["availability_zone"] == "ardctest-artm"
    )
    assert body["scheduler_hints"] == {} and body["description"] == ""
    assert (
        shares.newest_snapshot(
            [
                {"id": "a", "created_at": "2026-01-01"},
                {"id": "b", "created_at": "2026-02-01"},
            ]
        )["id"]
        == "b"
    )
    assert shares.newest_snapshot([]) is None
    assert shares.security_service_body(
        {"name": "n", "ou": "", "password": None, "type": "ldap"}
    ) == {"name": "n", "type": "ldap"}
    group = shares.group_body(
        name="g",
        description="d",
        share_group_type_id="gt",
        share_types=["st"],
        availability_zone=None,
        snapshot_id=None,
    )
    assert group == {
        "name": "g",
        "description": "d",
        "share_group_type_id": "gt",
        "share_types": ["st"],
    }
    from_snap = shares.group_body(
        name="g",
        description=None,
        share_group_type_id="gt",
        share_types=["st"],
        availability_zone="az",
        snapshot_id="gs",
    )
    assert from_snap == {
        "name": "g",
        "source_share_group_snapshot_id": "gs",
        "availability_zone": "az",
    }
    stype = shares.share_type_summary(
        {
            "id": "t",
            "name": "cephfs",
            "extra_specs": {
                "driver_handles_share_servers": "False",
                "snapshot_support": "True",
            },
        }
    )
    assert (
        not stype["driver_handles_share_servers"] and stype["snapshot_support"]
    )
    detail = shares.share_detail(
        {"id": "s", "status": "available"},
        [{"id": "r", "access_type": "ip", "access_to": "10.0.0.1"}],
        [{"path": "1.2.3.4:/x", "preferred": True}],
        False,
    )
    assert (
        detail["export_locations"][0]["path"] == "1.2.3.4:/x"
        and detail["access_rules"][0]["id"] == "r"
    )
    service = shares.security_service_summary(
        {"id": "x", "type": "active_directory"}
    )
    assert service["type_label"] == "Active Directory"


# --- databases -----------------------------------------------------------------


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
    assert (
        "detach_configuration" in attached
        and "attach_configuration" not in attached
    )
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
        "enable",
        "disable",
        "discard",
    ]
    assert databases.log_actions({"type": "SYS", "published": 0}) == [
        "publish",
        "enable",
        "discard",
    ]
    summary = databases.log_summary(
        {
            "name": "slow",
            "type": "USER",
            "container": "None",
            "prefix": "None",
            "published": "0",
        }
    )
    assert (
        summary["container"] is None
        and summary["prefix"] is None
        and summary["published"] == 0
    )
    assert databases.log_action_body("general", "discard") == {
        "name": "general",
        "discard": 1,
    }
    with pytest.raises(ValueError):
        databases.log_action_body("general", "delete")

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


def test_database_cidrs_and_launch():
    assert databases.validate_cidrs([" 10.0.0.0/8 ", ""]) == (
        ["10.0.0.0/8"],
        None,
    )
    assert databases.validate_cidrs([])[1] is not None
    assert databases.validate_cidrs(["nope"])[1] is not None
    assert databases.cidr_warning(["0.0.0.0/0"]) is not None
    assert databases.cidr_warning(["10.0.0.0/8"]) is None
    assert (
        databases.validate_launch(
            name="db",
            volume=1,
            datastore="mysql",
            version="8.0",
            flavor="f",
            network="n",
        )
        is None
    )
    assert "80" in databases.validate_launch(
        name="x" * 81,
        volume=1,
        datastore="m",
        version="v",
        flavor="f",
        network="n",
    )
    assert "volume" in databases.validate_launch(
        name="db",
        volume=0,
        datastore="m",
        version="v",
        flavor="f",
        network="n",
    )
    assert "datastore" in databases.validate_launch(
        name="db",
        volume=1,
        datastore=None,
        version="v",
        flavor="f",
        network="n",
    )
    assert "flavor" in databases.validate_launch(
        name="db",
        volume=1,
        datastore="m",
        version="v",
        flavor=None,
        network="n",
    )
    assert "network" in databases.validate_launch(
        name="db",
        volume=1,
        datastore="m",
        version="v",
        flavor="f",
        network=None,
    )
    assert databases.split_databases(" a, b ,,c") == ["a", "b", "c"]
    assert databases.validate_initial_user("u", None, ["d"]) is not None
    assert databases.validate_initial_user("u", "p", []) is not None
    assert databases.validate_initial_user("u", "p", ["d"]) is None
    assert databases.validate_initial_user(None, None, []) is None
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
    assert body["nics"] == [{"net-id": "net"}] and body["volume"] == {
        "size": 5
    }
    assert "type" not in body["volume"]
    assert body["users"] == [
        {
            "name": "u",
            "password": "p",
            "databases": [{"name": "app"}],
            "host": "%",
        }
    ]
    assert (
        body["restorePoint"] == {"backupRef": "b"}
        and body["configuration"] == "cfg"
    )
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
    assert (
        "users" not in minimal
        and "databases" not in minimal
        and "availability_zone" not in minimal
    )
    assert databases.validate_resize_volume(5, 5) is not None
    assert databases.validate_resize_volume(5, 6) is None


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
    assert (
        summary["flavor_name"] == "db3.small"
        and summary["ram"] == 2048
        and summary["addresses"] == ["10.0.0.5"]
    )
    detail = databases.instance_detail(instance)
    assert (
        detail["allowed_cidrs"] == ["0.0.0.0/0"]
        and detail["port"] == 3306
        and detail["cidr_warning"] is None
    )
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
    assert (
        backup["instance_name"] == "db"
        and backup["incremental"]
        and backup["can_restore"]
    )
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
    assert config["datastore_version"] == "8.0" and config["values"] == {
        "a": 1
    }
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
    assert databases.user_path("u", None) == "u"
    assert databases.user_path("u", "10.0.0.1") == "u@10%2e0%2e0%2e1"
