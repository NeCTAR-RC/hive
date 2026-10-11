"""Usage Trend and Allocation Usage."""

import json

import httpx

from tests.conftest import CLOUDKITTY, GNOCCHI, HORIZON

ALLOCATION = {
    "id": 42,
    "project_id": "p1",
    "project_name": "pt-50",
    "status": "A",
    "start_date": "2026-01-01",
    "end_date": "2026-12-31",
    "bundle": "Silver",
    "quotas": [{"zone": "nectar", "resource": "rating.budget", "quota": 3650}],
}


def allocations(request):
    return httpx.Response(200, json={"results": [ALLOCATION], "next": None})


def cloudkitty(request):
    params = request.url.params
    groupby = params.get("groupby")
    if groupby == "id":
        rows = [
            {"id": "i-1", "rate": 10.456, "qty": 24},
            {"id": "i-2", "rate": 2, "qty": 5},
        ]
    elif groupby == "time-1d":
        rows = [
            {"begin": "2026-01-01T00:00:00+00:00", "rate": 5},
            {"begin": "2026-01-02T00:00:00+00:00", "rate": 5},
            {"begin": "2027-01-01T00:00:00+00:00", "rate": 99},
        ]
    elif groupby == "type":
        rows = [{"type": "instance", "rate": 12.5}]
    else:
        rows = [{"rate": 12.456, "qty": 29}]
    return httpx.Response(200, json={"results": rows, "total": len(rows)})


async def test_usage_options(logged_in):
    body = (await logged_in.get("/api/usage/options")).json()
    assert body["data_from"] == "2022-01-01"
    assert body["default_begin"] < body["default_end"]


async def test_usage_instances_joined_with_gnocchi(logged_in, upstream):
    upstream.get(f"{CLOUDKITTY}/v2/summary").mock(side_effect=cloudkitty)
    search = upstream.post(f"{GNOCCHI}/v1/search/resource/instance").mock(
        return_value=httpx.Response(
            200,
            json=[
                {"id": "i-1", "display_name": "web", "flavor_name": "m3.small"}
            ],
        )
    )
    response = await logged_in.get(
        "/api/usage/instances",
        params={"begin": "2026-07-01", "end": "2026-10-01"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["partial"] is False
    assert [i["name"] for i in body["items"]] == ["web", "i-2"]
    assert body["items"][0]["rate"] == 10.46
    assert body["most_used"]["items"][0] == {"name": "web", "rate": 10.46}
    assert body["sum"] == 12.46
    assert search.calls.last.request.url.params["limit"] == "2"
    assert json.loads(search.calls.last.request.content) == {
        "in": {"id": ["i-1", "i-2"]}
    }
    assert response.headers["x-hive-cache"] == "miss"
    again = await logged_in.get(
        "/api/usage/instances",
        params={"begin": "2026-07-01", "end": "2026-10-01"},
    )
    assert again.headers["x-hive-cache"] == "hit"


async def test_usage_instances_partial_without_gnocchi(logged_in, upstream):
    upstream.get(f"{CLOUDKITTY}/v2/summary").mock(side_effect=cloudkitty)
    upstream.post(f"{GNOCCHI}/v1/search/resource/instance").mock(
        return_value=httpx.Response(500, text="down")
    )
    body = (await logged_in.get("/api/usage/instances")).json()
    assert body["partial"] is True
    assert body["errors"][0]["source"] == "gnocchi"
    assert body["items"][0]["name"] == "i-1"


async def test_usage_range_validation(logged_in):
    response = await logged_in.get(
        "/api/usage/instances",
        params={"begin": "yesterday", "end": "2026-10-01"},
    )
    assert response.status_code == 400
    response = await logged_in.get(
        "/api/usage/summary",
        params={"begin": "2026-10-02", "end": "2026-10-01"},
    )
    assert response.status_code == 400


async def test_usage_summary_clamps_to_the_data_floor(logged_in, upstream):
    route = upstream.get(f"{CLOUDKITTY}/v2/summary").mock(
        side_effect=cloudkitty
    )
    body = (
        await logged_in.get(
            "/api/usage/summary",
            params={
                "begin": "2020-01-01",
                "end": "2026-10-01",
                "groupby": "type",
            },
        )
    ).json()
    assert body["begin"] == "2022-01-01"
    assert route.calls.last.request.url.params["begin"] == "2022-01-01"


async def test_allocation_usage_burn_down(logged_in, upstream):
    upstream.get(f"{HORIZON}/rest_api/allocations/").mock(
        side_effect=allocations
    )
    upstream.get(f"{CLOUDKITTY}/v2/summary").mock(side_effect=cloudkitty)
    response = await logged_in.get("/api/usage/allocation")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["available"] is True
    assert body["su_budget"] == 3650
    assert body["su_used"] == 12.46
    assert body["su_remaining"] == 3637.54
    assert body["total_hours"] == 29
    assert body["day_budget"] == 10.03
    assert body["cumulative"][0] == {"date": "2026-01-01", "value": 5.0}
    assert body["cumulative"][2] == {"date": "2027-01-01", "value": None}
    assert body["guide"][1]["value"] == 3650
    assert body["at_risk"] is False


async def test_allocation_usage_without_an_allocation(logged_in, upstream):
    upstream.get(f"{HORIZON}/rest_api/allocations/").mock(
        return_value=httpx.Response(200, json={"results": [], "next": None})
    )
    body = (await logged_in.get("/api/usage/allocation")).json()
    assert body["available"] is False
    assert "no approved allocation" in body["reason"]


async def test_allocation_usage_partial_when_cloudkitty_fails(
    logged_in, upstream
):
    upstream.get(f"{HORIZON}/rest_api/allocations/").mock(
        side_effect=allocations
    )
    upstream.get(f"{CLOUDKITTY}/v2/summary").mock(
        return_value=httpx.Response(500, text="boom")
    )
    body = (await logged_in.get("/api/usage/allocation")).json()
    assert body["available"] is False
    assert body["partial"] is True
    assert body["reason"] == "Usage data is unavailable at the moment."
