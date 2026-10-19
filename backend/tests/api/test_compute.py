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
        "extra_specs": {
            "nectar:rate": "0.5",
            "flavor_class:name": "standard-v3",
        },
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
    # A Blazar reservation flavour: the source flavour's specs copied plus
    # the reservation spec, private to the project.
    {
        "id": "res-1",
        "name": "reservation:res-1",
        "vcpus": 2,
        "ram": 4096,
        "disk": 30,
        "os-flavor-access:is_public": False,
        "extra_specs": {
            "flavor_class:name": "standard-v3",
            "aggregate_instance_extra_specs:reservation": "res-1",
            "resources:CUSTOM_RESERVATION_RES_1": "1",
            "nectar:rate": "0.5",
        },
    },
]

VOLUME_TYPES = [
    {"id": "t-std", "name": "standard", "extra_specs": {}},
    {
        "id": "t-qh2",
        "name": "qh2-ssd",
        "extra_specs": {"RESKEY:availability_zones": "melbourne-qh2"},
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

    def one_flavor(request, fid):
        flavor = next((f for f in FLAVORS if f["id"] == fid), None)
        if flavor is None:
            return httpx.Response(404, json={})
        return httpx.Response(200, json={"flavor": flavor})

    upstream.get(
        url__regex=rf"^{NOVA}/flavors/(?P<fid>(?!detail$)[^/]+)$"
    ).mock(side_effect=one_flavor)
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
    upstream.get(f"{CINDER}/types").mock(
        return_value=httpx.Response(200, json={"volume_types": VOLUME_TYPES})
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


async def test_instance_detail_and_resize_flavors(user, nova):
    detail = (await user.get("/api/compute/instances/srv-1")).json()
    assert detail["id"] == "srv-1"
    assert detail["availability_zone"] == "melbourne-qh2"
    flavors = (
        await user.get("/api/compute/instances/srv-1/resize-flavors")
    ).json()
    # The current flavour and the hidden p3.* family are excluded; a
    # reservation flavour stays a resize target, as in Horizon.
    assert [f["id"] for f in flavors["items"]] == ["res-1"]


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
    assert flavors["f-small"]["is_reservation"] is False
    assert flavors["res-1"]["is_reservation"] is True
    assert flavors["res-1"]["reservation_id"] == "res-1"
    # Classes: table order, counts without the reservation flavour.
    assert [(c["id"], c["count"]) for c in body["flavor_classes"]] == [
        ("standard-v3", 1),
        ("preemptible", 1),
    ]
    assert body["flavor_classes"][0]["title"] == "Balanced (m3)"
    assert body["flavor_classes"][0]["description"]
    assert [t["name"] for t in body["volume_types"]] == [
        "qh2-ssd",
        "standard",
    ]
    assert body["volume_types"][0]["zones"] == ["melbourne-qh2"]
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
    nova.get(f"{CINDER}/types").mock(
        return_value=httpx.Response(503, text="down")
    )
    body = (await user.get("/api/compute/launch-options")).json()
    assert body["networks"] is None
    assert body["errors"]["networks"]["error"] == "upstream_error"
    assert body["flavors"]
    assert body["flavor_classes"]
    assert body["volume_types"] is None
    assert body["has_zoned_types"] is False
    assert body["errors"]["volume_types"]["error"] == "upstream_error"


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
    assert server["availability_zone"] == "melbourne-qh2"

    # No zone (Horizon's "Any Availability Zone"): the scheduler chooses.
    for zone in (None, ""):
        any_zone = await user.post(
            "/api/compute/instances",
            json={
                "name": "anywhere",
                "source": {"type": "image", "id": "img-ubuntu"},
                "flavor_id": "f-small",
                "availability_zone": zone,
                "networks": [CLASSIC],
            },
            headers=csrf_headers(user),
        )
        assert any_zone.status_code == 202, any_zone.text
        server = json.loads(route.calls.last.request.content)["server"]
        assert "availability_zone" not in server

    # A reservation flavour ignores the chosen zone.
    reserved = await user.post(
        "/api/compute/instances",
        json={
            "name": "reserved",
            "source": {"type": "image", "id": "img-ubuntu"},
            "flavor_id": "res-1",
            "availability_zone": "melbourne-qh2",
            "networks": [CLASSIC],
        },
        headers=csrf_headers(user),
    )
    assert reserved.status_code == 202, reserved.text
    server = json.loads(route.calls.last.request.content)["server"]
    assert "availability_zone" not in server
    assert server["flavorRef"] == "res-1"

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

    # Horizon's "Create New Volume": the image becomes a new volume.
    image_to_volume = await user.post(
        "/api/compute/instances",
        json={
            "name": "on-new-volume",
            "source": {"type": "image", "id": "img-ubuntu"},
            "flavor_id": "f-small",
            "availability_zone": "melbourne-qh2",
            "networks": ["net-b", CLASSIC],
            "create_volume": True,
            "volume_size_gb": 20,
            "volume_type": "qh2-ssd",
            "delete_volume_on_termination": True,
        },
        headers=csrf_headers(user),
    )
    assert image_to_volume.status_code == 202, image_to_volume.text
    server = json.loads(route.calls.last.request.content)["server"]
    assert server["imageRef"] == ""
    assert server["block_device_mapping_v2"] == [
        {
            "boot_index": 0,
            "uuid": "img-ubuntu",
            "source_type": "image",
            "destination_type": "volume",
            "volume_size": 20,
            "delete_on_termination": True,
            "volume_type": "qh2-ssd",
        }
    ]
    # The chosen network order is the interface order.
    assert server["networks"] == [{"uuid": "net-b"}, {"uuid": CLASSIC}]

    default_type = await user.post(
        "/api/compute/instances",
        json={
            "name": "on-new-volume",
            "source": {"type": "snapshot", "id": "img-snap"},
            "flavor_id": "f-small",
            "availability_zone": "melbourne-qh2",
            "networks": [CLASSIC],
            "create_volume": True,
            "volume_size_gb": 30,
        },
        headers=csrf_headers(user),
    )
    assert default_type.status_code == 202
    mapping = json.loads(route.calls.last.request.content)["server"][
        "block_device_mapping_v2"
    ][0]
    assert mapping["source_type"] == "image"
    assert "volume_type" not in mapping
    assert mapping["delete_on_termination"] is False

    for bad in (
        # No size for the new volume.
        {"source": {"type": "image", "id": "img-ubuntu"}},
        # A volume source cannot also create a volume.
        {
            "source": {"type": "volume", "id": "vol-boot"},
            "volume_size_gb": 20,
        },
    ):
        rejected = await user.post(
            "/api/compute/instances",
            json={
                "name": "x",
                "flavor_id": "f-small",
                "availability_zone": "melbourne-qh2",
                "networks": [CLASSIC],
                "create_volume": True,
                **bad,
            },
            headers=csrf_headers(user),
        )
        assert rejected.status_code == 422, rejected.text

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


async def test_list_instances_typed_paging(user, nova):
    servers = nova.get(f"{NOVA}/servers/detail").mock(
        return_value=httpx.Response(200, json={"servers": [SERVER]})
    )
    response = await user.get(
        "/api/compute/instances?limit=1&marker=srv-0"
        "&sort_key=display_name&sort_dir=asc&bogus=1"
    )
    assert response.status_code == 200, response.text
    assert response.json()["next_marker"] == "srv-1"
    assert response.json()["has_more"] is True
    params = servers.calls.last.request.url.params
    assert params["limit"] == "1" and params["marker"] == "srv-0"
    assert params["sort_key"] == "display_name"
    assert params["sort_dir"] == "asc"
    assert "bogus" not in params
    # An unknown sort key is dropped rather than passed to nova.
    await user.get("/api/compute/instances?sort_key=password")
    assert "sort_key" not in servers.calls.last.request.url.params
    for query in ("limit=abc", "limit=0", "limit=1001", "sort_dir=up"):
        bad = await user.get(f"/api/compute/instances?{query}")
        assert bad.status_code == 422, query


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
    nova.get(f"{NOVA}/servers/srv-1").mock(
        return_value=httpx.Response(200, json={"server": {}})
    )
    missing = await user.get("/api/compute/instances/srv-1")
    assert missing.status_code == 404


async def test_path_ids_are_percent_encoded(user, nova):
    seen = []

    def answer(request):
        seen.append(request.url.raw_path)
        return httpx.Response(200, json={"server": SERVER})

    nova.get(url__regex=r"^https://nova\.test/v2\.1/servers/srv%3F").mock(
        side_effect=answer
    )
    response = await user.get(
        "/api/compute/instances/srv%3Fall_tenants=1/resize-flavors"
    )
    assert response.status_code == 200, response.text
    assert seen == [b"/v2.1/servers/srv%3Fall_tenants%3D1"]


@pytest.mark.parametrize(
    "action, body, expected",
    [
        (
            "rebuild",
            {"image_id": "img-ubuntu", "name": "again", "password": "pw"},
            {
                "rebuild": {
                    "imageRef": "img-ubuntu",
                    "name": "again",
                    "adminPass": "pw",
                }
            },
        ),
        ("rescue", None, {"rescue": None}),
        (
            "rescue",
            {"rescue_image_id": "img-ubuntu"},
            {"rescue": {"rescue_image_ref": "img-ubuntu"}},
        ),
        ("unrescue", None, {"unrescue": None}),
        (
            "remove-security-group",
            {"security_group": "web"},
            {"removeSecurityGroup": {"name": "web"}},
        ),
    ],
)
async def test_server_actions(user, nova, action, body, expected):
    route = nova.post(f"{NOVA}/servers/srv-1/action").mock(
        return_value=httpx.Response(202)
    )
    response = await user.post(
        f"/api/compute/instances/srv-1/actions/{action}",
        json=body,
        headers=csrf_headers(user),
    )
    assert response.status_code == 202, response.text
    assert json.loads(route.calls.last.request.content) == expected


@pytest.mark.parametrize(
    "action, body, method, url, expected",
    [
        (
            "attach-volume",
            {"volume_id": "vol-2"},
            "POST",
            f"{NOVA}/servers/srv-1/os-volume_attachments",
            {"volumeAttachment": {"volumeId": "vol-2"}},
        ),
        (
            "detach-volume",
            {"volume_id": "vol-1"},
            "DELETE",
            f"{NOVA}/servers/srv-1/os-volume_attachments/vol-1",
            None,
        ),
        (
            "attach-interface",
            {"network_id": "net-1"},
            "POST",
            f"{NOVA}/servers/srv-1/os-interface",
            {"interfaceAttachment": {"net_id": "net-1"}},
        ),
        (
            "attach-interface",
            {"port_id": "port-1"},
            "POST",
            f"{NOVA}/servers/srv-1/os-interface",
            {"interfaceAttachment": {"port_id": "port-1"}},
        ),
        (
            "detach-interface",
            {"port_id": "port-1"},
            "DELETE",
            f"{NOVA}/servers/srv-1/os-interface/port-1",
            None,
        ),
        (
            "associate-fip",
            {"floating_ip_id": "fip-1", "port_id": "port-1"},
            "PUT",
            f"{NEUTRON}/v2.0/floatingips/fip-1",
            {"floatingip": {"port_id": "port-1"}},
        ),
        (
            "disassociate-fip",
            {"floating_ip_id": "fip-1"},
            "PUT",
            f"{NEUTRON}/v2.0/floatingips/fip-1",
            {"floatingip": {"port_id": None}},
        ),
        (
            "update-metadata",
            {"metadata": {"role": "web"}},
            "PUT",
            f"{NOVA}/servers/srv-1/metadata",
            {"metadata": {"role": "web"}},
        ),
    ],
)
async def test_attachment_actions(
    user, nova, action, body, method, url, expected
):
    route = nova.route(method=method, url=url).mock(
        return_value=httpx.Response(
            200,
            json={
                "volumeAttachment": {},
                "interfaceAttachment": {},
                "floatingip": {},
                "metadata": {},
            },
        )
    )
    response = await user.post(
        f"/api/compute/instances/srv-1/actions/{action}",
        json=body,
        headers=csrf_headers(user),
    )
    assert response.status_code == 202, response.text
    assert route.called
    if expected is not None:
        assert json.loads(route.calls.last.request.content) == expected


@pytest.mark.parametrize(
    "action",
    [
        "rebuild",
        "snapshot",
        "add-security-group",
        "attach-volume",
        "detach-volume",
        "attach-interface",
        "detach-interface",
        "associate-fip",
        "disassociate-fip",
        "update-metadata",
    ],
)
async def test_actions_require_their_fields(user, nova, action):
    response = await user.post(
        f"/api/compute/instances/srv-1/actions/{action}",
        json={},
        headers=csrf_headers(user),
    )
    assert response.status_code == 400, response.text


async def test_update_and_delete_instance(user, nova):
    updated = nova.put(f"{NOVA}/servers/srv-1").mock(
        return_value=httpx.Response(
            200, json={"server": {**SERVER, "name": "web-2"}}
        )
    )
    response = await user.patch(
        "/api/compute/instances/srv-1",
        json={"name": "web-2"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "web-2"
    assert json.loads(updated.calls.last.request.content) == {
        "server": {"name": "web-2"}
    }
    empty = await user.patch(
        "/api/compute/instances/srv-1", json={}, headers=csrf_headers(user)
    )
    assert empty.status_code == 400
    gone = nova.delete(f"{NOVA}/servers/srv-1").mock(
        return_value=httpx.Response(204)
    )
    response = await user.delete(
        "/api/compute/instances/srv-1", headers=csrf_headers(user)
    )
    assert response.status_code == 204 and gone.called


@pytest.mark.parametrize(
    "kind, protocol",
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


async def test_console_rejects_unknown_type(user, nova):
    response = await user.post(
        "/api/compute/instances/srv-1/console",
        json={"type": "rdp-html5"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 422


async def test_console_output_and_password(user, nova):
    output = nova.post(f"{NOVA}/servers/srv-1/action").mock(
        return_value=httpx.Response(200, json={"output": "boot log"})
    )
    response = await user.get(
        "/api/compute/instances/srv-1/console-output?length=50"
    )
    assert response.json() == {"output": "boot log"}
    assert json.loads(output.calls.last.request.content) == {
        "os-getConsoleOutput": {"length": 50}
    }
    nova.get(f"{NOVA}/servers/srv-1/os-server-password").mock(
        return_value=httpx.Response(200, json={"password": "ENCRYPTED"})
    )
    response = await user.get("/api/compute/instances/srv-1/password")
    assert response.json() == {"encrypted_password": "ENCRYPTED"}


async def test_instance_volumes_ports_and_action_log(user, nova):
    nova.get(f"{NOVA}/servers/srv-1/os-volume_attachments").mock(
        return_value=httpx.Response(
            200,
            json={
                "volumeAttachments": [
                    {"volumeId": "vol-1", "device": "/dev/vdb"},
                    {"volumeId": "vol-gone", "device": "/dev/vdc"},
                ]
            },
        )
    )
    nova.get(f"{CINDER}/volumes/vol-1").mock(
        return_value=httpx.Response(
            200,
            json={
                "volume": {
                    "id": "vol-1",
                    "name": "data",
                    "size": 20,
                    "status": "in-use",
                    "bootable": "false",
                }
            },
        )
    )
    nova.get(f"{CINDER}/volumes/vol-gone").mock(
        return_value=httpx.Response(
            404, json={"itemNotFound": {"message": "gone"}}
        )
    )
    volumes = (await user.get("/api/compute/instances/srv-1/volumes")).json()
    assert volumes["items"][0]["name"] == "data"
    assert volumes["items"][0]["size_gb"] == 20
    assert volumes["items"][1]["name"] == "vol-gone"

    nova.get(f"{NEUTRON}/v2.0/ports").mock(
        return_value=httpx.Response(
            200,
            json={
                "ports": [
                    {
                        "id": "port-1",
                        "network_id": "net-1",
                        "status": "ACTIVE",
                        "fixed_ips": [
                            {"ip_address": "10.0.0.5", "subnet_id": "sub-1"}
                        ],
                    }
                ]
            },
        )
    )
    nova.get(f"{NEUTRON}/v2.0/floatingips").mock(
        return_value=httpx.Response(
            200,
            json={
                "floatingips": [
                    {
                        "id": "fip-1",
                        "port_id": "port-1",
                        "floating_ip_address": "203.0.113.9",
                    },
                    {"id": "fip-2", "port_id": None},
                ]
            },
        )
    )
    ports = (await user.get("/api/compute/instances/srv-1/ports")).json()
    assert ports["items"][0]["fixed_ips"] == [
        {"ip": "10.0.0.5", "subnet_id": "sub-1"}
    ]
    assert ports["items"][0]["floating_ips"] == [
        {"id": "fip-1", "address": "203.0.113.9"}
    ]

    nova.get(f"{NOVA}/servers/srv-1/os-instance-actions").mock(
        return_value=httpx.Response(
            200,
            json={
                "instanceActions": [
                    {
                        "action": "create",
                        "request_id": "req-1",
                        "user_id": "u1",
                        "start_time": "2026-10-01T00:00:00Z",
                        "message": None,
                    }
                ]
            },
        )
    )
    log = (await user.get("/api/compute/instances/srv-1/action-log")).json()
    assert log["items"][0]["action"] == "create"


async def test_flavors_are_cached_per_project(user, nova, redis):
    flavors = nova.get(f"{NOVA}/flavors/detail").mock(
        return_value=httpx.Response(200, json={"flavors": FLAVORS})
    )
    first = (await user.get("/api/compute/flavors")).json()
    assert {f["id"] for f in first["items"]} == {"f-small", "f-pre", "res-1"}
    assert flavors.call_count == 1
    keys = await redis.keys("*flavors*")
    assert keys and all(":p:p1:" in k for k in keys)
    switched = await user.post(
        "/api/session/project",
        json={"project_id": "p2"},
        headers=csrf_headers(user),
    )
    assert switched.status_code == 200, switched.text
    assert (await user.get("/api/compute/flavors")).status_code == 200
    # Project p2 fetched its own list rather than reusing p1's.
    assert flavors.call_count == 2
    assert any(":p:p2:" in k for k in await redis.keys("*flavors*"))


async def test_image_detail_patch_and_delete(user, nova, redis):
    mine = IMAGES["private"][0]
    nova.get(f"{GLANCE}/v2/images/img-mine").mock(
        return_value=httpx.Response(200, json=mine)
    )
    detail = (await user.get("/api/compute/images/img-mine")).json()
    assert detail["is_owner"] is True

    # Warm the listings, including the global public and community ones.
    await user.get("/api/compute/images")
    assert await redis.keys("*:g:images:public")
    assert await redis.keys("*:g:images:community")
    patched = nova.patch(f"{GLANCE}/v2/images/img-mine").mock(
        return_value=httpx.Response(
            200, json={**mine, "visibility": "public", "os_distro": "x"}
        )
    )
    response = await user.patch(
        "/api/compute/images/img-mine",
        json={
            "name": "mine",
            "visibility": "public",
            "properties": {"os_distro": "x", "old": None},
        },
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    request = patched.calls.last.request
    assert request.headers["content-type"] == (
        "application/openstack-images-v2.1-json-patch"
    )
    assert json.loads(request.content) == [
        {"op": "replace", "path": "/name", "value": "mine"},
        {"op": "replace", "path": "/visibility", "value": "public"},
        {"op": "add", "path": "/os_distro", "value": "x"},
        {"op": "remove", "path": "/old"},
    ]
    # The image left the project listing and joined the public one.
    assert not await redis.keys("*:g:images:public")
    assert not await redis.keys("*:g:images:community")
    assert not await redis.keys("*:p:p1:images:private")

    for key in ("owner", "locations", "id"):
        refused = await user.patch(
            "/api/compute/images/img-mine",
            json={"properties": {key: "x"}},
            headers=csrf_headers(user),
        )
        assert refused.status_code == 400, key
    empty = await user.patch(
        "/api/compute/images/img-mine", json={}, headers=csrf_headers(user)
    )
    assert empty.status_code == 400

    gone = nova.delete(f"{GLANCE}/v2/images/img-mine").mock(
        return_value=httpx.Response(204)
    )
    response = await user.delete(
        "/api/compute/images/img-mine", headers=csrf_headers(user)
    )
    assert response.status_code == 204 and gone.called


async def test_image_create_validates_properties_and_imports(
    user, nova, redis
):
    created = nova.post(f"{GLANCE}/v2/images").mock(
        return_value=httpx.Response(
            201,
            json={
                "id": "img-pub",
                "name": "pub",
                "status": "queued",
                "visibility": "community",
                "owner": "p1",
            },
        )
    )
    imported = nova.post(f"{GLANCE}/v2/images/img-pub/import").mock(
        return_value=httpx.Response(202)
    )
    refused = await user.post(
        "/api/compute/images",
        json={"name": "pub", "properties": {"owner": "p9"}},
        headers=csrf_headers(user),
    )
    assert refused.status_code == 400
    assert not created.called
    await user.get("/api/compute/images")
    assert await redis.keys("*:g:images:community")
    response = await user.post(
        "/api/compute/images",
        json={
            "name": "pub",
            "visibility": "community",
            "properties": {"os_distro": "ubuntu"},
            "source_url": "https://images.test/pub.qcow2",
        },
        headers=csrf_headers(user),
    )
    assert response.status_code == 201, response.text
    assert json.loads(created.calls.last.request.content)["os_distro"] == (
        "ubuntu"
    )
    assert json.loads(imported.calls.last.request.content) == {
        "method": {
            "name": "web-download",
            "uri": "https://images.test/pub.qcow2",
        }
    }
    assert not await redis.keys("*:g:images:community")


async def test_keypair_detail_and_delete(user, nova):
    nova.get(f"{NOVA}/os-keypairs/sam").mock(
        return_value=httpx.Response(
            200,
            json={
                "keypair": {
                    "name": "sam",
                    "type": "ssh",
                    "fingerprint": "aa:bb",
                    "public_key": "ssh-ed25519 AAA",
                    "created_at": "2026-10-01T00:00:00Z",
                }
            },
        )
    )
    detail = (await user.get("/api/compute/keypairs/sam")).json()
    assert detail["public_key"] == "ssh-ed25519 AAA"
    assert "private_key" not in detail
    gone = nova.delete(f"{NOVA}/os-keypairs/sam").mock(
        return_value=httpx.Response(202)
    )
    response = await user.delete(
        "/api/compute/keypairs/sam", headers=csrf_headers(user)
    )
    assert response.status_code == 204 and gone.called


async def test_server_groups(user, nova):
    created = nova.post(f"{NOVA}/os-server-groups").mock(
        return_value=httpx.Response(
            200,
            json={
                "server_group": {
                    "id": "grp-1",
                    "name": "spread",
                    "policy": "anti-affinity",
                    "members": [],
                }
            },
        )
    )
    response = await user.post(
        "/api/compute/server-groups",
        json={"name": "spread"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 201, response.text
    assert response.json()["id"] == "grp-1"
    assert json.loads(created.calls.last.request.content) == {
        "server_group": {"name": "spread", "policy": "anti-affinity"}
    }
    listing = (await user.get("/api/compute/server-groups")).json()
    assert listing == {"items": []}
    gone = nova.delete(f"{NOVA}/os-server-groups/grp-1").mock(
        return_value=httpx.Response(204)
    )
    response = await user.delete(
        "/api/compute/server-groups/grp-1", headers=csrf_headers(user)
    )
    assert response.status_code == 204 and gone.called


async def test_reference_data_routes(user, nova):
    zones = (await user.get("/api/compute/availability-zones")).json()
    assert zones["items"] == [{"name": "melbourne-qh2", "available": True}]
    limits = (await user.get("/api/compute/limits")).json()
    assert limits["maxTotalInstances"] == 10
