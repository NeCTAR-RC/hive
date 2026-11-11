from datetime import date, datetime, UTC

from hive.nectar import reservations


def test_limits_summary_converts_hours_to_days():
    limits = reservations.limits_summary(
        {
            "maxHours": 240,
            "totalHoursUsed": 25,
            "maxReservations": 2,
            "totalReservationsUsed": 1,
        }
    )
    assert limits['max_days'] == 10
    assert limits['days_used'] == 2
    assert limits['days_left'] == 8
    assert limits['reservations_left'] == 1
    assert limits["can_create"] is True
    blocked = reservations.limits_summary(
        {"maxHours": 0, "maxReservations": 0}
    )
    assert blocked["can_create"] is False
    unlimited = reservations.limits_summary(
        {"maxHours": -1, "maxReservations": -1}
    )
    assert unlimited['max_days'] is None
    assert unlimited['can_create'] is True


NOW = datetime(2026, 10, 10, 3, 0, tzinfo=UTC)


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
    assert summary['max_days'] == 7
    assert summary['rate'] == 0.899
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
    assert ok['eligible']
    assert ok['su_estimate'] == 64.73
    assert ok['max_days'] == 7
    too_long = reservations.eligibility(
        days=9,
        days_left=8,
        flavor_days=7,
        rate=None,
        su_used=None,
        su_budget=None,
    )
    assert not too_long['eligible']
    assert 'at most 7 days' in too_long['reasons'][0]
    over_budget = reservations.eligibility(
        days=3,
        days_left=None,
        flavor_days=7,
        rate=10,
        su_used=900,
        su_budget=1000,
    )
    assert not over_budget['eligible']
    assert 'usage limit' in over_budget['reasons'][0]
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
    assert 'DTSTART:20261012T000000Z' in ics
    assert 'DTEND:20261014T235900Z' in ics
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
    assert outlook.startswith('https://outlook.live.com/')
    assert 'startdt=2026-10-12T00%3A00%3A00Z' in outlook


def test_adjacent_slot_is_the_one_that_continues_the_reservation():
    end = datetime(2026, 10, 15, 23, 59, tzinfo=UTC)
    later = {"start": "2026-11-30T00:00:00", "end": "2026-12-30T00:00:00"}
    next_day = {"start": "2026-10-16T00:00:00", "end": "2026-11-01T00:00:00"}
    broken = {"start": None, "end": "2026-11-01T00:00:00"}
    assert reservations.adjacent_slot([later, broken, next_day], end) == (
        next_day
    )
    assert reservations.adjacent_slot([later], end) is None
    assert reservations.adjacent_slot([], end) is None
