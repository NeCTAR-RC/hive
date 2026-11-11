from datetime import date

from hive.nectar import usage


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
    assert items[1]['name'] == 'web'
    assert items[1]['rate'] == 10.46
    assert items[0]['name'] == 'i-3'
    assert items[0]['flavor_name'] is None
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
    assert result['day_budget'] == 1.0
    assert result['on_track'] == 2.0
    assert result["cumulative"] == [
        {"date": "2026-01-01", "value": 10.0},
        {"date": "2026-01-02", "value": 10.0},
        {"date": "2026-01-03", "value": 15.0},
        {"date": "2026-01-04", "value": None},
    ]
    assert result['budget_tracking'] == 13.0
    assert result['at_risk'] is True
    assert result["guide"][1] == {"date": "2027-01-01", "value": 365.0}
    flat = usage.burn_down(
        10, date(2026, 1, 1), date(2026, 1, 1), [], date(2026, 1, 1)
    )
    assert flat['day_budget'] is None
    assert flat['at_risk'] is False


def test_default_range_and_total():
    assert usage.default_range(date(2026, 10, 10)) == (
        "2026-07-12",
        "2026-10-10",
    )
    assert usage.total_rate([{"rate": 1.005}, {"rate": None}, {}]) == 1.0
