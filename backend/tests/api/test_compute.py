import base64
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
    NEUTRON,
    NEUTRON_ENTRY,
    NOVA,
)
from tests.fixtures.loader import fixture

CLASSIC = "00000000-0000-0000-0000-000000000000"

SERVER = fixture("nova", "server")

FLAVORS = fixture("nova", "flavors")

IMAGES = fixture("glance", "images")

VOLUME_TYPES = fixture("cinder", "types")

# A Blazar reservation's flavour: the reservation id in the extra spec.
RESERVED = {
    "id": "r-f1",
    "name": "reservation:res-1",
    "vcpus": 4,
    "ram": 16384,
    "disk": 30,
    "extra_specs": {
        "aggregate_instance_extra_specs:reservation": "res-1",
        "flavor_class:name": "standard-v3",
    },
}


@pytest.fixture
def compute_catalog(with_services):
    """Neutron, Glance and Cinder in the catalog, before login."""
    with_services(NEUTRON_ENTRY, GLANCE_ENTRY, CINDER_ENTRY)


def mock_images(upstream):
    def answer(request):
        visibility = request.url.params.get("visibility")
        return httpx.Response(200, json={"images": IMAGES.get(visibility, [])})

    upstream.get(f"{GLANCE}/v2/images").mock(side_effect=answer)


@pytest.fixture
def nova(upstream, compute_catalog):
    upstream.get(f"{NOVA}/servers/detail").mock(
        return_value=httpx.Response(200, json={"servers": [SERVER]})
    )
    upstream.get(f"{NOVA}/servers/srv-1").mock(
        return_value=httpx.Response(200, json={"server": SERVER})
    )
    upstream.get(f"{NOVA}/flavors/detail").mock(
        return_value=httpx.Response(200, json={"flavors": FLAVORS})
    )
    for flavor in [*FLAVORS, RESERVED]:
        upstream.get(f"{NOVA}/flavors/{flavor['id']}").mock(
            return_value=httpx.Response(200, json={"flavor": flavor})
        )
    upstream.get(f"{CINDER}/types").mock(
        return_value=httpx.Response(200, json={"volume_types": VOLUME_TYPES})
    )
    upstream.get(f"{NOVA}/os-availability-zone").mock(
        return_value=httpx.Response(
            200,
            json={
                "availabilityZoneInfo": [
                    {
                        "zoneName": "melbourne-qh2",
                        "zoneState": {"available": True},
                    }
                ]
            },
        )
    )
    upstream.get(f"{NOVA}/os-keypairs").mock(
        return_value=httpx.Response(
            200,
            json={
                "keypairs": [
                    {
                        "keypair": {
                            "name": "sam",
                            "type": "ssh",
                            "fingerprint": "aa:bb",
                        }
                    }
                ]
            },
        )
    )
    upstream.get(f"{NOVA}/os-server-groups").mock(
        return_value=httpx.Response(200, json={"server_groups": []})
    )
    upstream.get(f"{NOVA}/limits").mock(
        return_value=httpx.Response(
            200,
            json={
                "limits": {
                    "absolute": {
                        "maxTotalInstances": 10,
                        "totalInstancesUsed": 1,
                    }
                }
            },
        )
    )
    mock_images(upstream)
    return upstream


@pytest.fixture
async def user(nova, client):
    """A client logged in after the richer catalog is in place."""
    assert (await login(client)).status_code == 303
    return client


async def test_list_instances_shapes_servers(user, nova):
    response = await user.get(
        "/api/compute/instances?status=ACTIVE&sort_key=created_at"
    )
    assert response.status_code == 200, response.text
    body = response.json()
    item = body["items"][0]
    assert item["name"] == "web-1"
    assert item["power_state"] == "RUNNING"
    assert item["flavor"]["name"] == "m3.small"
    assert item["flavor"]["su_rate"] == 0.5
    assert item["image"] == {"id": "img-ubuntu", "name": "Ubuntu 24.04"}
    assert item["addresses"][0]["addr"] == "203.0.113.5"
    assert item["volumes_attached"] == ["vol-1"]
    assert body["next_marker"] is None
    sent = nova.calls.last.request.url.params if False else None
    # The nova call carried the filter and the sort.
    nova_calls = [
        c for c in nova.calls if "/servers/detail" in str(c.request.url)
    ]
    params = nova_calls[-1].request.url.params
    assert params["status"] == "ACTIVE"
    assert params["sort_key"] == "created_at"
    assert params["sort_dir"] == "desc"
    assert (
        nova_calls[-1].request.headers["OpenStack-API-Version"]
        == "compute 2.90"
    )
    assert sent is None


async def test_instance_detail_and_resize_flavors(user, nova):
    detail = (await user.get("/api/compute/instances/srv-1")).json()
    assert detail["id"] == "srv-1"
    assert detail["availability_zone"] == "melbourne-qh2"
    flavors = (
        await user.get("/api/compute/instances/srv-1/resize-flavors")
    ).json()
    # The current flavour and the hidden p3.* family are excluded.
    assert flavors["items"] == []


ACTION = "/api/compute/instances/srv-1/actions"


@pytest.mark.parametrize(
    ("body", "method", "url"),
    [
        ({"action": "reboot"}, "POST", f"{NOVA}/servers/srv-1/action"),
        (
            {"action": "attach-volume", "volume_id": "vol-1"},
            "POST",
            f"{NOVA}/servers/srv-1/os-volume_attachments",
        ),
        (
            {"action": "detach-volume", "volume_id": "vol-1"},
            "DELETE",
            f"{NOVA}/servers/srv-1/os-volume_attachments/vol-1",
        ),
        (
            {"action": "attach-interface", "network_id": "net-1"},
            "POST",
            f"{NOVA}/servers/srv-1/os-interface",
        ),
        (
            {"action": "detach-interface", "port_id": "port-1"},
            "DELETE",
            f"{NOVA}/servers/srv-1/os-interface/port-1",
        ),
        (
            {"action": "update-metadata", "metadata": {"a": "1"}},
            "PUT",
            f"{NOVA}/servers/srv-1/metadata",
        ),
        (
            {
                "action": "associate-fip",
                "floating_ip_id": "fip-1",
                "port_id": "port-1",
            },
            "PUT",
            f"{NEUTRON}/v2.0/floatingips/fip-1",
        ),
        (
            {"action": "disassociate-fip", "floating_ip_id": "fip-1"},
            "PUT",
            f"{NEUTRON}/v2.0/floatingips/fip-1",
        ),
    ],
)
async def test_actions_reach_their_upstream_call(
    user, nova, body, method, url
):
    route = nova.request(method, url).mock(
        return_value=httpx.Response(202, json={})
    )
    response = await user.post(ACTION, json=body, headers=csrf_headers(user))
    assert response.status_code == 202, response.text
    assert response.json() == {"status": "accepted", "image_id": None}
    assert route.called


async def test_snapshot_action_returns_image_id(user, nova):
    nova.post(f"{NOVA}/servers/srv-1/action").mock(
        return_value=httpx.Response(202, json={"image_id": "img-new"})
    )
    response = await user.post(
        ACTION,
        json={"action": "snapshot", "name": "before-upgrade"},
        headers=csrf_headers(user),
    )
    assert response.json() == {"status": "accepted", "image_id": "img-new"}


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"action": "explode"}, "action"),
        ({}, "action"),
        ({"action": "resize"}, "flavor_id"),
        ({"action": "reboot", "flavor_id": "f-small"}, "flavor_id"),
    ],
)
async def test_action_bodies_that_are_refused(user, nova, body, field):
    """A wrong field is named in its ``loc``; an unknown or missing action
    name has no field of its own, so pydantic names ``action`` in the
    message."""
    route = nova.post(f"{NOVA}/servers/srv-1/action")
    response = await user.post(ACTION, json=body, headers=csrf_headers(user))
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any(field in e["loc"] or field in e["msg"] for e in detail)
    assert not route.called


async def test_the_old_action_path_is_gone(user, nova):
    response = await user.post(
        f"{ACTION}/reboot", json={}, headers=csrf_headers(user)
    )
    assert response.status_code in (404, 405)


async def test_launch_options_applies_nectar_rules(user, nova):
    nova.get(f"{NEUTRON}/v2.0/networks/{CLASSIC}").mock(
        return_value=httpx.Response(
            200,
            json={
                "network": {
                    "id": CLASSIC,
                    "name": "Classic Provider",
                    "shared": True,
                    "subnets": [],
                }
            },
        )
    )

    def networks(request):
        params = request.url.params
        if params.get("shared") == "true":
            assert params["tags-any"] == "nectar:bootable"
            return httpx.Response(
                200,
                json={
                    "networks": [
                        {
                            "id": "net-shared",
                            "name": "qh2-shared",
                            "shared": True,
                            "subnets": ["sub-s"],
                        },
                    ]
                },
            )
        return httpx.Response(
            200,
            json={
                "networks": [
                    {
                        "id": "net-proj",
                        "name": "my-net",
                        "project_id": "p1",
                        "subnets": ["sub-p"],
                    },
                    {
                        "id": "net-empty",
                        "name": "empty",
                        "project_id": "p1",
                        "subnets": [],
                    },
                ]
            },
        )

    nova.get(f"{NEUTRON}/v2.0/networks").mock(side_effect=networks)
    nova.get(f"{NEUTRON}/v2.0/subnets").mock(
        return_value=httpx.Response(
            200,
            json={
                "subnets": [
                    {
                        "id": "sub-s",
                        "network_id": "net-shared",
                        "cidr": "10.0.0.0/24",
                        "ip_version": 4,
                    },
                    {
                        "id": "sub-p",
                        "network_id": "net-proj",
                        "cidr": "192.168.0.0/24",
                        "ip_version": 4,
                    },
                ]
            },
        )
    )
    nova.get(f"{NEUTRON}/v2.0/security-groups").mock(
        return_value=httpx.Response(
            200,
            json={
                "security_groups": [
                    {
                        "id": "sg-1",
                        "name": "default",
                        "security_group_rules": [],
                    }
                ]
            },
        )
    )
    nova.get(f"{CINDER}/volumes/detail").mock(
        return_value=httpx.Response(
            200,
            json={
                "volumes": [
                    {
                        "id": "vol-boot",
                        "name": "boot",
                        "size": 30,
                        "status": "available",
                        "bootable": "true",
                    },
                    {
                        "id": "vol-data",
                        "name": "data",
                        "size": 30,
                        "status": "available",
                        "bootable": "false",
                    },
                ]
            },
        )
    )
    nova.get(f"{CINDER}/snapshots/detail").mock(
        return_value=httpx.Response(200, json={"snapshots": []})
    )
    body = (await user.get("/api/compute/launch-options")).json()
    assert body["errors"] == {}
    assert [n["id"] for n in body["networks"]] == [
        CLASSIC,
        "net-proj",
        "net-shared",
    ]
    assert body["networks"][0]["is_classic"] is True
    assert body["networks"][1]["subnets"][0]["cidr"] == "192.168.0.0/24"
    flavors = {f["id"]: f for f in body["flavors"]}
    assert flavors["f-pre"]["is_preemptible"] is True
    assert flavors["f-small"]["su_rate"] == 0.5
    assert flavors["f-small"]["is_reservation"] is False
    # Classes present among the flavours; f-small has none.
    assert body["flavor_classes"] == [
        {
            "id": "preemptible",
            "title": "Preemptible (p3)",
            "description": (
                "Extra compute for a short period at a quarter of the SU"
                " cost of the matching m3 flavour; instances are stopped"
                " within 24 hours and may be stopped at any time."
            ),
            "count": 1,
        }
    ]
    assert [t["name"] for t in body["volume_types"]] == ["qh2-ssd", "standard"]
    assert body["has_zoned_types"] is True
    images = {i["id"]: i for i in body["images"]}
    assert images["img-comm"]["hidden_until_search"] is True
    assert images["img-mine"]["hidden_until_search"] is False
    assert "os_hash_algo" not in images["img-ubuntu"]["properties"]
    assert [s["id"] for s in body["snapshots"]] == ["img-snap"]
    assert [v["id"] for v in body["volumes"]] == ["vol-boot"]
    assert body["defaults"]["create_volume"] is False
    assert body["availability_zones"] == [
        {"name": "melbourne-qh2", "available": True}
    ]


async def test_launch_options_reports_partial_failures(user, nova):
    nova.get(f"{NEUTRON}/v2.0/networks/{CLASSIC}").mock(
        return_value=httpx.Response(404)
    )
    nova.get(f"{NEUTRON}/v2.0/networks").mock(
        return_value=httpx.Response(503, text="down")
    )
    nova.get(f"{NEUTRON}/v2.0/subnets").mock(
        return_value=httpx.Response(200, json={"subnets": []})
    )
    nova.get(f"{NEUTRON}/v2.0/security-groups").mock(
        return_value=httpx.Response(200, json={"security_groups": []})
    )
    nova.get(f"{CINDER}/volumes/detail").mock(
        return_value=httpx.Response(200, json={"volumes": []})
    )
    nova.get(f"{CINDER}/snapshots/detail").mock(
        return_value=httpx.Response(200, json={"snapshots": []})
    )
    body = (await user.get("/api/compute/launch-options")).json()
    assert body["networks"] is None
    assert body["errors"]["networks"]["error"] == "upstream_error"
    assert body["flavors"]


async def test_launch_builds_nova_body(user, nova):
    route = nova.post(f"{NOVA}/servers").mock(
        return_value=httpx.Response(202, json={"server": {"id": "srv-new"}})
    )
    response = await user.post(
        "/api/compute/instances",
        json={
            "name": "new-vm",
            "count": 2,
            "source": {"type": "image", "id": "img-ubuntu"},
            "flavor_id": "f-small",
            "availability_zone": "melbourne-qh2",
            "networks": [CLASSIC],
            "security_groups": ["default"],
            "key_name": "sam",
            "user_data": "#!/bin/sh\necho hi\n",
            "server_group_id": "sg-grp",
        },
        headers=csrf_headers(user),
    )
    assert response.status_code == 202, response.text
    assert response.json()["ids"] == ["srv-new"]
    sent = json.loads(route.calls.last.request.content)
    server = sent["server"]
    assert server["imageRef"] == "img-ubuntu"
    assert server["min_count"] == server["max_count"] == 2
    assert server["networks"] == [{"uuid": CLASSIC}]
    assert server["security_groups"] == [{"name": "default"}]
    assert (
        server["user_data"]
        == base64.b64encode(b"#!/bin/sh\necho hi\n").decode()
    )
    assert sent["os:scheduler_hints"] == {"group": "sg-grp"}

    volume_boot = await user.post(
        "/api/compute/instances",
        json={
            "name": "from-volume",
            "source": {"type": "volume", "id": "vol-boot"},
            "flavor_id": "f-small",
            "availability_zone": "melbourne-qh2",
            "networks": [CLASSIC],
        },
        headers=csrf_headers(user),
    )
    assert volume_boot.status_code == 202
    bdm = json.loads(route.calls.last.request.content)["server"][
        "block_device_mapping_v2"
    ]
    assert bdm[0]['source_type'] == 'volume'
    assert bdm[0]['uuid'] == 'vol-boot'

    nova.get(f"{GLANCE}/v2/images/img-ubuntu").mock(
        return_value=httpx.Response(
            200, json={"id": "img-ubuntu", "size": 2 * 1024**3, "min_disk": 10}
        )
    )
    new_volume = await user.post(
        "/api/compute/instances",
        json={
            "name": "on-a-volume",
            "source": {"type": "image", "id": "img-ubuntu"},
            "flavor_id": "f-small",
            "availability_zone": "melbourne-qh2",
            "networks": [CLASSIC],
            "create_volume": True,
            "volume_size_gb": 40,
            "volume_type": "qh2-ssd",
            "delete_volume_on_termination": True,
            "config_drive": True,
        },
        headers=csrf_headers(user),
    )
    assert new_volume.status_code == 202, new_volume.text
    server = json.loads(route.calls.last.request.content)["server"]
    assert server["imageRef"] == ""
    assert server["config_drive"] is True
    assert server["availability_zone"] == "melbourne-qh2"
    assert server["block_device_mapping_v2"] == [
        {
            "boot_index": 0,
            "uuid": "img-ubuntu",
            "source_type": "image",
            "destination_type": "volume",
            "volume_size": 40,
            "delete_on_termination": True,
            "volume_type": "qh2-ssd",
        }
    ]

    too_small = await user.post(
        "/api/compute/instances",
        json={
            "name": "tiny",
            "source": {"type": "image", "id": "img-ubuntu"},
            "flavor_id": "f-small",
            "availability_zone": "melbourne-qh2",
            "networks": [CLASSIC],
            "create_volume": True,
            "volume_size_gb": 1,
        },
        headers=csrf_headers(user),
    )
    assert too_small.status_code == 400

    any_zone = await user.post(
        "/api/compute/instances",
        json={
            "name": "anywhere",
            "source": {"type": "image", "id": "img-ubuntu"},
            "flavor_id": "f-small",
            "networks": [CLASSIC],
        },
        headers=csrf_headers(user),
    )
    assert any_zone.status_code == 202
    server = json.loads(route.calls.last.request.content)["server"]
    assert "availability_zone" not in server

    # A reservation flavour's extra specs pin the reserved hosts, so the
    # chosen zone is not sent.
    reserved = await user.post(
        "/api/compute/instances",
        json={
            "name": "reserved",
            "source": {"type": "image", "id": "img-ubuntu"},
            "flavor_id": "r-f1",
            "availability_zone": "melbourne-qh2",
            "networks": [CLASSIC],
        },
        headers=csrf_headers(user),
    )
    assert reserved.status_code == 202, reserved.text
    server = json.loads(route.calls.last.request.content)["server"]
    assert "availability_zone" not in server

    typed_without_volume = await user.post(
        "/api/compute/instances",
        json={
            "name": "x",
            "source": {"type": "image", "id": "img-ubuntu"},
            "flavor_id": "f-small",
            "networks": [CLASSIC],
            "volume_type": "qh2-ssd",
        },
        headers=csrf_headers(user),
    )
    assert typed_without_volume.status_code == 422

    no_network = await user.post(
        "/api/compute/instances",
        json={
            "name": "x",
            "source": {"type": "image", "id": "img-ubuntu"},
            "flavor_id": "f-small",
            "availability_zone": "melbourne-qh2",
        },
        headers=csrf_headers(user),
    )
    assert no_network.status_code == 400


async def test_image_file_upload_streams_to_glance(user, nova):
    created = nova.post(f"{GLANCE}/v2/images").mock(
        return_value=httpx.Response(
            201,
            json={
                "id": "img-new",
                "name": "mine-2",
                "status": "queued",
                "visibility": "private",
                "owner": "p1",
            },
        )
    )
    upload = nova.put(f"{GLANCE}/v2/images/img-new/file").mock(
        return_value=httpx.Response(204)
    )
    nova.get(f"{GLANCE}/v2/images/img-new").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "img-new",
                "name": "mine-2",
                "status": "active",
                "visibility": "private",
                "owner": "p1",
                "size": 4,
            },
        )
    )

    response = await user.post(
        "/api/compute/images",
        json={"name": "mine-2", "disk_format": "qcow2"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 201, response.text
    assert created.called
    sent = json.loads(created.calls.last.request.content)
    assert sent["visibility"] == "private"

    response = await user.put(
        "/api/compute/images/img-new/file",
        content=b"data",
        headers={
            **csrf_headers(user),
            "Content-Type": "application/octet-stream",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "active"
    request = upload.calls.last.request
    assert request.content == b"data"
    assert request.headers["content-type"] == "application/octet-stream"
    assert request.headers["content-length"] == "4"
    assert request.headers["x-auth-token"]


async def test_image_file_upload_limits(user, nova, settings):
    settings.image_upload_max_bytes = 8
    too_big = await user.put(
        "/api/compute/images/img-new/file",
        content=b"0123456789",
        headers={
            **csrf_headers(user),
            "Content-Type": "application/octet-stream",
        },
    )
    assert too_big.status_code == 413
    assert too_big.json()["error"] == "payload_too_large"

    empty = await user.put(
        "/api/compute/images/img-new/file",
        content=b"",
        headers={
            **csrf_headers(user),
            "Content-Type": "application/octet-stream",
        },
    )
    assert empty.status_code == 400


async def test_images_listing_filters(user, nova):
    everything = (await user.get("/api/compute/images")).json()["items"]
    assert [i["id"] for i in everything] == ["img-mine", "img-ubuntu"]
    searched = (await user.get("/api/compute/images?q=someone")).json()[
        "items"
    ]
    assert [i["id"] for i in searched] == ["img-comm"]
    snapshots = (await user.get("/api/compute/images?snapshots=true")).json()[
        "items"
    ]
    assert [i["id"] for i in snapshots] == ["img-snap"]


async def test_keypair_create_returns_private_key_once(user, nova):
    nova.post(f"{NOVA}/os-keypairs").mock(
        return_value=httpx.Response(
            201,
            json={
                "keypair": {
                    "name": "new",
                    "type": "ssh",
                    "fingerprint": "cc:dd",
                    "public_key": "ssh-ed25519 AAA",
                    "private_key": "PRIVATE",
                }
            },
        )
    )
    response = await user.post(
        "/api/compute/keypairs",
        json={"name": "new"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 201
    assert response.json()["private_key"] == "PRIVATE"
    listing = (await user.get("/api/compute/keypairs")).json()
    assert listing["items"][0]["name"] == "sam"


async def test_security_group_rules(user, nova):
    nova.get(f"{NEUTRON}/v2.0/security-groups/sg-1").mock(
        return_value=httpx.Response(
            200,
            json={
                "security_group": {
                    "id": "sg-1",
                    "name": "web",
                    "description": "",
                    "security_group_rules": [
                        {
                            "id": "r1",
                            "direction": "ingress",
                            "ethertype": "IPv4",
                            "protocol": "tcp",
                            "port_range_min": 22,
                            "port_range_max": 22,
                            "remote_ip_prefix": "0.0.0.0/0",
                        }
                    ],
                }
            },
        )
    )
    detail = (await user.get("/api/network/security-groups/sg-1")).json()
    assert detail["rules"][0]["open_to_the_world"] is True

    created = nova.post(f"{NEUTRON}/v2.0/security-group-rules").mock(
        return_value=httpx.Response(
            201,
            json={
                "security_group_rule": {
                    "id": "r2",
                    "direction": "ingress",
                    "ethertype": "IPv4",
                    "protocol": "tcp",
                    "port_range_min": 443,
                    "port_range_max": 443,
                    "remote_ip_prefix": "10.0.0.0/8",
                }
            },
        )
    )
    response = await user.post(
        "/api/network/security-groups/sg-1/rules",
        json={"preset": "https", "remote_ip_prefix": "10.0.0.0/8"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 201, response.text
    sent = json.loads(created.calls.last.request.content)[
        "security_group_rule"
    ]
    assert sent['port_range_min'] == 443
    assert sent['protocol'] == 'tcp'
    assert sent["security_group_id"] == "sg-1"

    no_remote = await user.post(
        "/api/network/security-groups/sg-1/rules",
        json={"preset": "ssh"},
        headers=csrf_headers(user),
    )
    assert no_remote.status_code == 400
    presets = (await user.get("/api/network/security-group-presets")).json()
    assert presets["default_remote_cidr"] == ""
    assert any(p["id"] == "ssh" for p in presets["items"])


async def test_service_missing_from_catalog(logged_in, upstream):
    """Without neutron in the catalog the network endpoints say so."""
    response = await logged_in.get("/api/network/security-groups")
    assert response.status_code == 501
    assert response.json()["error"] == "service_not_enabled"


async def test_image_update_sends_a_json_patch(user, nova):
    image = {
        "id": "img-1",
        "name": "new",
        "status": "active",
        "visibility": "private",
    }
    patched = nova.patch(f"{GLANCE}/v2/images/img-1").mock(
        return_value=httpx.Response(200, json=image)
    )
    response = await user.patch(
        "/api/compute/images/img-1",
        json={"name": "new", "properties": {"a/b": "x", "old": None}},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    sent = patched.calls.last.request
    assert sent.headers["content-type"] == (
        "application/openstack-images-v2.1-json-patch"
    )
    assert json.loads(sent.content) == [
        {"op": "replace", "path": "/name", "value": "new"},
        {"op": "add", "path": "/a~1b", "value": "x"},
        {"op": "remove", "path": "/old"},
    ]


@pytest.mark.parametrize(
    ("body", "says"),
    [
        ({"properties": {"os_hash_value": "x"}}, "reserved"),
        ({"properties": {"direct_url": "x"}}, "reserved"),
        ({}, "nothing to update"),
    ],
)
async def test_image_updates_that_are_refused(user, nova, body, says):
    response = await user.patch(
        "/api/compute/images/img-1", json=body, headers=csrf_headers(user)
    )
    assert response.status_code == 400
    assert says in response.json()["message"]


async def test_image_delete(user, nova):
    deleted = nova.delete(f"{GLANCE}/v2/images/img-1").mock(
        return_value=httpx.Response(204)
    )
    response = await user.delete(
        "/api/compute/images/img-1", headers=csrf_headers(user)
    )
    assert response.status_code == 204
    assert deleted.called


async def test_keypair_detail_and_delete(user, nova):
    nova.get(f"{NOVA}/os-keypairs/sam").mock(
        return_value=httpx.Response(
            200,
            json={
                "keypair": {
                    "name": "sam",
                    "type": "ssh",
                    "fingerprint": "aa:bb",
                    "public_key": "ssh-ed25519 AAAA",
                    "created_at": "2026-10-01T00:00:00.000000",
                }
            },
        )
    )
    deleted = nova.delete(f"{NOVA}/os-keypairs/sam").mock(
        return_value=httpx.Response(202)
    )
    detail = (await user.get("/api/compute/keypairs/sam")).json()
    assert detail["created_at"] == "2026-10-01T00:00:00Z"
    assert detail["public_key"] == "ssh-ed25519 AAAA"
    listed = (await user.get("/api/compute/keypairs")).json()["items"]
    assert [k["name"] for k in listed] == ["sam"]
    response = await user.delete(
        "/api/compute/keypairs/sam", headers=csrf_headers(user)
    )
    assert response.status_code == 204
    assert deleted.called


async def test_server_groups(user, nova):
    group = {"id": "g-1", "name": "spread", "policy": "anti-affinity"}
    created = nova.post(f"{NOVA}/os-server-groups").mock(
        return_value=httpx.Response(200, json={"server_group": group})
    )
    deleted = nova.delete(f"{NOVA}/os-server-groups/g-1").mock(
        return_value=httpx.Response(204)
    )
    response = await user.post(
        "/api/compute/server-groups",
        json={"name": "spread", "policy": "anti-affinity"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 201
    assert response.json() == {**group, "members": []}
    assert json.loads(created.calls.last.request.content) == {
        "server_group": {"name": "spread", "policy": "anti-affinity"}
    }
    assert (await user.get("/api/compute/server-groups")).json() == {
        "items": []
    }
    response = await user.delete(
        "/api/compute/server-groups/g-1", headers=csrf_headers(user)
    )
    assert response.status_code == 204
    assert deleted.called


async def test_instance_detail_user_data_and_power_states(user, nova):
    nova.get(f"{NOVA}/servers/srv-1").mock(
        return_value=httpx.Response(
            200,
            json={
                "server": {
                    **SERVER,
                    "OS-EXT-STS:power_state": 5,
                    "OS-EXT-SRV-ATTR:user_data": "dXNlci1kYXRh",
                    "OS-EXT-SRV-ATTR:hostname": "web-1",
                }
            },
        )
    )
    detail = (await user.get("/api/compute/instances/srv-1")).json()
    assert detail["power_state"] == "SHUTOFF"
    assert detail["user_data"] == "dXNlci1kYXRh"
    assert detail["os_ext_srv_attr"]["hostname"] == "web-1"


@pytest.mark.parametrize(
    ("kind", "protocol"),
    [("novnc", "vnc"), ("spice-html5", "spice"), ("serial", "serial")],
)
async def test_console_protocol_follows_type(user, nova, kind, protocol):
    route = nova.post(f"{NOVA}/servers/srv-1/remote-consoles").mock(
        return_value=httpx.Response(
            200,
            json={"remote_console": {"type": kind, "url": "https://c.test"}},
        )
    )
    response = await user.post(
        "/api/compute/instances/srv-1/console",
        json={"type": kind},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"url": "https://c.test", "type": kind}
    assert json.loads(route.calls.last.request.content) == {
        "remote_console": {"protocol": protocol, "type": kind}
    }


async def test_visibility_change_refreshes_the_shared_listings(
    user, nova, redis
):
    public = "hive:c:g:images-public"
    await redis.set(public, "stale")
    nova.patch(f"{GLANCE}/v2/images/img-1").mock(
        return_value=httpx.Response(
            200,
            json={"id": "img-1", "status": "active", "visibility": "public"},
        )
    )
    headers = csrf_headers(user)
    response = await user.patch(
        "/api/compute/images/img-1", json={"name": "n"}, headers=headers
    )
    assert response.status_code == 200, response.text
    assert await redis.get(public) == "stale"
    response = await user.patch(
        "/api/compute/images/img-1",
        json={"visibility": "public"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert await redis.get(public) is None


async def test_instance_console_password_limits_and_edits(user, nova):
    nova.post(f"{NOVA}/servers/srv-1/action").mock(
        return_value=httpx.Response(200, json={"output": "boot log"})
    )
    nova.post(f"{NOVA}/servers/srv-1/remote-consoles").mock(
        return_value=httpx.Response(
            200,
            json={"remote_console": {"url": "https://vnc/x", "type": "novnc"}},
        )
    )
    nova.get(f"{NOVA}/servers/srv-1/os-server-password").mock(
        return_value=httpx.Response(200, json={"password": "c2VjcmV0"})
    )
    updated = nova.put(f"{NOVA}/servers/srv-1").mock(
        return_value=httpx.Response(200, json={"server": SERVER})
    )
    deleted = nova.delete(f"{NOVA}/servers/srv-1").mock(
        return_value=httpx.Response(204)
    )
    headers = csrf_headers(user)
    output = await user.get("/api/compute/instances/srv-1/console-output")
    assert output.json() == {"output": "boot log"}
    console = await user.post(
        "/api/compute/instances/srv-1/console", headers=headers
    )
    assert console.json() == {"url": "https://vnc/x", "type": "novnc"}
    password = await user.get("/api/compute/instances/srv-1/password")
    assert password.json() == {"encrypted_password": "c2VjcmV0"}
    limits = await user.get("/api/compute/limits")
    assert limits.json()["maxTotalInstances"] == 10
    renamed = await user.patch(
        "/api/compute/instances/srv-1", json={"name": "web"}, headers=headers
    )
    assert renamed.status_code == 200
    assert json.loads(updated.calls.last.request.content) == {
        "server": {"name": "web"}
    }
    empty = await user.patch(
        "/api/compute/instances/srv-1", json={}, headers=headers
    )
    assert empty.status_code == 422
    gone = await user.delete("/api/compute/instances/srv-1", headers=headers)
    assert gone.status_code == 204
    assert deleted.called
