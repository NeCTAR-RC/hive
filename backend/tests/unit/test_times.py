"""Every upstream timestamp reaches the SPA as ISO 8601 UTC with a ``Z``.

OpenStack sends naive UTC, which a browser would read as local time; each
summary below is fed one and must hand it on normalised.
"""

from datetime import date, datetime, UTC

import pytest

from hive.config import Settings
from hive.nectar import (
    databases,
    dns,
    magnum,
    objectstore,
    orchestration,
    outages,
    shares,
    usage,
)
from hive.nectar.images import ImageRules
from hive.services.background import BackgroundWork
from hive.services import (
    compute,
    credentials,
    loadbalancer,
    network,
    reservations,
    volumes,
)
from hive.services.context import Context
from hive.session.model import ProjectRef, ScopedToken
from hive.times import to_utc_iso, today_utc

NAIVE = "2026-10-01T02:03:04.000000"
EXPECTED = "2026-10-01T02:03:04Z"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("2026-10-01T02:03:04", "2026-10-01T02:03:04Z"),
        ("2026-10-01 02:03:04.123456", "2026-10-01T02:03:04.123Z"),
        ("2026-10-01T12:03:04+10:00", "2026-10-01T02:03:04Z"),
        ("2026-10-01T02:03:04Z", "2026-10-01T02:03:04Z"),
        ("Thu, 01 Oct 2026 02:03:04 GMT", "2026-10-01T02:03:04Z"),
        # Dates, epochs, junk and None pass through untouched.
        ("2026-10-01", "2026-10-01"),
        ("1696118400.12345", "1696118400.12345"),
        ("not a time at all", "not a time at all"),
        (None, None),
    ],
)
def test_to_utc_iso(value, expected):
    assert to_utc_iso(value) == expected


def test_today_utc_is_the_utc_date():
    assert today_utc() == datetime.now(UTC).date()


def test_usage_default_range_uses_the_given_day():
    assert usage.default_range(date(2026, 3, 31), days=30) == (
        "2026-03-01",
        "2026-03-31",
    )


def _ctx() -> Context:
    settings = Settings(
        _env_file=None,  # pyright: ignore[reportCallIssue]
        secret_key="x" * 32,
    )
    scoped = ScopedToken(
        token="t",
        expires_at=datetime.now(UTC),
        project=ProjectRef(id="p1", name="p"),
    )
    return Context(
        None,  # type: ignore[arg-type]
        settings,
        None,  # type: ignore[arg-type]
        scoped,
        BackgroundWork(),
    )


T = {"created_at": NAIVE, "updated_at": NAIVE}
TROVE = {"created": NAIVE, "updated": NAIVE}

# (summary under test, upstream record, output keys that carry a time)
CASES = [
    ("lb", lambda r: loadbalancer.lb_summary(r, None), T, ["created_at"]),
    ("listener", loadbalancer.listener_summary, T, ["updated_at"]),
    ("pool", loadbalancer.pool_summary, T, ["created_at"]),
    ("member", loadbalancer.member_summary, T, ["created_at"]),
    ("monitor", loadbalancer.monitor_summary, T, ["created_at"]),
    ("l7policy", loadbalancer.policy_summary, T, ["created_at"]),
    (
        "server",
        lambda r: compute.server_summary(_ctx(), r),
        {
            "created": NAIVE,
            "updated": NAIVE,
            "fault": {"created": NAIVE},
        },
        ["created", "updated", ("fault", "created")],
    ),
    (
        "app credential",
        credentials.app_credential_summary,
        {"expires_at": NAIVE},
        ["expires_at"],
    ),
    (
        "volume",
        lambda r: volumes.volume_summary(r),
        {**T, "attachments": [{"attached_at": NAIVE}]},
        ["created_at", ("attachments", 0, "attached_at")],
    ),
    (
        "volume snapshot",
        lambda r: volumes.snapshot_summary(r),
        T,
        ["created_at"],
    ),
    (
        "backup",
        lambda r: volumes.backup_summary(r),
        {**T, "data_timestamp": NAIVE},
        ["created_at", "data_timestamp"],
    ),
    ("subnet", network.subnet_summary, T, ["created_at"]),
    (
        "network",
        lambda r: network.network_summary(_ctx(), r, []),
        T,
        ["created_at"],
    ),
    ("port", network.port_summary, T, ["created_at"]),
    ("router", lambda r: network.router_summary(r, {}), T, ["created_at"]),
    (
        "floating ip",
        lambda r: network.floating_ip_summary(r, None, {}, {}),
        T,
        ["created_at"],
    ),
    ("trunk", lambda r: network.trunk_summary(r, {}), T, ["created_at"]),
    (
        "security group",
        lambda r: network.security_group_summary(r, False),
        T,
        ["created_at"],
    ),
    (
        "reservation",
        lambda r: reservations.reservation_summary(r, {}, datetime.now(UTC)),
        {"start": NAIVE, "end": NAIVE, "created_at": NAIVE},
        ["start", "end", "created_at"],
    ),
    ("dns zone", dns.zone_summary, T, ["created_at"]),
    (
        "dns recordset",
        lambda r: dns.recordset_summary(r, "example.org."),
        T,
        ["updated_at"],
    ),
    (
        "stack",
        orchestration.stack_summary,
        {"creation_time": NAIVE, "updated_time": NAIVE},
        ["creation_time", "updated_time"],
    ),
    (
        "stack resource",
        orchestration.resource_summary,
        {"creation_time": NAIVE},
        ["creation_time"],
    ),
    (
        "stack event",
        orchestration.event_summary,
        {"event_time": NAIVE},
        ["event_time"],
    ),
    ("database", databases.instance_summary, TROVE, ["created"]),
    ("database backup", databases.backup_summary, TROVE, ["created"]),
    (
        "database configuration",
        databases.configuration_summary,
        TROVE,
        ["updated"],
    ),
    (
        "swift object",
        lambda r: objectstore.object_summary(r, ""),
        {"name": "a.txt", "last_modified": NAIVE},
        ["last_modified"],
    ),
    (
        "swift object metadata",
        objectstore.object_metadata,
        {"last-modified": "Thu, 01 Oct 2026 02:03:04 GMT"},
        ["last_modified"],
    ),
    ("cluster template", magnum.template_summary, T, ["created_at"]),
    ("cluster", magnum.cluster_summary, T, ["created_at"]),
    ("node group", magnum.nodegroup_summary, T, ["updated_at"]),
    ("share", lambda r: shares.share_summary(r, False), T, ["created_at"]),
    ("share access", shares.access_summary, T, ["created_at"]),
    (
        "share snapshot",
        lambda r: shares.snapshot_summary(r, None),
        T,
        ["created_at"],
    ),
    (
        "security service",
        shares.security_service_summary,
        T,
        ["created_at"],
    ),
    ("share group", shares.group_summary, T, ["created_at"]),
    (
        "share group snapshot",
        lambda r: shares.group_snapshot_summary(r, None),
        T,
        ["created_at"],
    ),
    (
        "image",
        lambda r: ImageRules([], "private").summary(r, "p1"),
        T,
        ["created_at"],
    ),
    (
        "outage",
        lambda r: outages.serialise(r, "https://status.test/"),
        {"start": NAIVE, "end": NAIVE, "planned_end": NAIVE},
        ["start", "end", "planned_end"],
    ),
]


def _dig(value, path):
    for step in path if isinstance(path, tuple) else (path,):
        value = value[step]
    return value


@pytest.mark.parametrize(
    ("summary", "record", "keys"),
    [case[1:] for case in CASES],
    ids=[case[0] for case in CASES],
)
def test_summary_timestamps_end_with_z(summary, record, keys):
    out = summary(record)
    for key in keys:
        assert _dig(out, key) == EXPECTED, key


def test_usage_rows_end_with_z():
    rows = [{"id": "i1", "rate": 1, "begin": NAIVE, "end": NAIVE}]
    resources = [{"id": "i1", "started_at": NAIVE, "ended_at": None}]
    (item,) = usage.join_instances(rows, resources)
    assert item["begin"] == item["end"] == item["started_at"] == EXPECTED
    assert item["ended_at"] is None
