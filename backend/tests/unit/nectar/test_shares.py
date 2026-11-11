import pytest

from hive.nectar import shares
from hive.nectar.violation import RuleViolation


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


def test_quota_gates_create_and_snapshot():
    assert shares.can_create(
        {
            "maxTotalShares": 2,
            "totalSharesUsed": 1,
            "maxTotalShareGigabytes": -1,
        }
    ) == (True, None)
    ok, reason = shares.can_create({"maxTotalShares": 1, "totalSharesUsed": 1})
    assert not ok
    assert 'shares quota' in reason
    ok, reason = shares.can_create(
        {"maxTotalShareGigabytes": 10, "totalShareGigabytesUsed": 10}
    )
    assert not ok
    assert 'storage' in reason
    ok, reason = shares.can_snapshot(
        {"maxTotalShareSnapshots": 0, "totalShareSnapshotsUsed": 0}
    )
    assert not ok
    assert shares.can_snapshot({}) == (True, None)


LIMITS = {"maxTotalShareGigabytes": 20, "totalShareGigabytesUsed": 15}


@pytest.mark.parametrize("new_size", [10, 2])
def test_resizes_within_quota_pass(new_size):
    shares.validate_resize(5, new_size, LIMITS)


@pytest.mark.parametrize(
    ("new_size", "says"),
    [(5, "differ"), (0, "greater than zero"), (11, "quota")],
)
def test_resizes_that_break_the_rules(new_size, says):
    with pytest.raises(RuleViolation, match=says):
        shares.validate_resize(5, new_size, LIMITS)


def create_rules(**overrides):
    args = {
        "protocol": "NFS",
        "protocols": ("NFS",),
        "size": 1,
        "share_type": "t",
        "snapshot": None,
    }
    shares.validate_create(**{**args, **overrides})


def test_a_complete_share_passes():
    create_rules()


@pytest.mark.parametrize(
    ("overrides", "says"),
    [
        ({"protocol": "GLUSTER"}, "protocol"),
        ({"snapshot": {"size": 5}}, "snapshot size"),
        ({"share_type": ""}, "share type"),
        ({"size": 0}, "at least 1"),
    ],
)
def test_shares_that_break_the_rules(overrides, says):
    with pytest.raises(RuleViolation, match=says):
        create_rules(**overrides)


@pytest.mark.parametrize(
    ("access_type", "access_to", "level"),
    [
        ("ip", "10.0.0.0/24", "rw"),
        ("ip", "2001:db8::1", "rw"),
        ("user", "alice", "ro"),
        ("user", "alice.smith@corp", "ro"),
        ("cert", "client.example.org", "rw"),
        ("cephx", "alice_data-1", "rw"),
    ],
)
def test_access_rules_that_pass(access_type, access_to, level):
    shares.validate_access(access_type, access_to, level)


@pytest.mark.parametrize(
    ("access_type", "access_to", "level", "says"),
    [
        ("ip", "nope", "rw", "not an IP"),
        ("cert", "x" * 300, "ro", "255"),
        ("bad", "x", "rw", "access type"),
        ("ip", "10.0.0.1", "rwx", "access level"),
        ("user", "bob", "rw", "4 to 255"),
        ("user", "CORP\\alice", "rw", "4 to 255"),
        ("user", "....", "rw", "4 to 255"),
        ("cert", "x" * 65, "rw", "1 to 64"),
        ("cephx", "client.alice", "rw", "letters, digits"),
        ("cephx", "al\u00efce", "rw", "letters, digits"),
    ],
)
def test_access_rules_that_break_the_rules(
    access_type, access_to, level, says
):
    with pytest.raises(RuleViolation, match=says):
        shares.validate_access(access_type, access_to, level)


def test_share_bodies_and_summaries():
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
    assert body['snapshot_id'] == 'snap'
    assert body['availability_zone'] == 'ardctest-artm'
    assert body['scheduler_hints'] == {}
    assert body['description'] == ''
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
    assert not stype['driver_handles_share_servers']
    assert stype['snapshot_support']
    detail = shares.share_detail(
        {"id": "s", "status": "available"},
        [{"id": "r", "access_type": "ip", "access_to": "10.0.0.1"}],
        [{"path": "1.2.3.4:/x", "preferred": True}],
        False,
    )
    assert detail['export_locations'][0]['path'] == '1.2.3.4:/x'
    assert detail['access_rules'][0]['id'] == 'r'
    service = shares.security_service_summary(
        {"id": "x", "type": "active_directory"}
    )
    assert service["type_label"] == "Active Directory"


def test_resizing_shares_are_polled_like_horizon():
    for status in ("extending", "shrinking", "creating", "EXTENDING"):
        assert shares.is_transitional(status), status
    for status in ("available", "extending_error", "shrinking_error"):
        assert not shares.is_transitional(status), status


def test_public_shares_follow_the_deployment():
    shares.validate_public(None, allowed=False)
    shares.validate_public(False, allowed=False)
    shares.validate_public(True, allowed=True)
    with pytest.raises(RuleViolation, match="administrators"):
        shares.validate_public(True, allowed=False)
