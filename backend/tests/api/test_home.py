import httpx

from tests.conftest import (
    CLOUDKITTY,
    HORIZON,
    KEYSTONE,
    LANGSTROTH,
    login,
    MANUKA,
    token_response,
    VARROA,
)

OUTAGE = {
    "id": 11,
    "title": "Storage maintenance",
    "severity": 2,
    "scheduled": True,
    "scheduled_display": "Scheduled",
    "status_display": "In progress",
    "start": "2026-10-09T01:00:00Z",
    "end": None,
    "planned_end": "2026-10-09T05:00:00Z",
}


async def test_profile_from_manuka(logged_in, upstream):
    upstream.get(f"{MANUKA}/v1/users/u1/").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": 5,
                "first_name": "Sam",
                "surname": "Example",
                "displayname": "Sam Example",
                "email": "sam@example.edu",
                "orcid": None,
            },
        )
    )
    body = (await logged_in.get("/api/me/profile")).json()
    assert body["partial"] is False
    assert body["first_name"] == "Sam"


async def test_profile_is_partial_when_manuka_fails(logged_in, upstream):
    upstream.get(f"{MANUKA}/v1/users/u1/").mock(
        return_value=httpx.Response(503, text="down")
    )
    body = (await logged_in.get("/api/me/profile")).json()
    assert body["partial"] is True
    assert body["error"] == "upstream_error"


async def test_outages_merge_three_queries(logged_in, upstream):
    def answer(request):
        activity = request.url.params.get("activity")
        if activity == "active":
            return httpx.Response(
                200, json={"results": [OUTAGE], "next": None}
            )
        if activity == "upcoming":
            return httpx.Response(
                200,
                json={
                    "results": [{**OUTAGE, "id": 12, "title": "Upcoming"}],
                    "next": None,
                },
            )
        return httpx.Response(200, json={"results": [OUTAGE], "next": None})

    upstream.get(f"{LANGSTROTH}/v1/outages/").mock(side_effect=answer)
    response = await logged_in.get("/api/outages")
    assert response.status_code == 200, response.text
    assert response.headers["x-hive-cache"] == "miss"
    items = response.json()["items"]
    assert [i["id"] for i in items] == [11, 12]
    assert items[0]["url"] == "https://status.test/outages/11/"
    # Cached on the second call.
    response = await logged_in.get("/api/outages")
    assert response.headers["x-hive-cache"] == "hit"


async def test_allocation_summary(logged_in, upstream):
    def allocations(request):
        if request.url.params.get("parent_request__isnull") == "True":
            return httpx.Response(200, json={"results": [], "next": None})
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": 42,
                        "project_id": "p1",
                        "project_name": "pt-50",
                        "status": "A",
                        "status_display": "Approved",
                        "start_date": "2026-01-01",
                        "end_date": "2026-12-31",
                        "bundle": "Silver",
                        "quotas": [
                            {
                                "zone": "nectar",
                                "resource": "rating.budget",
                                "quota": 5000,
                            }
                        ],
                        "contact_email": "sam@example.edu",
                    }
                ],
                "next": None,
            },
        )

    upstream.get(f"{HORIZON}/rest_api/allocations/").mock(
        side_effect=allocations
    )
    upstream.get(f"{CLOUDKITTY}/v2/summary").mock(
        return_value=httpx.Response(
            200, json={"results": [{"rate": 1234.567, "qty": 10}]}
        )
    )
    body = (await logged_in.get("/api/allocation/summary")).json()
    assert body["partial"] is False
    assert body["allocation"]["id"] == 42
    assert body["allocation"]["bundle"] == "Silver"
    assert "contact_email" not in body["allocation"]
    assert body["su_budget"] == 5000
    assert body["su_used"] == 1234.57
    assert body["is_trial"] is True
    assert body["links"]["my_requests"].startswith(HORIZON)
    cached = await logged_in.get("/api/allocation/summary")
    assert cached.headers["x-hive-cache"] == "hit"
    refreshed = await logged_in.get("/api/allocation/summary?refresh=true")
    assert refreshed.headers["x-hive-cache"] == "miss"


async def test_allocation_summary_partial_on_failure(logged_in, upstream):
    upstream.get(f"{HORIZON}/rest_api/allocations/").mock(
        return_value=httpx.Response(500, text="boom")
    )
    body = (await logged_in.get("/api/allocation/summary")).json()
    assert body["partial"] is True
    assert body["allocation"] is None
    assert body["errors"][0]["source"] == "allocations"
    # Partial results are not cached.
    again = await logged_in.get("/api/allocation/summary")
    assert again.headers["x-hive-cache"] == "miss"


async def test_usage_summary(logged_in, upstream):
    route = upstream.get(f"{CLOUDKITTY}/v2/summary").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [{"rate": 10.5, "type": "instance"}, {"rate": 2}]
            },
        )
    )
    body = (
        await logged_in.get(
            "/api/usage/summary",
            params={
                "begin": "2026-07-01",
                "end": "2026-10-01",
                "type": "instance",
            },
        )
    ).json()
    assert body["sum"] == 12.5
    assert body["begin"] == "2026-07-01"
    sent = route.calls.last.request.url.params
    assert sent["filters"] == "type:instance"
    assert sent["response_format"] == "object"


async def test_security_risks_cached_per_project(logged_in, upstream):
    upstream.get(f"{VARROA}/v1/security-risks/").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": 1,
                        "resource_id": "i-1",
                        "resource_type": "instance",
                        "type": {"name": "open-ssh"},
                    }
                ],
                "next": None,
            },
        )
    )
    first = await logged_in.get("/api/security/risks")
    assert first.json()["items"][0]["resource_id"] == "i-1"
    assert first.headers["x-hive-cache"] == "miss"
    second = await logged_in.get("/api/security/risks")
    assert second.headers["x-hive-cache"] == "hit"


async def test_security_risks_when_service_absent(client, upstream):
    def without_varroa(request):
        response = token_response(request)
        body = response.json()
        token = body.get("token", {})
        if "catalog" in token:
            token["catalog"] = [
                s for s in token["catalog"] if s["type"] != "security"
            ]
        return httpx.Response(
            response.status_code, json=body, headers=response.headers
        )

    upstream.post(f"{KEYSTONE}/auth/tokens").mock(side_effect=without_varroa)
    assert (await login(client)).status_code == 303
    response = await client.get("/api/security/risks")
    assert response.status_code == 200
    assert response.json() == {
        "items": [],
        "available": False,
        "fetched_at": None,
    }


async def test_news_feed(logged_in, upstream):
    feed = b"""<?xml version="1.0"?>
    <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
      <channel><title>ARDC</title>
        <item><title>One</title><link>https://ardc.edu.au/1</link>
          <pubDate>Thu, 09 Oct 2026 00:00:00 +0000</pubDate>
          <description><![CDATA[<p>Hello <b>world</b></p>]]></description>
          <media:content url="https://ardc.edu.au/1.jpg"/>
        </item>
        <item><title>Two</title><link>https://ardc.edu.au/2</link></item>
      </channel></rss>"""
    upstream.get("https://news.test/feed/").mock(
        return_value=httpx.Response(200, content=feed)
    )
    body = (await logged_in.get("/api/news/ardc")).json()
    assert [i["title"] for i in body["items"]] == ["One", "Two"]
    assert body["items"][0]["summary"] == "Hello world"
    assert body["items"][0]["image"] == "https://ardc.edu.au/1.jpg"


async def test_news_feed_failure_is_an_upstream_error(logged_in, upstream):
    upstream.get("https://news.test/feed/").mock(
        return_value=httpx.Response(500)
    )
    response = await logged_in.get("/api/news/ardc")
    assert response.status_code == 502
    assert response.json()["service"] == "rss"
