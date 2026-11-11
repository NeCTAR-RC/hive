import json

import httpx
import pytest

from tests.conftest import (
    CINDER,
    CINDER_ENTRY,
    csrf_headers,
    GLANCE,
    GLANCE_ENTRY,
    login,
    NOVA,
)
from tests.fixtures.loader import fixture


VOLUMES = fixture("cinder", "volumes")
SNAPSHOTS = fixture("cinder", "snapshots")
BACKUPS = fixture("cinder", "backups")
TYPES = fixture("cinder", "types")
LIMITS = fixture("cinder", "limits")


@pytest.fixture
def volume_catalog(with_services):
    with_services(GLANCE_ENTRY, CINDER_ENTRY)


@pytest.fixture
def cinder(upstream, volume_catalog):
    upstream.get(f"{CINDER}/volumes/detail").mock(
        return_value=httpx.Response(200, json={"volumes": VOLUMES})
    )
    upstream.get(f"{CINDER}/volumes/vol-1").mock(
        return_value=httpx.Response(200, json={"volume": VOLUMES[0]})
    )
    upstream.get(f"{CINDER}/volumes/vol-2").mock(
        return_value=httpx.Response(200, json={"volume": VOLUMES[1]})
    )
    upstream.get(f"{CINDER}/snapshots/detail").mock(
        return_value=httpx.Response(200, json={"snapshots": SNAPSHOTS})
    )
    upstream.get(f"{CINDER}/snapshots/snap-1").mock(
        return_value=httpx.Response(200, json={"snapshot": SNAPSHOTS[0]})
    )
    upstream.get(f"{CINDER}/backups/detail").mock(
        return_value=httpx.Response(200, json={"backups": BACKUPS})
    )
    upstream.get(f"{CINDER}/backups/bak-1").mock(
        return_value=httpx.Response(200, json={"backup": BACKUPS[0]})
    )
    upstream.get(f"{CINDER}/types").mock(
        return_value=httpx.Response(200, json={"volume_types": TYPES})
    )
    upstream.get(f"{CINDER}/os-availability-zone").mock(
        return_value=httpx.Response(
            200,
            json={
                "availabilityZoneInfo": [
                    {
                        "zoneName": "monash-02",
                        "zoneState": {"available": True},
                    },
                    {
                        "zoneName": "melbourne-qh2",
                        "zoneState": {"available": True},
                    },
                ]
            },
        )
    )
    upstream.get(f"{CINDER}/limits").mock(
        return_value=httpx.Response(
            200, json={"limits": {"rate": [], "absolute": LIMITS}}
        )
    )
    image = {
        "id": "img-ubuntu",
        "name": "Ubuntu 24.04",
        "status": "active",
        "visibility": "public",
        "owner": "ops",
        "size": 2 * 1024**3,
        "min_disk": 5,
    }
    upstream.get(f"{GLANCE}/v2/images").mock(
        return_value=httpx.Response(200, json={"images": [image]})
    )
    upstream.get(f"{GLANCE}/v2/images/img-ubuntu").mock(
        return_value=httpx.Response(200, json=image)
    )
    return upstream


@pytest.fixture
async def user(cinder, client):
    assert (await login(client)).status_code == 303
    return client


async def test_list_volumes_marks_snapshots_and_attachments(user):
    response = await user.get("/api/volumes?status=in-use")
    assert response.status_code == 200, response.text
    items = {v["id"]: v for v in response.json()["items"]}
    data = items["vol-1"]
    assert data["has_snapshots"] is True
    assert data["attachments"] == [
        {
            "id": "att-1",
            "server_id": "srv-1",
            "device": "/dev/vdb",
            "attached_at": "2026-10-01T00:00:00Z",
        }
    ]
    assert data["bootable"] is False
    boot = items["vol-2"]
    assert boot["bootable"] is True
    assert boot["has_snapshots"] is False
    assert boot["image"] == {"id": "img-ubuntu", "name": "Ubuntu 24.04"}


async def test_list_volumes_follows_every_page(user, cinder):
    """A project with more volumes than one Cinder page gets all of them
    (the next link names the public URL; Hive re-bases it)."""

    def page(request: httpx.Request) -> httpx.Response:
        if request.url.params.get("marker") == "vol-1":
            return httpx.Response(200, json={"volumes": VOLUMES[1:]})
        return httpx.Response(
            200,
            json={
                "volumes": VOLUMES[:1],
                "volumes_links": [
                    {
                        "rel": "next",
                        "href": "https://cinder.public/v3/p1/volumes/detail"
                        "?marker=vol-1",
                    }
                ],
            },
        )

    cinder.get(f"{CINDER}/volumes/detail").mock(side_effect=page)
    response = await user.get("/api/volumes")
    assert response.status_code == 200, response.text
    body = response.json()
    assert [v["id"] for v in body["items"]] == ["vol-1", "vol-2"]
    assert "truncated" not in body


async def test_options_gather_sections(user):
    response = await user.get("/api/volumes/options")
    assert response.status_code == 200, response.text
    body = response.json()
    assert [z["name"] for z in body["availability_zones"]] == [
        "melbourne-qh2",
        "monash-02",
    ]
    assert body["has_zoned_types"] is True
    types = {t["name"]: t for t in body["volume_types"]}
    assert types["qh2-ssd"]["zones"] == ["melbourne-qh2"]
    assert types["standard"]["zones"] is None
    assert body["images"][0]["min_disk"] == 5
    assert [s["id"] for s in body["snapshots"]] == ["snap-1"]
    # vol-1 is in use; only available volumes can be cloned.
    assert [v["id"] for v in body["volumes"]] == ["vol-2"]
    assert body["limits"]["totalSnapshotsUsed"] == 0
    assert body["limits"]["maxTotalSnapshots"] == -1
    assert body["errors"] == {}


async def test_create_volume_applies_rules(user, cinder):
    created = cinder.post(f"{CINDER}/volumes").mock(
        return_value=httpx.Response(
            202, json={"volume": {"id": "vol-3", "status": "creating"}}
        )
    )
    missing_zone = await user.post(
        "/api/volumes",
        json={"name": "x", "size": 10},
        headers=csrf_headers(user),
    )
    assert missing_zone.status_code == 400
    assert "availability zone" in missing_zone.json()["message"]
    assert not created.called

    too_small = await user.post(
        "/api/volumes",
        json={
            "size": 3,
            "availability_zone": "melbourne-qh2",
            "source": {"type": "image", "id": "img-ubuntu"},
        },
        headers=csrf_headers(user),
    )
    assert too_small.status_code == 400
    assert "minimum disk" in too_small.json()["message"]

    response = await user.post(
        "/api/volumes",
        json={
            "name": "x",
            "size": 10,
            "availability_zone": "melbourne-qh2",
            "volume_type": "qh2-ssd",
            "source": {"type": "image", "id": "img-ubuntu"},
        },
        headers=csrf_headers(user),
    )
    assert response.status_code == 202, response.text
    assert response.json()["id"] == "vol-3"
    sent = json.loads(created.calls.last.request.content)["volume"]
    assert sent == {
        "size": 10,
        "name": "x",
        "description": None,
        "availability_zone": "melbourne-qh2",
        "volume_type": "qh2-ssd",
        "imageRef": "img-ubuntu",
    }

    from_snapshot = await user.post(
        "/api/volumes",
        json={
            "size": 20,
            "availability_zone": "monash-02",
            "volume_type": "standard",
            "source": {"type": "snapshot", "id": "snap-1"},
        },
        headers=csrf_headers(user),
    )
    assert from_snapshot.status_code == 202, from_snapshot.text
    sent = json.loads(created.calls.last.request.content)["volume"]
    assert sent["snapshot_id"] == "snap-1"
    assert "availability_zone" not in sent
    assert "volume_type" not in sent


async def test_quota_errors_are_not_rate_limits(user, cinder):
    cinder.post(f"{CINDER}/volumes").mock(
        return_value=httpx.Response(
            413,
            json={
                "overLimit": {
                    "code": 413,
                    "message": (
                        "VolumeSizeExceedsAvailableQuota: Requested volume "
                        "or snapshot exceeds allowed gigabytes quota."
                    ),
                }
            },
        )
    )
    response = await user.post(
        "/api/volumes",
        json={"size": 10, "availability_zone": "melbourne-qh2"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 409
    assert response.json()["error"] == "quota_exceeded"
    assert "gigabytes quota" in response.json()["message"]

    # The wording Cinder used on rctest for a zero snapshot quota.
    cinder.post(f"{CINDER}/snapshots").mock(
        return_value=httpx.Response(
            413,
            json={
                "overLimit": {
                    "code": 413,
                    "message": (
                        "SnapshotLimitExceeded: Maximum number of "
                        "snapshots allowed (0) exceeded"
                    ),
                }
            },
        )
    )
    snapshot = await user.post(
        "/api/volumes/snapshots",
        json={"volume_id": "vol-1", "name": "x"},
        headers=csrf_headers(user),
    )
    assert snapshot.status_code == 409
    assert snapshot.json()["error"] == "quota_exceeded"
    assert "SnapshotLimitExceeded" in snapshot.json()["message"]


async def test_volume_actions(user, cinder):
    action = cinder.post(f"{CINDER}/volumes/vol-1/action").mock(
        return_value=httpx.Response(
            202,
            json={
                "os-volume_upload_image": {
                    "image_id": "img-new",
                    "image_name": "data-image",
                }
            },
        )
    )
    shrink = await user.post(
        "/api/volumes/vol-1/extend",
        json={"new_size": 20},
        headers=csrf_headers(user),
    )
    assert shrink.status_code == 400
    grow = await user.post(
        "/api/volumes/vol-1/extend",
        json={"new_size": 25},
        headers=csrf_headers(user),
    )
    assert grow.status_code == 202, grow.text
    assert json.loads(action.calls.last.request.content) == {
        "os-extend": {"new_size": 25}
    }

    upload = await user.post(
        "/api/volumes/vol-1/upload-to-image",
        json={"image_name": "data-image", "disk_format": "qcow2"},
        headers=csrf_headers(user),
    )
    assert upload.status_code == 202, upload.text
    assert upload.json()["image_id"] == "img-new"
    assert json.loads(action.calls.last.request.content) == {
        "os-volume_upload_image": {
            "image_name": "data-image",
            "disk_format": "qcow2",
            "container_format": "bare",
            "force": False,
        }
    }

    attach = cinder.post(f"{NOVA}/servers/srv-2/os-volume_attachments").mock(
        return_value=httpx.Response(
            200,
            json={
                "volumeAttachment": {
                    "device": "/dev/vdc",
                    "serverId": "srv-2",
                    "volumeId": "vol-2",
                }
            },
        )
    )
    response = await user.post(
        "/api/volumes/vol-2/attach",
        json={"instance_id": "srv-2", "device": "/dev/vdc"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 202, response.text
    assert response.json()["device"] == "/dev/vdc"
    assert json.loads(attach.calls.last.request.content) == {
        "volumeAttachment": {"volumeId": "vol-2", "device": "/dev/vdc"}
    }

    detach = cinder.delete(
        f"{NOVA}/servers/srv-1/os-volume_attachments/vol-1"
    ).mock(return_value=httpx.Response(202))
    response = await user.post(
        "/api/volumes/vol-1/detach",
        json={"instance_id": "srv-1"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 202, response.text
    assert detach.called

    updated = cinder.put(f"{CINDER}/volumes/vol-2").mock(
        return_value=httpx.Response(200, json={"volume": VOLUMES[1]})
    )
    bootable = cinder.post(f"{CINDER}/volumes/vol-2/action").mock(
        return_value=httpx.Response(200)
    )
    response = await user.patch(
        "/api/volumes/vol-2",
        json={"name": "boot-2", "bootable": False},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    assert json.loads(updated.calls.last.request.content) == {
        "volume": {"name": "boot-2"}
    }
    assert json.loads(bootable.calls.last.request.content) == {
        "os-set_bootable": {"bootable": False}
    }


async def test_snapshots_and_backups(user, cinder):
    listed = await user.get("/api/volumes/snapshots")
    assert listed.status_code == 200, listed.text
    snapshot = listed.json()["items"][0]
    assert snapshot["volume_name"] == "data"
    assert snapshot["progress"] == "100%"

    created = cinder.post(f"{CINDER}/snapshots").mock(
        return_value=httpx.Response(
            202,
            json={
                "snapshot": {
                    "id": "snap-2",
                    "name": "now",
                    "status": "creating",
                    "volume_id": "vol-1",
                }
            },
        )
    )
    response = await user.post(
        "/api/volumes/snapshots",
        json={"volume_id": "vol-1", "name": "now"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 202, response.text
    assert response.json()["volume_name"] == "data"
    # vol-1 is in use, so the snapshot is forced as Horizon does.
    assert json.loads(created.calls.last.request.content)["snapshot"]["force"]

    backups = await user.get("/api/volumes/backups")
    assert backups.status_code == 200, backups.text
    backup = backups.json()["items"][0]
    assert backup["volume_name"] == "data"
    assert backup["snapshot_name"] == "before-upgrade"

    new_backup = cinder.post(f"{CINDER}/backups").mock(
        return_value=httpx.Response(
            202, json={"backup": {"id": "bak-2", "status": "creating"}}
        )
    )
    response = await user.post(
        "/api/volumes/backups",
        json={"volume_id": "vol-1", "name": "manual", "incremental": True},
        headers=csrf_headers(user),
    )
    assert response.status_code == 202, response.text
    sent = json.loads(new_backup.calls.last.request.content)["backup"]
    assert sent["force"] is True
    assert sent["incremental"] is True
    assert sent["container"] is None


async def test_restore_backup(user, cinder):
    created = cinder.post(f"{CINDER}/volumes").mock(
        return_value=httpx.Response(
            202, json={"volume": {"id": "vol-9", "status": "creating"}}
        )
    )
    needs_zone = await user.post(
        "/api/volumes/backups/bak-1/restore",
        json={},
        headers=csrf_headers(user),
    )
    assert needs_zone.status_code == 400

    response = await user.post(
        "/api/volumes/backups/bak-1/restore",
        json={"availability_zone": "monash-02", "volume_type": "standard"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 202, response.text
    assert response.json()["new_volume"] is True
    assert response.json()["volume_id"] == "vol-9"
    assert json.loads(created.calls.last.request.content)["volume"] == {
        "size": 20,
        "name": "restore_backup_bak-1",
        "availability_zone": "monash-02",
        "backup_id": "bak-1",
        "volume_type": "standard",
    }

    restored = cinder.post(f"{CINDER}/backups/bak-1/restore").mock(
        return_value=httpx.Response(
            202, json={"restore": {"backup_id": "bak-1", "volume_id": "vol-2"}}
        )
    )
    response = await user.post(
        "/api/volumes/backups/bak-1/restore",
        json={"volume_id": "vol-2"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 202, response.text
    assert response.json() == {
        "status": "accepted",
        "backup_id": "bak-1",
        "volume_id": "vol-2",
        "new_volume": False,
    }
    assert json.loads(restored.calls.last.request.content) == {
        "restore": {"volume_id": "vol-2"}
    }

    deleted = cinder.post(f"{CINDER}/backups/bak-1/action").mock(
        return_value=httpx.Response(202)
    )
    response = await user.delete(
        "/api/volumes/backups/bak-1?force=true", headers=csrf_headers(user)
    )
    assert response.status_code == 204
    assert json.loads(deleted.calls.last.request.content) == {
        "os-force_delete": {}
    }


async def test_error_volume_carries_latest_message(user, cinder):
    broken = {**VOLUMES[1], "id": "vol-9", "status": "error"}
    cinder.get(f"{CINDER}/volumes/vol-9").mock(
        return_value=httpx.Response(200, json={"volume": broken})
    )
    messages = cinder.get(f"{CINDER}/messages").mock(
        return_value=httpx.Response(
            200,
            json={
                "messages": [
                    {
                        "user_message": "attach volume: older",
                        "created_at": "2026-10-01T00:00:00.000000",
                    },
                    {
                        "user_message": "schedule allocate volume: no "
                        "weighted backend",
                        "created_at": "2026-10-02T00:00:00.000000",
                    },
                ]
            },
        )
    )
    response = await user.get("/api/volumes/vol-9")
    assert response.status_code == 200, response.text
    assert response.json()["fault"] == {
        "message": "schedule allocate volume: no weighted backend",
        "created": "2026-10-02T00:00:00Z",
    }
    assert messages.calls.last.request.url.params["resource_uuid"] == "vol-9"

    # A healthy volume does not ask; failing messages leave the fault out.
    healthy = await user.get("/api/volumes/vol-2")
    assert healthy.json()["fault"] is None
    assert messages.call_count == 1
    messages.mock(return_value=httpx.Response(500))
    response = await user.get("/api/volumes/vol-9")
    assert response.status_code == 200, response.text
    assert response.json()["fault"] is None


async def test_metadata_replaces_volume_and_snapshot_metadata(user, cinder):
    volume_meta = cinder.put(f"{CINDER}/volumes/vol-1/metadata").mock(
        return_value=httpx.Response(200, json={"metadata": {"role": "db"}})
    )
    response = await user.put(
        "/api/volumes/vol-1/metadata",
        json={"metadata": {"role": "db"}},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"metadata": {"role": "db"}}
    assert json.loads(volume_meta.calls.last.request.content) == {
        "metadata": {"role": "db"}
    }

    snapshot_meta = cinder.put(f"{CINDER}/snapshots/snap-1/metadata").mock(
        return_value=httpx.Response(200, json={"metadata": {}})
    )
    response = await user.put(
        "/api/volumes/snapshots/snap-1/metadata",
        json={"metadata": {}},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"metadata": {}}
    assert snapshot_meta.called

    empty_key = await user.put(
        "/api/volumes/vol-1/metadata",
        json={"metadata": {"": "x"}},
        headers=csrf_headers(user),
    )
    assert empty_key.status_code == 422


async def test_retype_applies_rules(user, cinder):
    cinder.get(f"{CINDER}/types").mock(
        return_value=httpx.Response(
            200,
            json={
                "volume_types": [
                    *TYPES,
                    {
                        "id": "t-monash",
                        "name": "monash-ssd",
                        "extra_specs": {
                            "RESKEY:availability_zones": "monash-02"
                        },
                    },
                ]
            },
        )
    )
    action = cinder.post(f"{CINDER}/volumes/vol-2/action").mock(
        return_value=httpx.Response(202)
    )
    same = await user.post(
        "/api/volumes/vol-2/retype",
        json={"volume_type": "qh2-ssd"},
        headers=csrf_headers(user),
    )
    assert same.status_code == 400
    assert "different" in same.json()["message"]
    other_zone = await user.post(
        "/api/volumes/vol-2/retype",
        json={"volume_type": "monash-ssd"},
        headers=csrf_headers(user),
    )
    assert other_zone.status_code == 400
    assert "melbourne-qh2" in other_zone.json()["message"]
    assert not action.called

    response = await user.post(
        "/api/volumes/vol-2/retype",
        json={"volume_type": "standard", "migration_policy": "on-demand"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 202, response.text
    assert json.loads(action.calls.last.request.content) == {
        "os-retype": {"new_type": "standard", "migration_policy": "on-demand"}
    }


async def test_transfers_create_cancel_and_accept(user, cinder):
    created = cinder.post(f"{CINDER}/volume-transfers").mock(
        return_value=httpx.Response(
            202,
            json={
                "transfer": {
                    "id": "tr-1",
                    "name": "to-lab",
                    "volume_id": "vol-2",
                    "auth_key": "a1b2c3d4e5f6a7b8",
                    "created_at": "2026-10-16T01:00:00.000000",
                }
            },
        )
    )
    blank = await user.post(
        "/api/volumes/vol-2/transfer",
        json={"name": "   "},
        headers=csrf_headers(user),
    )
    assert blank.status_code == 422
    response = await user.post(
        "/api/volumes/vol-2/transfer",
        json={"name": "to-lab"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 201, response.text
    assert response.json() == {
        "id": "tr-1",
        "name": "to-lab",
        "volume_id": "vol-2",
        "auth_key": "a1b2c3d4e5f6a7b8",
        "created_at": "2026-10-16T01:00:00Z",
    }
    assert json.loads(created.calls.last.request.content) == {
        "transfer": {"volume_id": "vol-2", "name": "to-lab"}
    }

    cinder.get(f"{CINDER}/volume-transfers/detail").mock(
        return_value=httpx.Response(
            200,
            json={"transfers": [{"id": "tr-1", "volume_id": "vol-2"}]},
        )
    )
    deleted = cinder.delete(f"{CINDER}/volume-transfers/tr-1").mock(
        return_value=httpx.Response(202)
    )
    response = await user.delete(
        "/api/volumes/vol-2/transfer", headers=csrf_headers(user)
    )
    assert response.status_code == 204, response.text
    assert deleted.called
    missing = await user.delete(
        "/api/volumes/vol-1/transfer", headers=csrf_headers(user)
    )
    assert missing.status_code == 404

    accepted = cinder.post(f"{CINDER}/volume-transfers/tr-9/accept").mock(
        return_value=httpx.Response(
            202,
            json={
                "transfer": {"id": "tr-9", "name": "gift", "volume_id": "v-9"}
            },
        )
    )
    response = await user.post(
        "/api/volumes/transfers/accept",
        json={"transfer_id": " tr-9 ", "auth_key": "k1"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    assert response.json() == {
        "id": "tr-9",
        "name": "gift",
        "volume_id": "v-9",
    }
    assert json.loads(accepted.calls.last.request.content) == {
        "accept": {"auth_key": "k1"}
    }
    too_long = await user.post(
        "/api/volumes/transfers/accept",
        json={"transfer_id": "tr-9", "auth_key": "k" * 17},
        headers=csrf_headers(user),
    )
    assert too_long.status_code == 422
