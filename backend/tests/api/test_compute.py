import base64
import json

import httpx
import pytest

from tests.conftest import csrf_headers, login

NOVA = "https://nova.test/v2.1"
NEUTRON = "https://neutron.test"
GLANCE = "https://glance.test"
CINDER = "https://cinder.test/v3/p1"
CLASSIC = "00000000-0000-0000-0000-000000000000"

SERVER = {
    "id": "srv-1",
    "name": "web-1",
    "status": "ACTIVE",
    "created": "2026-10-01T00:00:00Z",
    "updated": "2026-10-02T00:00:00Z",
    "locked": False,
    "key_name": "sam",
    "tenant_id": "p1",
    "OS-EXT-STS:power_state": 1,
    "OS-EXT-STS:task_state": None,
    "OS-EXT-STS:vm_state": "active",
    "OS-EXT-AZ:availability_zone": "melbourne-qh2",
    "flavor": {
        "original_name": "m3.small",
        "vcpus": 2,
        "ram": 4096,
        "disk": 30,
        "ephemeral": 0,
        "swap": 0,
        "extra_specs": {"nectar:rate": "0.5"},
    },
    "image": {"id": "img-ubuntu"},
    "addresses": {
        "classic": [
            {
                "addr": "203.0.113.5",
                "version": 4,
                "OS-EXT-IPS:type": "fixed",
                "OS-EXT-IPS-MAC:mac_addr": "fa:16:3e:00:00:01",
            }
        ]
    },
    "security_groups": [{"name": "default"}],
    "os-extended-volumes:volumes_attached": [{"id": "vol-1"}],
    "metadata": {},
}

FLAVORS = [
    {
        "id": "f-small",
        "name": "m3.small",
        "vcpus": 2,
        "ram": 4096,
        "disk": 30,
        "OS-FLV-EXT-DATA:ephemeral": 0,
        "os-flavor-access:is_public": True,
        "extra_specs": {"nectar:rate": "0.5"},
    },
    {
        "id": "f-pre",
        "name": "p3.small",
        "vcpus": 2,
        "ram": 4096,
        "disk": 30,
        "extra_specs": {
            "flavor_class:name": "preemptible",
            "nectar:rate": "0.1",
        },
    },
]

IMAGES = {
    "private": [
        {
            "id": "img-mine",
            "name": "mine",
            "visibility": "private",
            "owner": "p1",
            "status": "active",
        }
    ],
    "shared": [],
    "public": [
        {
            "id": "img-ubuntu",
            "name": "Ubuntu 24.04",
            "visibility": "public",
            "owner": "ops",
            "status": "active",
            "os_hash_algo": "sha512",
            "os_distro": "ubuntu",
        }
    ],
    "community": [
        {
            "id": "img-comm",
            "name": "Someone's image",
            "visibility": "community",
            "owner": "p9",
            "status": "active",
        },
        {
            "id": "img-snap",
            "name": "snap",
            "visibility": "community",
            "owner": "p1",
            "status": "active",
            "image_type": "snapshot",
        },
    ],
}


def image_catalog_entry(stype, name, url):
    return {
        "type": stype,
        "name": name,
        "endpoints": [
            {"interface": "public", "region": "Melbourne", "url": url}
        ],
    }


@pytest.fixture
def compute_catalog(upstream):
    """Extend the scoped token catalog with neutron, glance and cinder."""
    from tests import conftest

    original = conftest.catalog

    def richer():
        return original() + [
            image_catalog_entry("network", "neutron", NEUTRON),
            image_catalog_entry("image", "glance", GLANCE),
            image_catalog_entry("volumev3", "cinder", CINDER),
        ]

    conftest.catalog = richer
    conftest.mock_keystone(upstream)
    yield
    conftest.catalog = original


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


async def test_actions(user, nova):
    route = nova.post(f"{NOVA}/servers/srv-1/action").mock(
        return_value=httpx.Response(202)
    )
    headers = csrf_headers(user)
    for action, body, expected in (
        ("stop", None, {"os-stop": None}),
        ("reboot", {"type": "HARD"}, {"reboot": {"type": "HARD"}}),
        (
            "resize",
            {"flavor_id": "f-small"},
            {"resize": {"flavorRef": "f-small"}},
        ),
        (
            "add-security-group",
            {"security_group": "web"},
            {"addSecurityGroup": {"name": "web"}},
        ),
    ):
        response = await user.post(
            f"/api/compute/instances/srv-1/actions/{action}",
            json=body,
            headers=headers,
        )
        assert response.status_code == 202, (action, response.text)
        assert json.loads(route.calls.last.request.content) == expected
    missing = await user.post(
        "/api/compute/instances/srv-1/actions/resize", json={}, headers=headers
    )
    assert missing.status_code == 400
    unknown = await user.post(
        "/api/compute/instances/srv-1/actions/explode",
        json={},
        headers=headers,
    )
    assert unknown.status_code == 404


async def test_snapshot_action_returns_image_id(user, nova):
    nova.post(f"{NOVA}/servers/srv-1/action").mock(
        return_value=httpx.Response(202, json={"image_id": "img-new"})
    )
    response = await user.post(
        "/api/compute/instances/srv-1/actions/snapshot",
        json={"name": "before-upgrade"},
        headers=csrf_headers(user),
    )
    assert response.json() == {"status": "accepted", "image_id": "img-new"}


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
    assert bdm[0]["source_type"] == "volume" and bdm[0]["uuid"] == "vol-boot"

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
    assert sent["port_range_min"] == 443 and sent["protocol"] == "tcp"
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
    assert response.status_code == 404
    assert response.json()["error"] == "service_not_enabled"
