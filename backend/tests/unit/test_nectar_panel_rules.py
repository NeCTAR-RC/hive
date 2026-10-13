"""Rules behind the Nectar panels: members, credentials, reservations
and usage."""

from datetime import date, datetime, UTC

import pytest

from hive.nectar import credentials, members, reservations, usage

NOW = datetime(2026, 10, 10, 3, 0, tzinfo=UTC)


# --- members -------------------------------------------------------------------


def test_member_rows_keep_only_member_and_tenantmanager():
    assignments = [
        {
            "user": {"id": "u1", "name": "me"},
            "role": {"id": "r1", "name": "Member"},
        },
        {
            "user": {"id": "u2", "name": "ann"},
            "role": {"id": "r2", "name": "tenantmanager"},
        },
        {
            "user": {"id": "u3", "name": "bot"},
            "role": {"id": "r9", "name": "reservation_bot"},
        },
        {"group": {"id": "g1"}, "role": {"id": "r1", "name": "member"}},
    ]
    rows = members.member_rows(assignments, "u1")
    assert [r["id"] for r in rows] == ["u2-r2", "u1-r1"]
    assert rows[1]["is_self"] is True and rows[1]["can_remove"] is False
    assert rows[0]["can_remove"] is True
    assert rows[0]["role_name"] == "tenantmanager"


def test_role_choices_skip_unconfigured_roles():
    assert members.role_choices(None, "tm") == [
        {"id": "tm", "name": "tenantmanager"}
    ]
    choices = members.role_choices("m", "tm")
    assert members.removable_role("m", choices)
    assert not members.removable_role("other", choices)


# --- credentials ---------------------------------------------------------------


def test_default_expiry_adds_three_months_and_clamps_the_day():
    assert (
        credentials.default_expiry(datetime(2026, 11, 30, tzinfo=UTC))
        == "2027-02-28"
    )
    assert (
        credentials.default_expiry(datetime(2026, 1, 31, tzinfo=UTC), 1)
        == "2026-02-28"
    )
    assert (
        credentials.default_expiry(datetime(2026, 10, 10, tzinfo=UTC))
        == "2027-01-10"
    )


def test_expires_at_follows_horizon_rules():
    today = date(2026, 10, 10)
    assert credentials.expires_at(None, None, today) is None
    assert (
        credentials.expires_at("2027-01-10", None, today)
        == "2027-01-10T00:00:00.000000Z"
    )
    assert (
        credentials.expires_at("2027-01-10", "14:30", today)
        == "2027-01-10T14:30:00.000000Z"
    )
    assert (
        credentials.expires_at(None, "09:00", today)
        == "2026-10-10T09:00:00.000000Z"
    )


def test_application_credential_body():
    body = credentials.application_credential_body(
        name="deploy",
        description="",
        secret=None,
        expiration_date="2027-01-10",
        expiration_time=None,
        roles=["member", ""],
        access_rules='[{"service": "compute", "method": "GET", "path": "/v2.1/servers"}]',
        unrestricted=False,
    )
    assert body == {
        "name": "deploy",
        "unrestricted": False,
        "expires_at": "2027-01-10T00:00:00.000000Z",
        "roles": [{"name": "member"}],
        "access_rules": [
            {"service": "compute", "method": "GET", "path": "/v2.1/servers"}
        ],
    }
    with pytest.raises(ValueError):
        credentials.parse_access_rules("not json")
    with pytest.raises(ValueError):
        credentials.parse_access_rules('{"service": "compute"}')
    assert credentials.parse_access_rules("  ") is None


def test_ec2_for_project():
    creds = [
        {"tenant_id": "p1", "access": "a"},
        {"tenant_id": "p2", "access": "b"},
    ]
    assert credentials.ec2_for_project(creds, "p2")["access"] == "b"
    assert credentials.ec2_for_project(creds, "p3") is None


# --- reservations --------------------------------------------------------------


def test_limits_summary_converts_hours_to_days():
    limits = reservations.limits_summary(
        {
            "maxHours": 240,
            "totalHoursUsed": 25,
            "maxReservations": 2,
            "totalReservationsUsed": 1,
        }
    )
    assert limits["max_days"] == 10 and limits["days_used"] == 2
    assert limits["days_left"] == 8 and limits["reservations_left"] == 1
    assert limits["can_create"] is True
    blocked = reservations.limits_summary(
        {"maxHours": 0, "maxReservations": 0}
    )
    assert blocked["can_create"] is False
    unlimited = reservations.limits_summary(
        {"maxHours": -1, "maxReservations": -1}
    )
    assert unlimited["max_days"] is None and unlimited["can_create"] is True


FLAVOR = {
    "id": "f1",
    "name": "ardc.g3.xlarge",
    "max_length_hours": 168,
    "extra_specs": {"nectar:rate": "0.899"},
    "category": "GPU",
    "availability_zone": "ardctest-artm",
}


def test_flavor_summary_and_actions():
    summary = reservations.flavor_summary(FLAVOR)
    assert summary["max_days"] == 7 and summary["rate"] == 0.899
    limits = reservations.limits_summary(
        {"maxHours": 240, "maxReservations": 2}
    )
    active = {
        "status": "ACTIVE",
        "end": "2026-10-12T23:59:00+00:00",
        "flavor": FLAVOR,
    }
    assert reservations.reservation_actions(active, limits, NOW) == [
        "launch",
        "extend",
        "calendar",
        "delete",
    ]
    pending = {"status": "PENDING_CREATE", "end": None, "flavor": FLAVOR}
    assert reservations.reservation_actions(pending, limits, NOW) == []
    # Already at the flavour's maximum: no extension offered.
    long = {
        "status": "ACTIVE",
        "end": "2026-10-17T23:59:00+00:00",
        "flavor": FLAVOR,
    }
    assert "extend" not in reservations.reservation_actions(long, limits, NOW)
    no_hours = reservations.limits_summary(
        {"maxHours": 24, "totalHoursUsed": 24}
    )
    assert not reservations.can_extend(active, no_hours, NOW)


def test_reservation_times_and_days():
    begin, end = reservations.reservation_times(
        date(2026, 10, 12), date(2026, 10, 14), NOW
    )
    assert begin.isoformat() == "2026-10-12T00:00:00+00:00"
    assert end.isoformat() == "2026-10-14T23:59:00+00:00"
    today, _ = reservations.reservation_times(
        date(2026, 10, 10), date(2026, 10, 10), NOW
    )
    assert today.isoformat() == "2026-10-10T03:03:00+00:00"
    assert (
        reservations.selected_days(date(2026, 10, 12), date(2026, 10, 14)) == 3
    )
    assert (
        reservations.extend_end(date(2026, 10, 20)).isoformat()
        == "2026-10-20T23:59:00+00:00"
    )


def test_eligibility():
    ok = reservations.eligibility(
        days=3,
        days_left=8,
        flavor_days=7,
        rate=0.899,
        su_used=100,
        su_budget=1000,
    )
    assert (
        ok["eligible"] and ok["su_estimate"] == 64.73 and ok["max_days"] == 7
    )
    too_long = reservations.eligibility(
        days=9,
        days_left=8,
        flavor_days=7,
        rate=None,
        su_used=None,
        su_budget=None,
    )
    assert (
        not too_long["eligible"] and "at most 7 days" in too_long["reasons"][0]
    )
    over_budget = reservations.eligibility(
        days=3,
        days_left=None,
        flavor_days=7,
        rate=10,
        su_used=900,
        su_budget=1000,
    )
    assert (
        not over_budget["eligible"]
        and "usage limit" in over_budget["reasons"][0]
    )
    unlimited = reservations.eligibility(
        days=3,
        days_left=None,
        flavor_days=7,
        rate=10,
        su_used=900,
        su_budget=-1,
    )
    assert unlimited["eligible"]
    assert not reservations.eligibility(
        days=0,
        days_left=None,
        flavor_days=7,
        rate=None,
        su_used=None,
        su_budget=None,
    )["eligible"]


def test_slot_days():
    def at(day, hour=0, minute=0, second=0):
        return datetime(2026, 10, day, hour, minute, second, tzinfo=UTC)

    # A slot that is open now runs from today; one that ends at midnight
    # covers up to the day before.
    assert reservations.slot_days(at(10), at(20), NOW) == (
        date(2026, 10, 10),
        date(2026, 10, 19),
    )
    assert reservations.slot_days(at(1), at(20, 23, 59), NOW) == (
        date(2026, 10, 10),
        date(2026, 10, 20),
    )
    # The stale fragment warre reports from midnight today when the
    # flavour was booked earlier today: no whole day, so no slot.
    assert reservations.slot_days(at(10), at(10, 3, 23), NOW) is None
    # A slot that opens later today or part way through a day counts from
    # the next day; one that opens at midnight counts from that day.
    assert reservations.slot_days(at(10, 14), at(20), NOW) == (
        date(2026, 10, 11),
        date(2026, 10, 19),
    )
    assert reservations.slot_days(at(12, 0, 1), at(20), NOW) == (
        date(2026, 10, 13),
        date(2026, 10, 19),
    )
    assert reservations.slot_days(at(12), at(20), NOW) == (
        date(2026, 10, 12),
        date(2026, 10, 19),
    )
    # A one-minute gap between reservations is not a day.
    assert reservations.slot_days(at(12), at(12), NOW) is None
    assert reservations.slot_days(at(12, 0, 1), at(13, 0, 59), NOW) is None


def test_extend_window():
    limits = reservations.limits_summary(
        {"maxHours": 240, "totalHoursUsed": 48}
    )
    active = {
        "status": "ACTIVE",
        "end": "2026-10-12T23:59:00+00:00",
        "flavor": FLAVOR,
    }
    slot = {
        "start": "2026-10-12T00:00:00+00:00",
        "end": "2026-10-30T00:00:00+00:00",
    }
    window = reservations.extend_window(active, slot, limits, NOW)
    # slot: 18 days, flavour: 7 from today = 5 past the end, limits: 8 left.
    assert window == {
        "available": True,
        "eligible_days": 5,
        "min_end": "2026-10-13",
        "max_end": "2026-10-17",
    }
    gap = {
        "start": "2026-10-15T00:00:00+00:00",
        "end": "2026-10-30T00:00:00+00:00",
    }
    assert (
        reservations.extend_window(active, gap, limits, NOW)["available"]
        is False
    )
    assert (
        reservations.extend_window(active, None, limits, NOW)["available"]
        is False
    )


def test_calendar_export():
    reservation = {
        "id": "res-1",
        "start": "2026-10-12T00:00:00+00:00",
        "end": "2026-10-14T23:59:00+00:00",
        "flavor": FLAVOR,
    }
    ics = reservations.ics_text(
        reservation, "https://hive.test/reservations/res-1", "hive.test", NOW
    )
    assert ics.startswith("BEGIN:VCALENDAR\r\n")
    assert "UID:nectar-reservation-res-1@hive.test" in ics
    assert (
        "DTSTART:20261012T000000Z" in ics and "DTEND:20261014T235900Z" in ics
    )
    assert "SUMMARY:Nectar reservation: ardc.g3.xlarge" in ics
    assert "TRIGGER:-PT1H" in ics
    assert all(len(line.encode()) <= 75 for line in ics.split("\r\n"))
    google = reservations.google_calendar_url(
        reservation, "https://hive.test/r"
    )
    assert "dates=20261012T000000Z%2F20261014T235900Z" in google
    outlook = reservations.outlook_calendar_url(
        reservation, "https://hive.test/r", personal=True
    )
    assert (
        outlook.startswith("https://outlook.live.com/")
        and "startdt=2026-10-12T00%3A00%3A00Z" in outlook
    )


# --- usage ---------------------------------------------------------------------


def test_join_instances_and_most_used():
    rows = [
        {"id": "i-1", "rate": 10.456, "qty": 24},
        {"id": "i-2", "rate": 2, "qty": 5},
        {"id": "i-3", "rate": 30, "qty": 50},
    ]
    resources = [
        {
            "id": "i-1",
            "display_name": "web",
            "flavor_name": "m3.small",
            "availability_zone": "melbourne",
        },
    ]
    items = usage.join_instances(rows, resources)
    assert [i["id"] for i in items] == ["i-3", "i-1", "i-2"]
    assert items[1]["name"] == "web" and items[1]["rate"] == 10.46
    assert items[0]["name"] == "i-3" and items[0]["flavor_name"] is None
    top = usage.most_used(items, limit=2)
    assert top == {
        "count": 3,
        "items": [
            {"name": "i-3", "rate": 30.0},
            {"name": "web", "rate": 10.46},
        ],
        "other": 2.0,
    }
    assert usage.by_type(
        [{"type": "instance", "rate": 1.234}, {"rate": "x"}]
    ) == [
        {"type": "instance", "rate": 1.23, "qty": None},
        {"type": "other", "rate": 0.0, "qty": None},
    ]


def test_burn_down():
    rows = [
        {"begin": "2026-01-01T00:00:00+00:00", "rate": 10},
        {"begin": "2026-01-02T00:00:00+00:00", "rate": None},
        {"begin": "2026-01-03T00:00:00+00:00", "rate": 5},
        {"begin": "2026-01-04T00:00:00+00:00", "rate": 100},
        {"begin": "bad"},
    ]
    result = usage.burn_down(
        365.0, date(2026, 1, 1), date(2027, 1, 1), rows, date(2026, 1, 3)
    )
    assert result["day_budget"] == 1.0 and result["on_track"] == 2.0
    assert result["cumulative"] == [
        {"date": "2026-01-01", "value": 10.0},
        {"date": "2026-01-02", "value": 10.0},
        {"date": "2026-01-03", "value": 15.0},
        {"date": "2026-01-04", "value": None},
    ]
    assert result["budget_tracking"] == 13.0 and result["at_risk"] is True
    assert result["guide"][1] == {"date": "2027-01-01", "value": 365.0}
    flat = usage.burn_down(
        10, date(2026, 1, 1), date(2026, 1, 1), [], date(2026, 1, 1)
    )
    assert flat["day_budget"] is None and flat["at_risk"] is False


def test_default_range_and_total():
    assert usage.default_range(date(2026, 10, 10)) == (
        "2026-07-12",
        "2026-10-10",
    )
    assert usage.total_rate([{"rate": 1.005}, {"rate": None}, {}]) == 1.0
