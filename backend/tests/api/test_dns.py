"""Designate zones and record sets."""

import json

import httpx

from tests.conftest import csrf_headers, DESIGNATE

ZONE = {
    "id": "z-1",
    "name": "example.com.",
    "type": "PRIMARY",
    "email": "admin@example.com",
    "ttl": 3600,
    "serial": 5,
    "status": "ACTIVE",
    "action": "NONE",
}
PENDING = {
    **ZONE,
    "id": "z-2",
    "name": "pending.com.",
    "status": "PENDING",
    "action": "CREATE",
}
RECORDSETS = [
    {
        "id": "rs-soa",
        "zone_id": "z-1",
        "name": "example.com.",
        "type": "SOA",
        "records": ["ns1. admin. 1 2 3 4 5"],
        "status": "ACTIVE",
    },
    {
        "id": "rs-ns",
        "zone_id": "z-1",
        "name": "example.com.",
        "type": "NS",
        "records": ["ns1.example.net."],
        "status": "ACTIVE",
    },
    {
        "id": "rs-a",
        "zone_id": "z-1",
        "name": "www.example.com.",
        "type": "A",
        "records": ["10.0.0.1"],
        "status": "ACTIVE",
        "ttl": 300,
    },
]


def mock_designate(upstream):
    upstream.get(f"{DESIGNATE}/v2/zones").mock(
        side_effect=[
            httpx.Response(
                200,
                json={
                    "zones": [ZONE],
                    "links": {"next": f"{DESIGNATE}/v2/zones?marker=z-1"},
                },
            ),
            httpx.Response(200, json={"zones": [PENDING], "links": {}}),
        ]
    )
    upstream.get(f"{DESIGNATE}/v2/zones/z-1").mock(
        return_value=httpx.Response(200, json=ZONE)
    )
    upstream.get(f"{DESIGNATE}/v2/zones/z-2").mock(
        return_value=httpx.Response(200, json=PENDING)
    )
    upstream.get(f"{DESIGNATE}/v2/quotas").mock(
        return_value=httpx.Response(
            200, json={"zones": 10, "zone_recordsets": 500}
        )
    )
    upstream.get(f"{DESIGNATE}/v2/zones/z-1/recordsets").mock(
        return_value=httpx.Response(
            200, json={"recordsets": RECORDSETS, "links": {}}
        )
    )
    for recordset in RECORDSETS:
        upstream.get(
            f"{DESIGNATE}/v2/zones/z-1/recordsets/{recordset['id']}"
        ).mock(return_value=httpx.Response(200, json=recordset))


async def test_list_zones_follows_pages(logged_in, upstream):
    mock_designate(upstream)
    body = (await logged_in.get("/api/dns/zones")).json()
    assert [z["name"] for z in body["items"]] == [
        "example.com.",
        "pending.com.",
    ]
    assert body["items"][1]["is_transitional"] and body["quota"]["zones"] == 10
    assert "A" in body["record_types"] and "SOA" not in body["record_types"]
    zone = (await logged_in.get("/api/dns/zones/z-1")).json()
    assert zone["serial"] == 5


async def test_zone_create_update_delete(logged_in, upstream):
    mock_designate(upstream)
    create = upstream.post(f"{DESIGNATE}/v2/zones").mock(
        return_value=httpx.Response(
            202,
            json={
                **ZONE,
                "id": "z-9",
                "name": "new.com.",
                "status": "PENDING",
            },
        )
    )
    response = await logged_in.post(
        "/api/dns/zones",
        json={
            "name": "new.com.",
            "email": "a@b.co",
            "ttl": 600,
            "description": "d",
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202, response.text
    assert (
        response.json()["name"] == "new.com."
        and response.json()["is_transitional"]
    )
    sent = json.loads(create.calls.last.request.content)
    assert sent == {
        "name": "new.com.",
        "email": "a@b.co",
        "type": "PRIMARY",
        "ttl": 600,
        "description": "d",
    }

    bad = await logged_in.post(
        "/api/dns/zones",
        json={"name": "nodot.com", "email": "a@b.co"},
        headers=csrf_headers(logged_in),
    )
    assert bad.status_code == 400 and "dot" in bad.json()["message"]

    update = upstream.patch(f"{DESIGNATE}/v2/zones/z-1").mock(
        return_value=httpx.Response(202, json={**ZONE, "ttl": 120})
    )
    response = await logged_in.patch(
        "/api/dns/zones/z-1",
        json={"ttl": 120, "email": "x@y.co"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200 and response.json()["ttl"] == 120
    assert json.loads(update.calls.last.request.content) == {
        "email": "x@y.co",
        "ttl": 120,
    }
    noop = await logged_in.patch(
        "/api/dns/zones/z-1", json={}, headers=csrf_headers(logged_in)
    )
    assert noop.status_code == 200 and noop.json()["id"] == "z-1"
    bad_email = await logged_in.patch(
        "/api/dns/zones/z-1",
        json={"email": "nope"},
        headers=csrf_headers(logged_in),
    )
    assert bad_email.status_code == 400

    delete = upstream.delete(f"{DESIGNATE}/v2/zones/z-1").mock(
        return_value=httpx.Response(202, json={})
    )
    response = await logged_in.delete(
        "/api/dns/zones/z-1", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 204 and delete.called
    busy = await logged_in.delete(
        "/api/dns/zones/z-2", headers=csrf_headers(logged_in)
    )
    assert busy.status_code == 409


async def test_zone_quota_blocks_create(logged_in, upstream):
    mock_designate(upstream)
    upstream.get(f"{DESIGNATE}/v2/quotas").mock(
        return_value=httpx.Response(200, json={"zones": 2})
    )
    response = await logged_in.post(
        "/api/dns/zones",
        json={"name": "new.com.", "email": "a@b.co"},
        headers=csrf_headers(logged_in),
    )
    assert (
        response.status_code == 409
        and response.json()["error"] == "quota_exceeded"
    )


async def test_zone_quota_lookup_failure_is_tolerated(logged_in, upstream):
    mock_designate(upstream)
    upstream.get(f"{DESIGNATE}/v2/quotas").mock(
        return_value=httpx.Response(500, json={})
    )
    upstream.post(f"{DESIGNATE}/v2/zones").mock(
        return_value=httpx.Response(202, json={**ZONE, "id": "z-9"})
    )
    body = (await logged_in.get("/api/dns/zones")).json()
    assert body["quota"] == {}
    response = await logged_in.post(
        "/api/dns/zones",
        json={"name": "new.com.", "email": "a@b.co"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202


async def test_recordsets(logged_in, upstream):
    mock_designate(upstream)
    body = (await logged_in.get("/api/dns/zones/z-1/recordsets")).json()
    assert body["zone"]["name"] == "example.com."
    assert [r["type"] for r in body["items"]] == ["NS", "SOA", "A"]
    assert not body["items"][0]["can_edit"] and body["items"][2]["can_edit"]

    create = upstream.post(f"{DESIGNATE}/v2/zones/z-1/recordsets").mock(
        return_value=httpx.Response(
            202,
            json={
                "id": "rs-new",
                "zone_id": "z-1",
                "name": "mail.example.com.",
                "type": "MX",
                "records": ["10 mx.example.com."],
                "status": "PENDING",
            },
        )
    )
    response = await logged_in.post(
        "/api/dns/zones/z-1/recordsets",
        json={
            "name": "mail",
            "type": "MX",
            "records": ["10 mx.example.com."],
            "ttl": 300,
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202, response.text
    sent = json.loads(create.calls.last.request.content)
    assert sent == {
        "name": "mail.example.com.",
        "type": "MX",
        "records": ["10 mx.example.com."],
        "ttl": 300,
    }

    txt = await logged_in.post(
        "/api/dns/zones/z-1/recordsets",
        json={"name": "", "type": "TXT", "records": ["v=spf1 -all"]},
        headers=csrf_headers(logged_in),
    )
    assert txt.status_code == 202
    assert json.loads(create.calls.last.request.content)["records"] == [
        '"v=spf1 -all"'
    ]
    assert (
        json.loads(create.calls.last.request.content)["name"] == "example.com."
    )

    bad = await logged_in.post(
        "/api/dns/zones/z-1/recordsets",
        json={"name": "www", "type": "A", "records": ["not-an-ip"]},
        headers=csrf_headers(logged_in),
    )
    assert bad.status_code == 400 and "IPv4" in bad.json()["message"]
    other_zone = await logged_in.post(
        "/api/dns/zones/z-1/recordsets",
        json={"name": "www.other.com.", "type": "A", "records": ["10.0.0.1"]},
        headers=csrf_headers(logged_in),
    )
    assert other_zone.status_code == 400

    update = upstream.put(f"{DESIGNATE}/v2/zones/z-1/recordsets/rs-a").mock(
        return_value=httpx.Response(
            202, json={**RECORDSETS[2], "records": ["10.0.0.2"]}
        )
    )
    response = await logged_in.put(
        "/api/dns/zones/z-1/recordsets/rs-a",
        json={"records": ["10.0.0.2"], "ttl": 60, "description": "moved"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200 and response.json()["records"] == [
        "10.0.0.2"
    ]
    assert json.loads(update.calls.last.request.content) == {
        "records": ["10.0.0.2"],
        "ttl": 60,
        "description": "moved",
    }
    managed = await logged_in.put(
        "/api/dns/zones/z-1/recordsets/rs-soa",
        json={"records": ["x"]},
        headers=csrf_headers(logged_in),
    )
    assert managed.status_code == 409
    bad_update = await logged_in.put(
        "/api/dns/zones/z-1/recordsets/rs-a",
        json={"records": ["bad"]},
        headers=csrf_headers(logged_in),
    )
    assert bad_update.status_code == 400

    delete = upstream.delete(f"{DESIGNATE}/v2/zones/z-1/recordsets/rs-a").mock(
        return_value=httpx.Response(202, json={})
    )
    response = await logged_in.delete(
        "/api/dns/zones/z-1/recordsets/rs-a", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 204 and delete.called
    managed = await logged_in.delete(
        "/api/dns/zones/z-1/recordsets/rs-ns", headers=csrf_headers(logged_in)
    )
    assert managed.status_code == 409


async def test_zone_boundary_ttl_reset_and_secondary(logged_in, upstream):
    mock_designate(upstream)
    lookalike = await logged_in.post(
        "/api/dns/zones/z-1/recordsets",
        json={"name": "notexample.com.", "type": "A", "records": ["10.0.0.1"]},
        headers=csrf_headers(logged_in),
    )
    assert lookalike.status_code == 400
    assert "zone name" in lookalike.json()["message"]

    update = upstream.put(f"{DESIGNATE}/v2/zones/z-1/recordsets/rs-a").mock(
        return_value=httpx.Response(202, json={**RECORDSETS[2], "ttl": None})
    )
    response = await logged_in.put(
        "/api/dns/zones/z-1/recordsets/rs-a",
        json={"records": ["10.0.0.1"], "ttl": None},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200, response.text
    # An explicit null restores the zone default; omitting ttl keeps it.
    assert json.loads(update.calls.last.request.content) == {
        "records": ["10.0.0.1"],
        "ttl": None,
    }
    await logged_in.put(
        "/api/dns/zones/z-1/recordsets/rs-a",
        json={"records": ["10.0.0.1"]},
        headers=csrf_headers(logged_in),
    )
    assert "ttl" not in json.loads(update.calls.last.request.content)

    create = upstream.post(f"{DESIGNATE}/v2/zones").mock(
        return_value=httpx.Response(
            202,
            json={
                **ZONE,
                "id": "z-8",
                "name": "sec.com.",
                "type": "SECONDARY",
                "masters": ["192.0.2.1"],
            },
        )
    )
    response = await logged_in.post(
        "/api/dns/zones",
        json={
            "name": "sec.com.",
            "email": "a@b.co",
            "type": "SECONDARY",
            "masters": ["192.0.2.1"],
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202, response.text
    assert response.json()["masters"] == ["192.0.2.1"]
    assert json.loads(create.calls.last.request.content) == {
        "name": "sec.com.",
        "email": "a@b.co",
        "type": "SECONDARY",
        "masters": ["192.0.2.1"],
    }
    no_masters = await logged_in.post(
        "/api/dns/zones",
        json={"name": "sec.com.", "email": "a@b.co", "type": "SECONDARY"},
        headers=csrf_headers(logged_in),
    )
    assert no_masters.status_code == 400


async def test_zone_ids_are_quoted(logged_in, upstream):
    zone = upstream.get(f"{DESIGNATE}/v2/zones/a%3Fb").mock(
        return_value=httpx.Response(200, json=ZONE)
    )
    response = await logged_in.get("/api/dns/zones/a%3Fb")
    assert response.status_code == 200, response.text
    assert zone.calls.last.request.url.raw_path == b"/v2/zones/a%3Fb"
