"""How failures end or keep the session."""

import httpx

from tests.conftest import csrf_headers, NOVA


async def test_a_core_service_401_ends_the_session(logged_in, upstream, redis):
    upstream.get(f"{NOVA}/limits").mock(
        return_value=httpx.Response(401, json={"error": {"message": "no"}})
    )
    keys_before = [k async for k in redis.scan_iter("hive:sess:*")]
    response = await logged_in.get("/api/compute/limits")
    assert response.status_code == 401
    assert response.json()["error"] == "session_expired"
    assert response.headers["cache-control"] == "no-store"
    assert 'hive_session=""' in response.headers["set-cookie"]
    sessions = [
        k async for k in redis.scan_iter("hive:sess:*") if ":user:" not in k
    ]
    assert len(keys_before) > len(sessions)
    assert sessions == []


async def test_a_rule_violation_is_a_400(logged_in, upstream):
    """A Nectar rule that needs upstream data runs in the service and
    answers 400 with its own message."""
    response = await logged_in.post(
        "/api/object-store/containers/c/objects/%2Fbad/manifest",
        json={"segments": [{"path": "c_segments/x/1", "size_bytes": 1}]},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400
    body = response.json()
    assert body["error"] == "bad_request"
    assert body["message"] == "Names cannot start with a slash."
