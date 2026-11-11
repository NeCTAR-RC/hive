from datetime import datetime, UTC

from hive.nectar import outages


def test_outage_queries_cover_active_upcoming_and_recent():
    now = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)
    queries = outages.queries(now)
    assert queries[0] == {"activity": "active"}
    assert queries[1]["activity"] == "upcoming"
    assert queries[1]["start__lte"].startswith("2026-10-23")
    assert queries[2]["end__gte"].startswith("2026-10-08")


def test_outage_merge_dedupes_by_id_in_order():
    merged = outages.merge(
        [{"id": 1, "title": "a"}],
        [{"id": 2, "title": "b"}, {"id": 1, "title": "dup"}],
    )
    assert [o["id"] for o in merged] == [1, 2]
    assert merged[0]["title"] == "a"


def test_outage_serialise_adds_url_and_known_fields_only():
    item = outages.serialise(
        {"id": 7, "title": "t", "severity": 2, "secret": "x"},
        "https://status.test/outages",
    )
    assert item["url"] == "https://status.test/outages/7/"
    assert "secret" not in item
    assert item["planned_end"] is None
