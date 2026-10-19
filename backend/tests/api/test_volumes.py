import json

import httpx
import pytest

from tests.conftest import csrf_headers, login

NOVA = "https://nova.test/v2.1"
GLANCE = "https://glance.test"
CINDER = "https://cinder.test/v3/p1"

VOLUMES = [
    {
        "id": "vol-1",
        "name": "data",
        "description": "scratch",
        "size": 20,
        "status": "in-use",
        "volume_type": "standard",
        "availability_zone": "melbourne-qh2",
        "bootable": "false",
        "encrypted": False,
        "attachments": [
            {
                "attachment_id": "att-1",
                "server_id": "srv-1",
                "device": "/dev/vdb",
                "attached_at": "2026-10-01T00:00:00Z",
            }
        ],
        "created_at": "2026-09-01T00:00:00Z",
        "metadata": {},
    },
    {
        "id": "vol-2",
        "name": "boot",
        "size": 30,
        "status": "available",
        "volume_type": "qh2-ssd",
        "availability_zone": "melbourne-qh2",
        "bootable": "true",
        "attachments": [],
        "volume_image_metadata": {
            "image_id": "img-ubuntu",
            "image_name": "Ubuntu 24.04",
        },
    },
]
SNAPSHOTS = [
    {
        "id": "snap-1",
        "name": "before-upgrade",
        "size": 20,
        "status": "available",
        "volume_id": "vol-1",
        "os-extended-snapshot-attributes:progress": "100%",
    }
]
BACKUPS = [
    {
        "id": "bak-1",
        "name": "nightly",
        "size": 20,
        "status": "available",
        "volume_id": "vol-1",
        "snapshot_id": "snap-1",
        "availability_zone": "melbourne-qh2",
        "container": "backups",
        "is_incremental": False,
    }
]
TYPES = [
    {"id": "t-std", "name": "standard", "extra_specs": {}},
    {
        "id": "t-qh2",
        "name": "qh2-ssd",
        "extra_specs": {"RESKEY:availability_zones": "melbourne-qh2"},
    },
]
LIMITS = {
    "maxTotalVolumeGigabytes": 1000,
    "maxTotalVolumes": 10,
    "maxTotalSnapshots": -1,
    "totalGigabytesUsed": 50,
    "totalVolumesUsed": 2,
    "totalSnapshotsUsed": -3,
}


def catalog_entry(stype, name, url):
    return {
        "type": stype,
        "name": name,
        "endpoints": [
            {"interface": "public", "region": "Melbourne", "url": url}
        ],
    }


@pytest.fixture
def volume_catalog(upstream):
    from tests import conftest

    original = conftest.catalog

    def richer():
        return original() + [
            catalog_entry("image", "glance", GLANCE),
            catalog_entry("volumev3", "cinder", CINDER),
        ]

    conftest.catalog = richer
    conftest.mock_keystone(upstream)
    yield
    conftest.catalog = original


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
    # Only available volumes can be cloned; vol-1 is in use.
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


async def test_volume_types_are_cached_per_project(user, cinder, redis):
    types = cinder.get(f"{CINDER}/types").mock(
        return_value=httpx.Response(200, json={"volume_types": TYPES})
    )
    response = await user.get("/api/volumes/types")
    assert response.status_code == 200, response.text
    assert types.call_count == 1
    keys = set(await redis.keys("*cinder-types*"))
    assert keys and all(":p:p1:" in k for k in keys)
    # A second project does not see the first project's private types.
    switched = await user.post(
        "/api/session/project",
        json={"project_id": "p2"},
        headers=csrf_headers(user),
    )
    assert switched.status_code == 200, switched.text
    assert (await user.get("/api/volumes/types")).status_code == 200
    assert types.call_count == 2
    assert any(":p:p2:" in k for k in await redis.keys("*cinder-types*"))


async def test_snapshot_and_backup_detail(user, cinder):
    snapshot = await user.get("/api/volumes/snapshots/snap-1")
    assert snapshot.status_code == 200, snapshot.text
    assert snapshot.json()["volume_name"] == "data"

    updated = cinder.put(f"{CINDER}/snapshots/snap-1").mock(
        return_value=httpx.Response(200, json={"snapshot": SNAPSHOTS[0]})
    )
    response = await user.patch(
        "/api/volumes/snapshots/snap-1",
        json={"name": "renamed"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    assert json.loads(updated.calls.last.request.content) == {
        "snapshot": {"name": "renamed"}
    }
    empty = await user.patch(
        "/api/volumes/snapshots/snap-1",
        json={},
        headers=csrf_headers(user),
    )
    assert empty.status_code == 400

    backup = await user.get("/api/volumes/backups/bak-1")
    assert backup.status_code == 200, backup.text
    assert backup.json()["volume_name"] == "data"
    assert backup.json()["snapshot_name"] == "before-upgrade"

    # A parent that has gone leaves the name blank, not an error.
    cinder.get(f"{CINDER}/volumes/vol-1").mock(
        return_value=httpx.Response(
            404, json={"itemNotFound": {"message": "gone"}}
        )
    )
    cinder.get(f"{CINDER}/snapshots/snap-1").mock(
        return_value=httpx.Response(
            404, json={"itemNotFound": {"message": "gone"}}
        )
    )
    orphan = await user.get("/api/volumes/backups/bak-1")
    assert orphan.status_code == 200, orphan.text
    assert orphan.json()["volume_name"] is None
    assert orphan.json()["snapshot_name"] is None
