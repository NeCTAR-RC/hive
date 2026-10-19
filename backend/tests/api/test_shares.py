"""Manila shares, snapshots, access rules, security services, share
groups and share group snapshots."""

import json

import httpx

from tests.conftest import csrf_headers, MANILA

SHARE = {
    "id": "sh-1",
    "name": "data",
    "status": "available",
    "size": 5,
    "share_proto": "CEPHFS",
    "share_type": "st-1",
    "share_type_name": "cephfs_share_type",
    "availability_zone": "ardctest-artm",
    "is_public": False,
    "snapshot_support": True,
    "revert_to_snapshot_support": True,
    "mount_snapshot_support": True,
    "metadata": {"owner": "me"},
}
BUSY = {**SHARE, "id": "sh-2", "name": "busy", "status": "creating"}
SNAPSHOT = {
    "id": "snap-1",
    "name": "data-snap",
    "status": "available",
    "size": 5,
    "share_id": "sh-1",
    "created_at": "2026-10-01T00:00:00",
}
LIMITS = {
    "maxTotalShares": 10,
    "totalSharesUsed": 2,
    "maxTotalShareGigabytes": 100,
    "totalShareGigabytesUsed": 10,
    "maxTotalShareSnapshots": 10,
    "totalShareSnapshotsUsed": 1,
    "maxTotalSnapshotGigabytes": 100,
    "totalSnapshotGigabytesUsed": 5,
}
SERVICE = {
    "id": "ss-1",
    "name": "corp-ad",
    "type": "active_directory",
    "dns_ip": "10.0.0.2",
    "server": "ad",
    "domain": "corp",
}
GROUP = {
    "id": "g-1",
    "name": "group",
    "status": "available",
    "share_group_type_id": "gt-1",
    "share_types": ["st-1"],
}
GROUP_SNAPSHOT = {
    "id": "gs-1",
    "name": "group-snap",
    "status": "available",
    "share_group_id": "g-1",
}


def mock_manila(upstream, snapshots=None):
    snapshots = [SNAPSHOT] if snapshots is None else snapshots
    upstream.get(f"{MANILA}/shares/detail").mock(
        return_value=httpx.Response(200, json={"shares": [SHARE, BUSY]})
    )
    for share in (SHARE, BUSY):
        upstream.get(f"{MANILA}/shares/{share['id']}").mock(
            return_value=httpx.Response(200, json={"share": share})
        )
    upstream.get(f"{MANILA}/snapshots/detail").mock(
        side_effect=lambda request: httpx.Response(
            200,
            json={
                "snapshots": [
                    s
                    for s in snapshots
                    if not request.url.params.get("share_id")
                    or s["share_id"] == request.url.params["share_id"]
                ]
            },
        )
    )
    upstream.get(f"{MANILA}/snapshots/snap-1").mock(
        return_value=httpx.Response(200, json={"snapshot": SNAPSHOT})
    )
    upstream.get(f"{MANILA}/limits").mock(
        return_value=httpx.Response(200, json={"limits": {"absolute": LIMITS}})
    )
    upstream.get(f"{MANILA}/share-access-rules").mock(
        return_value=httpx.Response(
            200,
            json={
                "access_list": [
                    {
                        "id": "ar-1",
                        "access_type": "cephx",
                        "access_to": "alice",
                        "access_level": "rw",
                        "state": "active",
                        "access_key": "k",
                    }
                ]
            },
        )
    )
    upstream.get(f"{MANILA}/shares/sh-1/export_locations").mock(
        return_value=httpx.Response(
            200,
            json={
                "export_locations": [
                    {"path": "10.0.0.9:/vol/x", "preferred": True}
                ]
            },
        )
    )
    upstream.get(f"{MANILA}/types").mock(
        return_value=httpx.Response(
            200,
            json={
                "share_types": [
                    {
                        "id": "st-1",
                        "name": "cephfs_share_type",
                        "extra_specs": {
                            "driver_handles_share_servers": "False"
                        },
                    },
                    {
                        "id": "st-2",
                        "name": "generic",
                        "extra_specs": {
                            "driver_handles_share_servers": "True"
                        },
                    },
                ]
            },
        )
    )
    upstream.get(f"{MANILA}/availability-zones").mock(
        return_value=httpx.Response(
            200, json={"availability_zones": [{"name": "ardctest-artm"}]}
        )
    )
    upstream.get(f"{MANILA}/share-groups/detail").mock(
        return_value=httpx.Response(200, json={"share_groups": [GROUP]})
    )
    upstream.get(f"{MANILA}/share-groups/g-1").mock(
        return_value=httpx.Response(200, json={"share_group": GROUP})
    )
    upstream.get(f"{MANILA}/share-group-types").mock(
        return_value=httpx.Response(
            200,
            json={
                "share_group_types": [
                    {"id": "gt-1", "name": "default", "share_types": ["st-1"]}
                ]
            },
        )
    )
    upstream.get(f"{MANILA}/share-group-snapshots/detail").mock(
        return_value=httpx.Response(
            200, json={"share_group_snapshots": [GROUP_SNAPSHOT]}
        )
    )
    upstream.get(f"{MANILA}/share-group-snapshots/gs-1").mock(
        return_value=httpx.Response(
            200, json={"share_group_snapshot": GROUP_SNAPSHOT}
        )
    )
    upstream.get(f"{MANILA}/security-services/detail").mock(
        return_value=httpx.Response(200, json={"security_services": [SERVICE]})
    )
    upstream.get(f"{MANILA}/security-services/ss-1").mock(
        return_value=httpx.Response(200, json={"security_service": SERVICE})
    )


async def test_list_options_and_detail(logged_in, upstream):
    mock_manila(upstream)
    body = (await logged_in.get("/api/shares/shares")).json()
    assert [s["name"] for s in body["items"]] == ["busy", "data"]
    data = body["items"][1]
    assert (
        data["has_snapshot"]
        and "delete" not in data["actions"]
        and "resize" in data["actions"]
    )
    assert body["can_create"]
    assert (
        upstream.calls.last.request.headers["x-openstack-manila-api-version"]
        == "2.65"
    )

    options = (await logged_in.get("/api/shares/options")).json()
    assert options["protocols"] == ["NFS", "CIFS", "CephFS"]
    assert [t["name"] for t in options["share_types"]] == ["cephfs_share_type"]
    assert options["availability_zones"] == ["ardctest-artm"]
    assert (
        options["snapshots"][0]["id"] == "snap-1"
        and options["share_groups"][0]["id"] == "g-1"
    )
    assert options["can_snapshot"]

    assert options["newest_snapshot_ids"] == {"sh-1": "snap-1"}

    detail = (await logged_in.get("/api/shares/shares/sh-1")).json()
    assert detail["export_locations"][0]["path"] == "10.0.0.9:/vol/x"
    assert detail["access_rules"][0]["access_key"] == "k"
    assert detail["newest_snapshot_id"] == "snap-1"


async def test_revert_names_the_newest_of_several_snapshots(
    logged_in, upstream
):
    """Manila lists newest first, so the last listed is the oldest; the
    backend names the one it accepts."""
    newer = {**SNAPSHOT, "id": "snap-2", "created_at": "2026-10-05T00:00:00"}
    mock_manila(upstream, snapshots=[newer, SNAPSHOT])
    options = (await logged_in.get("/api/shares/options")).json()
    assert [s["id"] for s in options["snapshots"]] == ["snap-2", "snap-1"]
    assert options["newest_snapshot_ids"] == {"sh-1": "snap-2"}
    detail = (await logged_in.get("/api/shares/shares/sh-1")).json()
    assert detail["newest_snapshot_id"] == "snap-2"
    action = upstream.post(f"{MANILA}/shares/sh-1/action").mock(
        return_value=httpx.Response(202)
    )
    older = await logged_in.post(
        "/api/shares/shares/sh-1/revert",
        json={"snapshot_id": "snap-1"},
        headers=csrf_headers(logged_in),
    )
    assert older.status_code == 400 and not action.called
    newest = await logged_in.post(
        "/api/shares/shares/sh-1/revert",
        json={"snapshot_id": detail["newest_snapshot_id"]},
        headers=csrf_headers(logged_in),
    )
    assert newest.status_code == 202 and action.called


async def test_share_ids_are_percent_encoded_upstream(logged_in, upstream):
    """A ``?`` in an id must not become an upstream query string."""
    seen = []

    def manila(request):
        seen.append(request.url.raw_path.decode())
        return httpx.Response(404, json={"itemNotFound": {"message": "x"}})

    upstream.route(host="manila.test").mock(side_effect=manila)
    response = await logged_in.delete(
        "/api/shares/snapshots/a%3Fall_tenants=1",
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 404
    assert seen == ["/v2/p1/snapshots/a%3Fall_tenants%3D1"]


async def test_create_update_metadata_resize_revert_delete(
    logged_in, upstream
):
    mock_manila(upstream)
    create = upstream.post(f"{MANILA}/shares").mock(
        return_value=httpx.Response(
            200, json={"share": {**SHARE, "id": "sh-9", "status": "creating"}}
        )
    )
    response = await logged_in.post(
        "/api/shares/shares",
        json={
            "name": "new",
            "protocol": "CephFS",
            "size": 6,
            "share_type": "cephfs_share_type",
            "availability_zone": "ardctest-artm",
            "snapshot_id": "snap-1",
            "metadata": "team=x",
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202, response.text
    sent = json.loads(create.calls.last.request.content)["share"]
    assert (
        sent["share_proto"] == "CephFS"
        and sent["snapshot_id"] == "snap-1"
        and sent["metadata"] == {"team": "x"}
    )
    assert (
        sent["share_type"] == "cephfs_share_type"
        and sent["is_public"] is False
    )

    too_small = await logged_in.post(
        "/api/shares/shares",
        json={
            "name": "n",
            "protocol": "NFS",
            "size": 1,
            "share_type": "t",
            "snapshot_id": "snap-1",
        },
        headers=csrf_headers(logged_in),
    )
    assert (
        too_small.status_code == 400
        and "snapshot size" in too_small.json()["message"]
    )
    bad_meta = await logged_in.post(
        "/api/shares/shares",
        json={
            "name": "n",
            "protocol": "NFS",
            "size": 1,
            "share_type": "t",
            "metadata": "oops",
        },
        headers=csrf_headers(logged_in),
    )
    assert bad_meta.status_code == 400
    bad_proto = await logged_in.post(
        "/api/shares/shares",
        json={
            "name": "n",
            "protocol": "GLUSTER",
            "size": 1,
            "share_type": "t",
        },
        headers=csrf_headers(logged_in),
    )
    assert bad_proto.status_code == 400

    update = upstream.put(f"{MANILA}/shares/sh-1").mock(
        return_value=httpx.Response(
            200, json={"share": {**SHARE, "name": "renamed"}}
        )
    )
    response = await logged_in.patch(
        "/api/shares/shares/sh-1",
        json={"name": "renamed", "is_public": True},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200 and response.json()["name"] == "renamed"
    assert json.loads(update.calls.last.request.content) == {
        "share": {"display_name": "renamed", "is_public": True}
    }
    busy = await logged_in.patch(
        "/api/shares/shares/sh-2",
        json={"name": "x"},
        headers=csrf_headers(logged_in),
    )
    assert busy.status_code == 409

    upstream.get(f"{MANILA}/shares/sh-1/metadata").mock(
        return_value=httpx.Response(
            200, json={"metadata": {"owner": "me", "old": "1"}}
        )
    )
    set_meta = upstream.put(f"{MANILA}/shares/sh-1/metadata").mock(
        return_value=httpx.Response(200, json={"metadata": {"owner": "you"}})
    )
    # Manila's PUT replaces the map, so "old" is already gone and a DELETE
    # of it would be a 404 that turned the edit into "not found".
    drop_old = upstream.delete(f"{MANILA}/shares/sh-1/metadata/old").mock(
        return_value=httpx.Response(404, json={"itemNotFound": {}})
    )
    response = await logged_in.put(
        "/api/shares/shares/sh-1/metadata",
        json={"metadata": "owner=you"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200 and response.json() == {
        "metadata": {"owner": "you"}
    }
    assert json.loads(set_meta.calls.last.request.content) == {
        "metadata": {"owner": "you"}
    }
    assert not drop_old.called
    # An empty map cannot go through PUT, so each current key is deleted.
    drop_owner = upstream.delete(f"{MANILA}/shares/sh-1/metadata/owner").mock(
        return_value=httpx.Response(200)
    )
    drop_old.mock(return_value=httpx.Response(200))
    puts = set_meta.call_count
    cleared = await logged_in.put(
        "/api/shares/shares/sh-1/metadata",
        json={"metadata": ""},
        headers=csrf_headers(logged_in),
    )
    assert cleared.status_code == 200 and cleared.json() == {"metadata": {}}
    assert drop_owner.called and drop_old.called
    assert set_meta.call_count == puts

    action = upstream.post(f"{MANILA}/shares/sh-1/action").mock(
        return_value=httpx.Response(202)
    )
    grow = await logged_in.post(
        "/api/shares/shares/sh-1/resize",
        json={"size": 8},
        headers=csrf_headers(logged_in),
    )
    assert grow.status_code == 202 and json.loads(
        action.calls.last.request.content
    ) == {"extend": {"new_size": 8}}
    shrink = await logged_in.post(
        "/api/shares/shares/sh-1/resize",
        json={"size": 3},
        headers=csrf_headers(logged_in),
    )
    assert shrink.status_code == 202 and json.loads(
        action.calls.last.request.content
    ) == {"shrink": {"new_size": 3}}
    same = await logged_in.post(
        "/api/shares/shares/sh-1/resize",
        json={"size": 5},
        headers=csrf_headers(logged_in),
    )
    assert same.status_code == 400
    busy = await logged_in.post(
        "/api/shares/shares/sh-2/resize",
        json={"size": 9},
        headers=csrf_headers(logged_in),
    )
    assert busy.status_code == 409

    revert = await logged_in.post(
        "/api/shares/shares/sh-1/revert",
        json={"snapshot_id": "snap-1"},
        headers=csrf_headers(logged_in),
    )
    assert revert.status_code == 202 and json.loads(
        action.calls.last.request.content
    ) == {"revert": {"snapshot_id": "snap-1"}}
    old = await logged_in.post(
        "/api/shares/shares/sh-1/revert",
        json={"snapshot_id": "snap-0"},
        headers=csrf_headers(logged_in),
    )
    assert old.status_code == 400
    busy = await logged_in.post(
        "/api/shares/shares/sh-2/revert",
        json={"snapshot_id": "snap-1"},
        headers=csrf_headers(logged_in),
    )
    assert busy.status_code == 409

    with_snapshot = await logged_in.delete(
        "/api/shares/shares/sh-1", headers=csrf_headers(logged_in)
    )
    assert (
        with_snapshot.status_code == 409
        and "snapshots" in with_snapshot.json()["message"]
    )
    busy = await logged_in.delete(
        "/api/shares/shares/sh-2", headers=csrf_headers(logged_in)
    )
    assert busy.status_code == 409


async def test_delete_share_without_snapshots(logged_in, upstream):
    mock_manila(upstream, snapshots=[])
    delete = upstream.delete(f"{MANILA}/shares/sh-1").mock(
        return_value=httpx.Response(202)
    )
    response = await logged_in.delete(
        "/api/shares/shares/sh-1", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 204 and delete.called


async def test_quota_blocks_create_and_snapshot(logged_in, upstream):
    mock_manila(upstream)
    upstream.get(f"{MANILA}/limits").mock(
        return_value=httpx.Response(
            200,
            json={
                "limits": {
                    "absolute": {
                        **LIMITS,
                        "totalSharesUsed": 10,
                        "totalShareSnapshotsUsed": 10,
                    }
                }
            },
        )
    )
    body = (await logged_in.get("/api/shares/shares")).json()
    assert not body["can_create"] and "shares quota" in body["create_reason"]
    response = await logged_in.post(
        "/api/shares/shares",
        json={"name": "n", "protocol": "NFS", "size": 1, "share_type": "t"},
        headers=csrf_headers(logged_in),
    )
    assert (
        response.status_code == 409
        and response.json()["error"] == "quota_exceeded"
    )
    snap = await logged_in.post(
        "/api/shares/snapshots",
        json={"share_id": "sh-1", "name": "s"},
        headers=csrf_headers(logged_in),
    )
    assert snap.status_code == 409


async def test_access_rules(logged_in, upstream):
    mock_manila(upstream)
    body = (await logged_in.get("/api/shares/shares/sh-1/access")).json()
    assert body["items"][0]["access_to"] == "alice" and body["can_add"]
    action = upstream.post(f"{MANILA}/shares/sh-1/action").mock(
        return_value=httpx.Response(
            200,
            json={
                "access": {
                    "id": "ar-2",
                    "access_type": "ip",
                    "access_to": "10.0.0.0/24",
                    "access_level": "ro",
                    "state": "queued_to_apply",
                }
            },
        )
    )
    response = await logged_in.post(
        "/api/shares/shares/sh-1/access",
        json={
            "access_type": "ip",
            "access_to": " 10.0.0.0/24 ",
            "access_level": "ro",
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202 and response.json()["id"] == "ar-2"
    assert json.loads(action.calls.last.request.content) == {
        "allow_access": {
            "access_type": "ip",
            "access_to": "10.0.0.0/24",
            "access_level": "ro",
        }
    }
    bad = await logged_in.post(
        "/api/shares/shares/sh-1/access",
        json={"access_type": "ip", "access_to": "nope", "access_level": "rw"},
        headers=csrf_headers(logged_in),
    )
    assert bad.status_code == 400
    busy = await logged_in.post(
        "/api/shares/shares/sh-2/access",
        json={"access_type": "user", "access_to": "bob", "access_level": "rw"},
        headers=csrf_headers(logged_in),
    )
    assert busy.status_code == 409
    response = await logged_in.delete(
        "/api/shares/shares/sh-1/access/ar-1", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 204
    assert json.loads(action.calls.last.request.content) == {
        "deny_access": {"access_id": "ar-1"}
    }


async def test_snapshots(logged_in, upstream):
    mock_manila(upstream)
    body = (await logged_in.get("/api/shares/snapshots")).json()
    assert (
        body["items"][0]["share_name"] == "data"
        and "rules" in body["items"][0]["actions"]
    )

    upstream.get(f"{MANILA}/snapshots/snap-1/export-locations").mock(
        return_value=httpx.Response(
            200,
            json={
                "share_snapshot_export_locations": [{"path": "10.0.0.9:/snap"}]
            },
        )
    )
    upstream.get(f"{MANILA}/snapshots/snap-1/access-list").mock(
        return_value=httpx.Response(
            200,
            json={
                "snapshot_access_list": [
                    {
                        "id": "sa-1",
                        "access_type": "ip",
                        "access_to": "10.0.0.1",
                    }
                ]
            },
        )
    )
    detail = (await logged_in.get("/api/shares/snapshots/snap-1")).json()
    assert (
        detail["mount_snapshot_support"]
        and detail["export_locations"][0]["path"] == "10.0.0.9:/snap"
    )
    assert detail["access_rules"][0]["id"] == "sa-1"

    create = upstream.post(f"{MANILA}/snapshots").mock(
        return_value=httpx.Response(
            202,
            json={
                "snapshot": {**SNAPSHOT, "id": "snap-2", "status": "creating"}
            },
        )
    )
    response = await logged_in.post(
        "/api/shares/snapshots",
        json={"share_id": "sh-1", "name": "s2", "description": "d"},
        headers=csrf_headers(logged_in),
    )
    assert (
        response.status_code == 202 and response.json()["share_name"] == "data"
    )
    assert json.loads(create.calls.last.request.content)["snapshot"] == {
        "share_id": "sh-1",
        "force": False,
        "name": "s2",
        "description": "d",
        "metadata": {},
    }
    busy = await logged_in.post(
        "/api/shares/snapshots",
        json={"share_id": "sh-2", "name": "s"},
        headers=csrf_headers(logged_in),
    )
    assert busy.status_code == 409

    update = upstream.put(f"{MANILA}/snapshots/snap-1").mock(
        return_value=httpx.Response(
            200, json={"snapshot": {**SNAPSHOT, "name": "renamed"}}
        )
    )
    upstream.get(f"{MANILA}/snapshots/snap-1").mock(
        return_value=httpx.Response(
            200, json={"snapshot": {**SNAPSHOT, "name": "renamed"}}
        )
    )
    response = await logged_in.patch(
        "/api/shares/snapshots/snap-1",
        json={"name": "renamed"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200 and response.json()["name"] == "renamed"
    # The same shape as GET: the parent share and the Rules action survive.
    assert response.json()["share_name"] == "data"
    assert "rules" in response.json()["actions"]
    assert response.json()["access_rules"][0]["id"] == "sa-1"
    assert json.loads(update.calls.last.request.content) == {
        "snapshot": {"display_name": "renamed"}
    }
    noop = await logged_in.patch(
        "/api/shares/snapshots/snap-1",
        json={},
        headers=csrf_headers(logged_in),
    )
    assert noop.status_code == 200

    action = upstream.post(f"{MANILA}/snapshots/snap-1/action").mock(
        return_value=httpx.Response(
            200, json={"snapshot_access": {"id": "sa-2"}}
        )
    )
    response = await logged_in.post(
        "/api/shares/snapshots/snap-1/access",
        json={"access_type": "ip", "access_to": "10.0.0.5"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202 and response.json()["id"] == "sa-2"
    bad = await logged_in.post(
        "/api/shares/snapshots/snap-1/access",
        json={"access_type": "ip", "access_to": "x"},
        headers=csrf_headers(logged_in),
    )
    assert bad.status_code == 400
    response = await logged_in.delete(
        "/api/shares/snapshots/snap-1/access/sa-1",
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 204
    assert json.loads(action.calls.last.request.content) == {
        "deny_access": {"access_id": "sa-1"}
    }

    delete = upstream.delete(f"{MANILA}/snapshots/snap-1").mock(
        return_value=httpx.Response(202)
    )
    response = await logged_in.delete(
        "/api/shares/snapshots/snap-1", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 204 and delete.called
    upstream.get(f"{MANILA}/snapshots/snap-1").mock(
        return_value=httpx.Response(
            200, json={"snapshot": {**SNAPSHOT, "status": "creating"}}
        )
    )
    busy = await logged_in.delete(
        "/api/shares/snapshots/snap-1", headers=csrf_headers(logged_in)
    )
    assert busy.status_code == 409


async def test_security_services(logged_in, upstream):
    mock_manila(upstream)
    body = (await logged_in.get("/api/shares/security-services")).json()
    assert body["items"][0]["type_label"] == "Active Directory" and body[
        "types"
    ] == ["active_directory", "ldap", "kerberos"]
    detail = (await logged_in.get("/api/shares/security-services/ss-1")).json()
    assert detail["name"] == "corp-ad"

    create = upstream.post(f"{MANILA}/security-services").mock(
        return_value=httpx.Response(
            200,
            json={
                "security_service": {**SERVICE, "id": "ss-2", "type": "ldap"}
            },
        )
    )
    response = await logged_in.post(
        "/api/shares/security-services",
        json={
            "name": "ldap",
            "type": "ldap",
            "dns_ip": "10.0.0.3",
            "server": "ldap",
            "domain": "corp",
            "ou": "",
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 201 and response.json()["id"] == "ss-2"
    sent = json.loads(create.calls.last.request.content)["security_service"]
    assert sent == {
        "name": "ldap",
        "type": "ldap",
        "dns_ip": "10.0.0.3",
        "server": "ldap",
        "domain": "corp",
    }

    update = upstream.put(f"{MANILA}/security-services/ss-1").mock(
        return_value=httpx.Response(
            200, json={"security_service": {**SERVICE, "name": "renamed"}}
        )
    )
    response = await logged_in.patch(
        "/api/shares/security-services/ss-1",
        json={"name": "renamed"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200 and response.json()["name"] == "renamed"
    assert json.loads(update.calls.last.request.content) == {
        "security_service": {"name": "renamed"}
    }
    noop = await logged_in.patch(
        "/api/shares/security-services/ss-1",
        json={},
        headers=csrf_headers(logged_in),
    )
    assert noop.status_code == 200 and noop.json()["name"] == "corp-ad"

    delete = upstream.delete(f"{MANILA}/security-services/ss-1").mock(
        return_value=httpx.Response(202)
    )
    response = await logged_in.delete(
        "/api/shares/security-services/ss-1", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 204 and delete.called


async def test_share_groups_and_group_snapshots(logged_in, upstream):
    mock_manila(upstream)
    body = (await logged_in.get("/api/shares/groups")).json()
    assert body["items"][0]["actions"] == ["snapshot", "edit", "delete"]
    detail = (await logged_in.get("/api/shares/groups/g-1")).json()
    assert detail["share_types_detail"][0]["name"] == "cephfs_share_type"
    assert [m["id"] for m in detail["members"]] == ["sh-1", "sh-2"]

    create = upstream.post(f"{MANILA}/share-groups").mock(
        return_value=httpx.Response(
            202,
            json={"share_group": {**GROUP, "id": "g-2", "status": "creating"}},
        )
    )
    response = await logged_in.post(
        "/api/shares/groups",
        json={
            "name": "g2",
            "share_group_type_id": "gt-1",
            "share_types": ["st-1"],
            "availability_zone": "ardctest-artm",
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202 and response.json()["is_transitional"]
    assert json.loads(create.calls.last.request.content)["share_group"] == {
        "name": "g2",
        "share_group_type_id": "gt-1",
        "share_types": ["st-1"],
        "availability_zone": "ardctest-artm",
    }
    no_type = await logged_in.post(
        "/api/shares/groups",
        json={"name": "g3"},
        headers=csrf_headers(logged_in),
    )
    assert no_type.status_code == 400

    update = upstream.put(f"{MANILA}/share-groups/g-1").mock(
        return_value=httpx.Response(
            200, json={"share_group": {**GROUP, "name": "renamed"}}
        )
    )
    response = await logged_in.patch(
        "/api/shares/groups/g-1",
        json={"name": "renamed"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200 and json.loads(
        update.calls.last.request.content
    ) == {"share_group": {"name": "renamed"}}
    noop = await logged_in.patch(
        "/api/shares/groups/g-1", json={}, headers=csrf_headers(logged_in)
    )
    assert noop.status_code == 200

    delete = upstream.delete(f"{MANILA}/share-groups/g-1").mock(
        return_value=httpx.Response(202)
    )
    response = await logged_in.delete(
        "/api/shares/groups/g-1", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 204 and delete.called

    snapshots = (await logged_in.get("/api/shares/group-snapshots")).json()
    assert snapshots["items"][0]["share_group_name"] == "group"
    detail = (await logged_in.get("/api/shares/group-snapshots/gs-1")).json()
    assert detail["share_group_name"] == "group"
    create = upstream.post(f"{MANILA}/share-group-snapshots").mock(
        return_value=httpx.Response(
            202,
            json={
                "share_group_snapshot": {
                    **GROUP_SNAPSHOT,
                    "id": "gs-2",
                    "status": "creating",
                }
            },
        )
    )
    response = await logged_in.post(
        "/api/shares/group-snapshots",
        json={"share_group_id": "g-1", "name": "gs2", "description": "d"},
        headers=csrf_headers(logged_in),
    )
    assert (
        response.status_code == 202
        and response.json()["share_group_name"] == "group"
    )
    assert json.loads(create.calls.last.request.content)[
        "share_group_snapshot"
    ] == {
        "share_group_id": "g-1",
        "name": "gs2",
        "description": "d",
    }
    update = upstream.put(f"{MANILA}/share-group-snapshots/gs-1").mock(
        return_value=httpx.Response(
            200, json={"share_group_snapshot": {**GROUP_SNAPSHOT, "name": "r"}}
        )
    )
    response = await logged_in.patch(
        "/api/shares/group-snapshots/gs-1",
        json={"name": "r"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200 and update.called
    noop = await logged_in.patch(
        "/api/shares/group-snapshots/gs-1",
        json={},
        headers=csrf_headers(logged_in),
    )
    assert noop.status_code == 200
    delete = upstream.delete(f"{MANILA}/share-group-snapshots/gs-1").mock(
        return_value=httpx.Response(202)
    )
    response = await logged_in.delete(
        "/api/shares/group-snapshots/gs-1", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 204 and delete.called

    busy_group = {**GROUP, "status": "creating"}
    upstream.get(f"{MANILA}/share-groups/g-1").mock(
        return_value=httpx.Response(200, json={"share_group": busy_group})
    )
    for call in (
        logged_in.patch(
            "/api/shares/groups/g-1",
            json={"name": "x"},
            headers=csrf_headers(logged_in),
        ),
        logged_in.delete(
            "/api/shares/groups/g-1", headers=csrf_headers(logged_in)
        ),
        logged_in.post(
            "/api/shares/group-snapshots",
            json={"share_group_id": "g-1", "name": "x"},
            headers=csrf_headers(logged_in),
        ),
    ):
        assert (await call).status_code == 409
    upstream.get(f"{MANILA}/share-group-snapshots/gs-1").mock(
        return_value=httpx.Response(
            200,
            json={
                "share_group_snapshot": {
                    **GROUP_SNAPSHOT,
                    "status": "creating",
                }
            },
        )
    )
    busy = await logged_in.delete(
        "/api/shares/group-snapshots/gs-1", headers=csrf_headers(logged_in)
    )
    assert busy.status_code == 409
