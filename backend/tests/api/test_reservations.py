"""Reservations (warre)."""

from datetime import datetime, timedelta, UTC
import json

import httpx

from tests.conftest import CLOUDKITTY, csrf_headers, HORIZON, WARRE

FLAVOR = {
    "id": "f1",
    "name": "ardc.g3.xlarge",
    "description": "L4 with 24GB of GPU RAM",
    "vcpu": 64,
    "memory_mb": 49152,
    "disk_gb": 30,
    "ephemeral_gb": 200,
    "active": True,
    "max_length_hours": 168,
    "slots": 1,
    "is_public": True,
    "extra_specs": {"nectar:rate": "0.899"},
    "category": "GPU",
    "availability_zone": "ardctest-artm",
}
LIMITS = {
    "absolute": {
        "maxHours": 480,
        "maxReservations": 4,
        "totalHoursUsed": 24,
        "totalReservationsUsed": 1,
    }
}


def future(days: int, hour: int = 0, minute: int = 0) -> str:
    when = datetime.now(UTC).replace(
        hour=hour, minute=minute, second=0, microsecond=0
    ) + timedelta(days=days)
    return when.isoformat()


def reservation(status="ACTIVE", **extra):
    return {
        "id": "res-1",
        "status": status,
        "status_reason": None,
        "start": future(-1),
        "end": future(2, 23, 59),
        "created_at": future(-2),
        "instance_count": 1,
        "compute_flavor": "r-f1",
        "flavor": FLAVOR,
        **extra,
    }


def mock_warre(upstream, items=None):
    upstream.get(f"{WARRE}/v1/reservations/").mock(
        return_value=httpx.Response(
            200, json={"results": items or [reservation()], "total": 1}
        )
    )
    upstream.get(f"{WARRE}/v1/limits/").mock(
        return_value=httpx.Response(200, json=LIMITS)
    )
    upstream.get(f"{WARRE}/v1/flavors/").mock(
        return_value=httpx.Response(
            200, json={"results": [FLAVOR], "total": 1}
        )
    )
    upstream.get(f"{WARRE}/v1/flavors/f1/").mock(
        return_value=httpx.Response(200, json=FLAVOR)
    )
    upstream.get(f"{WARRE}/v1/maintenancewindows/").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": "mw-1",
                        "start": future(10),
                        "end": future(11),
                        "note": "Firmware",
                        "flavors": [{"id": "f1", "name": "ardc.g3.xlarge"}],
                    }
                ],
                "total": 1,
            },
        )
    )
    upstream.get(f"{HORIZON}/rest_api/allocations/").mock(
        return_value=httpx.Response(200, json={"results": [], "next": None})
    )


async def test_list_reservations_with_limits(logged_in, upstream):
    mock_warre(upstream)
    body = (await logged_in.get("/api/reservations")).json()
    assert body["limits"]["max_days"] == 20
    assert body["limits"]["days_used"] == 1
    assert body["limits"]["can_create"] is True
    item = body["items"][0]
    assert item["flavor"]["max_days"] == 7
    assert item["actions"] == ["launch", "extend", "calendar", "delete"]
    assert item["status_help"].startswith("The reservation is active")


async def test_reservation_options_and_slots(logged_in, upstream):
    mock_warre(upstream)
    slots = upstream.get(f"{WARRE}/v1/flavors/f1/freeslots/").mock(
        return_value=httpx.Response(
            200, json=[{"start": future(0), "end": future(30)}]
        )
    )
    body = (await logged_in.get("/api/reservations/options")).json()
    assert body["categories"] == ["GPU"]
    assert body["availability_zones"] == ["ardctest-artm"]
    assert body["maintenance_windows"][0]["note"] == "Firmware"
    assert body["su_budget"] is None
    assert body["limits"]["reservations_left"] == 3

    body = (
        await logged_in.get(
            "/api/reservations/slots", params={"category": "GPU"}
        )
    ).json()
    assert body["slots"][0]["flavor_id"] == "f1"
    assert body["flavors"][0]["rate"] == 0.899
    sent = slots.calls.last.request.url.params
    assert sent["start"] == datetime.now(UTC).date().isoformat()


async def test_create_reservation(logged_in, upstream):
    mock_warre(upstream)
    created = upstream.post(f"{WARRE}/v1/reservations/").mock(
        return_value=httpx.Response(
            201, json=reservation("PENDING_CREATE", flavor=None)
        )
    )
    start = (datetime.now(UTC) + timedelta(days=2)).date()
    end = start + timedelta(days=2)
    response = await logged_in.post(
        "/api/reservations",
        json={
            "flavor_id": "f1",
            "start": start.isoformat(),
            "end": end.isoformat(),
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "PENDING_CREATE"
    assert response.json()["flavor"]["name"] == "ardc.g3.xlarge"
    sent = json.loads(created.calls.last.request.content)
    assert sent["flavor_id"] == "f1" and sent["instance_count"] == 1
    assert sent["start"] == f"{start.isoformat()}T00:00:00+00:00"
    assert sent["end"] == f"{end.isoformat()}T23:59:00+00:00"


async def test_create_reservation_rejections(logged_in, upstream):
    mock_warre(upstream)
    today = datetime.now(UTC).date()
    response = await logged_in.post(
        "/api/reservations",
        json={
            "flavor_id": "f1",
            "start": (today - timedelta(days=1)).isoformat(),
            "end": today.isoformat(),
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400
    # Longer than the flavour allows.
    response = await logged_in.post(
        "/api/reservations",
        json={
            "flavor_id": "f1",
            "start": today.isoformat(),
            "end": (today + timedelta(days=10)).isoformat(),
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400
    assert "at most 7 days" in response.json()["message"]
    # Limits exhausted.
    upstream.get(f"{WARRE}/v1/limits/").mock(
        return_value=httpx.Response(
            200, json={"absolute": {"maxHours": 0, "maxReservations": 0}}
        )
    )
    response = await logged_in.post(
        "/api/reservations",
        json={
            "flavor_id": "f1",
            "start": today.isoformat(),
            "end": today.isoformat(),
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 409
    assert "project limits" in response.json()["message"]


async def test_create_reservation_checks_the_su_budget(logged_in, upstream):
    mock_warre(upstream)
    upstream.get(f"{HORIZON}/rest_api/allocations/").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": 1,
                        "status": "A",
                        "start_date": "2026-01-01",
                        "end_date": "2026-12-31",
                        "quotas": [
                            {
                                "resource": "rating.budget",
                                "quota": 100,
                                "zone": "nectar",
                            }
                        ],
                    }
                ],
                "next": None,
            },
        )
    )
    upstream.get(f"{CLOUDKITTY}/v2/summary").mock(
        return_value=httpx.Response(200, json={"results": [{"rate": 90}]})
    )
    today = datetime.now(UTC).date()
    response = await logged_in.post(
        "/api/reservations",
        json={
            "flavor_id": "f1",
            "start": (today + timedelta(days=1)).isoformat(),
            "end": (today + timedelta(days=1)).isoformat(),
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400
    assert "usage limit" in response.json()["message"]


async def test_reservation_detail_extend_and_calendar(logged_in, upstream):
    mock_warre(upstream)
    upstream.get(f"{WARRE}/v1/reservations/res-1/").mock(
        return_value=httpx.Response(200, json=reservation())
    )
    body = (await logged_in.get("/api/reservations/res-1")).json()
    assert body["calendar"]["google"].startswith(
        "https://calendar.google.com/"
    )
    assert body["detail_url"] == "http://testserver/reservations/res-1"

    upstream.get(f"{WARRE}/v1/flavors/f1/freeslots/").mock(
        return_value=httpx.Response(
            200, json=[{"start": future(2), "end": future(40)}]
        )
    )
    window = (
        await logged_in.get("/api/reservations/res-1/extend-options")
    ).json()
    assert window["available"] is True
    assert window["eligible_days"] == 5

    updated = upstream.patch(f"{WARRE}/v1/reservations/res-1/").mock(
        return_value=httpx.Response(
            200, json={"id": "res-1", "end": future(5, 23, 59)}
        )
    )
    new_end = (datetime.now(UTC) + timedelta(days=5)).date().isoformat()
    response = await logged_in.post(
        "/api/reservations/res-1/extend",
        json={"end": new_end},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200, response.text
    assert response.json()["flavor"]["name"] == "ardc.g3.xlarge"
    assert json.loads(updated.calls.last.request.content) == {
        "end": f"{new_end}T23:59:00+00:00"
    }
    # Not later than the current end.
    response = await logged_in.post(
        "/api/reservations/res-1/extend",
        json={
            "end": (datetime.now(UTC) + timedelta(days=1)).date().isoformat()
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400

    ics = await logged_in.get("/api/reservations/res-1/calendar.ics")
    assert ics.status_code == 200
    assert ics.headers["content-type"].startswith("text/calendar")
    assert "SUMMARY:Nectar reservation: ardc.g3.xlarge" in ics.text
    assert "UID:nectar-reservation-res-1@testserver" in ics.text

    deleted = upstream.delete(f"{WARRE}/v1/reservations/res-1/").mock(
        return_value=httpx.Response(204)
    )
    response = await logged_in.delete(
        "/api/reservations/res-1", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 204
    assert deleted.called


async def test_pending_reservation_cannot_be_deleted_or_extended(
    logged_in, upstream
):
    mock_warre(upstream)
    upstream.get(f"{WARRE}/v1/reservations/res-1/").mock(
        return_value=httpx.Response(200, json=reservation("PENDING_CREATE"))
    )
    response = await logged_in.delete(
        "/api/reservations/res-1", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 409
    window = (
        await logged_in.get("/api/reservations/res-1/extend-options")
    ).json()
    assert window == {"available": False, "eligible_days": 0, "max_end": None}
    response = await logged_in.post(
        "/api/reservations/res-1/extend",
        json={
            "end": (datetime.now(UTC) + timedelta(days=5)).date().isoformat()
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 409
    calendar = await logged_in.get("/api/reservations/res-1/calendar.ics")
    assert calendar.status_code == 409


async def test_reservations_absent_without_warre(client, upstream):
    from tests.conftest import token_response

    def without_warre(request):
        response = token_response(request)
        body = response.json()
        token = body.get("token", {})
        if "catalog" in token:
            token["catalog"] = [
                s
                for s in token["catalog"]
                if s["type"] != "nectar-reservation"
            ]
        return httpx.Response(
            response.status_code, json=body, headers=response.headers
        )

    from tests.conftest import KEYSTONE, login

    upstream.post(f"{KEYSTONE}/auth/tokens").mock(side_effect=without_warre)
    assert (await login(client)).status_code == 303
    response = await client.get("/api/reservations")
    assert response.status_code == 404
    assert response.json()["error"] == "service_not_enabled"
