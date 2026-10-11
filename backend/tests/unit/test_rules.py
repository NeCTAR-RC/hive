from datetime import datetime, UTC

from hive.auth.router import safe_next
from hive.clients import base
from hive.nectar import allocation, outages
from hive.redirects import RedirectMap


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


def test_allocation_budget_and_quotas():
    alloc = {
        "status": "A",
        "quotas": [
            {"zone": "nectar", "resource": "rating.budget", "quota": 1200},
            {"zone": "melbourne", "resource": "compute.cores", "quota": 8},
            {"zone": "monash", "resource": "compute.cores", "quota": 4},
        ],
    }
    assert allocation.su_budget(alloc) == 1200
    assert allocation.quota(alloc, "compute.cores") == 8
    assert allocation.quota(alloc, "object.object") is None
    assert allocation.su_budget({"quotas": []}) is None
    assert allocation.pick_current([{"status": "X"}, alloc]) is alloc
    assert allocation.pick_current([]) is None
    assert allocation.is_trial("pt-50", "pt-")
    assert not allocation.is_trial("research", "pt-")


def test_safe_next_only_accepts_relative_paths():
    assert safe_next("/compute/instances?x=1") == "/compute/instances?x=1"
    assert safe_next("https://evil.test/") == "/"
    assert safe_next("//evil.test/") == "/"
    assert safe_next("/auth/websso/") == "/"
    assert safe_next("/x\r\nSet-Cookie: a=b") == "/"
    assert safe_next("", default="/home") == "/home"


def test_catalog_endpoint_prefers_region_and_interface():
    catalog = [
        {
            "type": "compute",
            "endpoints": [
                {"interface": "internal", "region": "Melbourne", "url": "i"},
                {"interface": "public", "region": "Monash", "url": "m"},
                {"interface": "public", "region": "Melbourne", "url": "p"},
            ],
        }
    ]
    assert (
        base.catalog_endpoint(catalog, "compute", "public", "Melbourne") == "p"
    )
    assert base.catalog_endpoint(catalog, "compute", "public", "Monash") == "m"
    assert base.catalog_endpoint(catalog, "volumev3", "public") is None


def test_extract_message_handles_openstack_shapes():
    import httpx

    def resp(body, status=400):
        return httpx.Response(status, json=body)

    assert (
        base.extract_message(resp({"badRequest": {"message": "nope"}}))
        == "nope"
    )
    assert (
        base.extract_message(resp({"NeutronError": {"message": "bad net"}}))
        == "bad net"
    )
    assert base.extract_message(resp({"detail": "missing"})) == "missing"
    assert base.extract_message(httpx.Response(500, text="boom")) == "boom"
    err = base.map_upstream_error("nova", resp({"message": "x"}, 409))
    assert err.code == "conflict" and err.service == "nova"
    assert base.map_upstream_error("nova", resp({}, 401)).status == 401
    assert base.map_upstream_error("nova", resp({}, 429)).status == 429
    assert base.map_upstream_error("nova", resp({}, 503)).status == 502


def test_redirect_map_matches_horizon_paths():
    redirects = RedirectMap.load()
    assert redirects.match("/project/instances/") == (
        301,
        "/compute/instances",
    )
    assert redirects.match("/project/instances/abc-123/") == (
        301,
        "/compute/instances/abc-123",
    )
    assert redirects.match("/project/instances/abc-123", "") == (
        301,
        "/compute/instances/abc-123",
    )
    assert redirects.match("/settings/my-details/", "orcid=1") == (
        301,
        "/account/my-details?orcid=1",
    )
    assert redirects.match("/app-catalog/") == (410, "")
    assert redirects.match("/compute/instances") is None
    assert redirects.match("/allocation/") is None
