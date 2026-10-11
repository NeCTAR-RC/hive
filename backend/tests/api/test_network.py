import json

import httpx
import pytest

from tests.conftest import csrf_headers, login

NOVA = "https://nova.test/v2.1"
NEUTRON = "https://neutron.test"
CLASSIC = "00000000-0000-0000-0000-000000000000"

CLASSIC_NET = {
    "id": CLASSIC,
    "name": "Classic Provider",
    "shared": True,
    "router:external": True,
    "subnets": [],
    "status": "ACTIVE",
}
PRIVATE = {
    "id": "net-priv",
    "name": "private",
    "project_id": "p1",
    "shared": False,
    "router:external": False,
    "status": "ACTIVE",
    "admin_state_up": True,
    "mtu": 1500,
    "subnets": ["sub-priv"],
}
FLOATING = {
    "id": "net-float",
    "name": "ardctest-artm",
    "project_id": "admin",
    "shared": False,
    "router:external": True,
    "status": "ACTIVE",
    "subnets": ["sub-float"],
    "tags": ["nectar:floating"],
}
PROVIDER = {
    "id": "net-prov",
    "name": "provider",
    "project_id": "admin",
    "shared": True,
    "router:external": True,
    "subnets": ["sub-prov"],
}
SUBNETS = [
    {
        "id": "sub-priv",
        "name": "private",
        "network_id": "net-priv",
        "cidr": "192.168.1.0/24",
        "ip_version": 4,
        "gateway_ip": "192.168.1.1",
        "enable_dhcp": True,
        "allocation_pools": [{"start": "192.168.1.20", "end": "192.168.1.200"}],
        "dns_nameservers": ["1.1.1.1", "1.0.0.1"],
        "host_routes": [],
    },
    {
        "id": "sub-float",
        "name": "floating",
        "network_id": "net-float",
        "cidr": "203.0.113.0/24",
        "ip_version": 4,
        "gateway_ip": "203.0.113.1",
    },
]
ROUTER = {
    "id": "r-1",
    "name": "default",
    "project_id": "p1",
    "status": "ACTIVE",
    "admin_state_up": True,
    "external_gateway_info": {
        "network_id": "net-float",
        "enable_snat": True,
        "external_fixed_ips": [
            {"subnet_id": "sub-float", "ip_address": "203.0.113.50"}
        ],
    },
    "routes": [{"destination": "10.9.0.0/16", "nexthop": "192.168.1.9"}],
}
ROUTER_PORTS = [
    {
        "id": "rp-gw",
        "network_id": "net-float",
        "device_id": "r-1",
        "device_owner": "network:router_gateway",
        "status": "ACTIVE",
        "fixed_ips": [{"subnet_id": "sub-float", "ip_address": "203.0.113.50"}],
    },
    {
        "id": "rp-int",
        "network_id": "net-priv",
        "device_id": "r-1",
        "device_owner": "network:router_interface",
        "status": "ACTIVE",
        "fixed_ips": [{"subnet_id": "sub-priv", "ip_address": "192.168.1.1"}],
    },
]
VM_PORT = {
    "id": "vp-1",
    "name": "",
    "network_id": "net-priv",
    "project_id": "p1",
    "device_id": "srv-1",
    "device_owner": "compute:nova",
    "admin_state_up": True,
    "status": "ACTIVE",
    "mac_address": "fa:16:3e:00:00:01",
    "fixed_ips": [{"subnet_id": "sub-priv", "ip_address": "192.168.1.20"}],
    "security_groups": ["sg-1"],
    "port_security_enabled": True,
}
FREE_PORT = {
    "id": "vp-free",
    "name": "spare",
    "network_id": "net-priv",
    "project_id": "p1",
    "device_id": "",
    "device_owner": "",
    "admin_state_up": True,
    "status": "DOWN",
    "fixed_ips": [{"subnet_id": "sub-priv", "ip_address": "192.168.1.21"}],
}
PROJECT_PORTS = [ROUTER_PORTS[1], VM_PORT, FREE_PORT]
FIPS = [
    {
        "id": "fip-1",
        "floating_ip_address": "203.0.113.10",
        "floating_network_id": "net-float",
        "fixed_ip_address": "192.168.1.20",
        "port_id": "vp-1",
        "router_id": "r-1",
        "status": "ACTIVE",
        "description": "",
        "port_forwardings": [],
    },
    {
        "id": "fip-2",
        "floating_ip_address": "203.0.113.11",
        "floating_network_id": "net-float",
        "fixed_ip_address": None,
        "port_id": None,
        "router_id": None,
        "status": "DOWN",
        "port_forwardings": [{"id": "pf-1"}],
    },
]
SERVERS = [{"id": "srv-1", "name": "web"}]
QUOTA = {
    "network": {"used": 1, "limit": 5, "reserved": 0},
    "subnet": {"used": 1, "limit": 10, "reserved": 0},
    "router": {"used": 1, "limit": 2, "reserved": 0},
    "floatingip": {"used": 2, "limit": 2, "reserved": 0},
    "port": {"used": 3, "limit": -1, "reserved": 0},
}
EXTENSIONS = [
    "router",
    "extraroute",
    "ext-gw-mode",
    "dns-integration",
    "network_availability_zone",
    "router_availability_zone",
    "port-security",
]


def catalog_entry(stype, name, url):
    return {
        "type": stype,
        "name": name,
        "endpoints": [
            {"interface": "public", "region": "Melbourne", "url": url}
        ],
    }


@pytest.fixture
def network_catalog(upstream):
    from tests import conftest

    original = conftest.catalog

    def richer():
        return original() + [catalog_entry("network", "neutron", NEUTRON)]

    conftest.catalog = richer
    conftest.mock_keystone(upstream)
    yield
    conftest.catalog = original


def answer_networks(request):
    params = request.url.params
    if params.get("shared") == "true":
        items = [PROVIDER]
    elif params.get("router:external") == "true":
        assert params.get("tags-any") == "nectar:floating"
        items = [FLOATING]
    else:
        items = [PRIVATE]
    return httpx.Response(200, json={"networks": items})


def answer_ports(request):
    params = request.url.params
    if params.get("device_id") == "r-1":
        items = ROUTER_PORTS
    elif params.get("network_id") == "net-priv":
        items = PROJECT_PORTS
    else:
        items = PROJECT_PORTS
    return httpx.Response(200, json={"ports": items})


@pytest.fixture
def neutron(upstream, network_catalog):
    upstream.get(f"{NEUTRON}/v2.0/extensions").mock(
        return_value=httpx.Response(
            200, json={"extensions": [{"alias": a} for a in EXTENSIONS]}
        )
    )
    upstream.get(f"{NEUTRON}/v2.0/networks/{CLASSIC}").mock(
        return_value=httpx.Response(200, json={"network": CLASSIC_NET})
    )
    upstream.get(f"{NEUTRON}/v2.0/networks/net-priv").mock(
        return_value=httpx.Response(200, json={"network": PRIVATE})
    )
    upstream.get(f"{NEUTRON}/v2.0/networks").mock(side_effect=answer_networks)
    upstream.get(f"{NEUTRON}/v2.0/subnets").mock(
        side_effect=lambda request: httpx.Response(
            200,
            json={
                "subnets": [
                    s
                    for s in SUBNETS
                    if not request.url.params.get("network_id")
                    or s["network_id"] == request.url.params["network_id"]
                ]
            },
        )
    )
    upstream.get(f"{NEUTRON}/v2.0/subnets/sub-priv").mock(
        return_value=httpx.Response(200, json={"subnet": SUBNETS[0]})
    )
    upstream.get(f"{NEUTRON}/v2.0/ports").mock(side_effect=answer_ports)
    upstream.get(f"{NEUTRON}/v2.0/ports/vp-1").mock(
        return_value=httpx.Response(200, json={"port": VM_PORT})
    )
    upstream.get(f"{NEUTRON}/v2.0/ports/rp-gw").mock(
        return_value=httpx.Response(200, json={"port": ROUTER_PORTS[0]})
    )
    upstream.get(f"{NEUTRON}/v2.0/ports/rp-int").mock(
        return_value=httpx.Response(200, json={"port": ROUTER_PORTS[1]})
    )
    upstream.get(f"{NEUTRON}/v2.0/routers").mock(
        return_value=httpx.Response(200, json={"routers": [ROUTER]})
    )
    upstream.get(f"{NEUTRON}/v2.0/routers/r-1").mock(
        return_value=httpx.Response(200, json={"router": ROUTER})
    )
    upstream.get(f"{NEUTRON}/v2.0/floatingips").mock(
        return_value=httpx.Response(200, json={"floatingips": FIPS})
    )
    upstream.get(f"{NEUTRON}/v2.0/floatingips/fip-2").mock(
        return_value=httpx.Response(200, json={"floatingip": FIPS[1]})
    )
    upstream.get(f"{NEUTRON}/v2.0/quotas/p1/details.json").mock(
        return_value=httpx.Response(200, json={"quota": QUOTA})
    )
    upstream.get(f"{NEUTRON}/v2.0/availability_zones").mock(
        return_value=httpx.Response(
            200,
            json={
                "availability_zones": [
                    {"name": "nova", "resource": "network", "state": "available"},
                    {"name": "nova", "resource": "router", "state": "available"},
                    {"name": "old", "resource": "router", "state": "unavailable"},
                ]
            },
        )
    )
    upstream.get(f"{NEUTRON}/v2.0/security-groups").mock(
        return_value=httpx.Response(200, json={"security_groups": []})
    )
    upstream.get(f"{NOVA}/servers").mock(
        return_value=httpx.Response(200, json={"servers": SERVERS})
    )
    upstream.get(f"{NOVA}/servers/detail").mock(
        return_value=httpx.Response(
            200,
            json={"servers": [{**SERVERS[0], "status": "ACTIVE"}]},
        )
    )
    return upstream


@pytest.fixture
async def user(neutron, client):
    assert (await login(client)).status_code == 303
    return client


# --- reference data -------------------------------------------------------


async def test_options_and_quota(user):
    response = await user.get("/api/network/options")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["extensions"]["port_forwarding"] is False
    assert body["extensions"]["extraroute"] is True
    assert body["availability_zones"] == {"network": ["nova"], "router": ["nova"]}
    assert body["default_dns_nameservers"] == ["1.1.1.1", "1.0.0.1"]
    assert body["enable_ipv6"] is False
    assert body["subnetpools"] == []
    assert body["floating_networks"] == [
        {"id": "net-float", "name": "ardctest-artm"}
    ]
    assert body["quota"]["network"] == {"used": 1, "limit": 5, "reserved": 0}
    assert body["errors"] == {}

    quota = (await user.get("/api/network/quota")).json()
    assert quota["port"]["limit"] == -1
    assert "security_group" not in quota


# --- networks -------------------------------------------------------------


async def test_panel_listing_adds_floating_networks(user):
    response = await user.get("/api/network/networks?external=true")
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert [n["id"] for n in items] == [CLASSIC, "net-prov", "net-priv", "net-float"]
    private = items[2]
    assert private["is_project"] is True
    assert private["subnets"][0]["cidr"] == "192.168.1.0/24"
    assert items[3]["is_external"] is True and items[3]["is_project"] is False
    # Without the flag the floating network stays out, as before.
    plain = (await user.get("/api/network/networks")).json()["items"]
    assert [n["id"] for n in plain] == [CLASSIC, "net-prov", "net-priv"]


async def test_network_detail_has_subnets_and_ports(user):
    response = await user.get("/api/network/networks/net-priv")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "private"
    assert body["subnets"][0]["allocation_pools"] == [
        {"start": "192.168.1.20", "end": "192.168.1.200"}
    ]
    ports = {p["id"]: p for p in body["ports"]}
    assert ports["vp-1"]["device_type"] == "compute"
    assert ports["vp-1"]["network_name"] == "private"
    assert ports["vp-free"]["fixed_ips"] == [
        {"ip_address": "192.168.1.21", "subnet_id": "sub-priv"}
    ]


async def test_create_network_with_subnet(user, neutron):
    created = neutron.post(f"{NEUTRON}/v2.0/networks").mock(
        return_value=httpx.Response(
            201, json={"network": {**PRIVATE, "id": "net-new", "name": "new"}}
        )
    )
    subnet = neutron.post(f"{NEUTRON}/v2.0/subnets").mock(
        return_value=httpx.Response(
            201,
            json={
                "subnet": {
                    **SUBNETS[0],
                    "id": "sub-new",
                    "network_id": "net-new",
                    "cidr": "10.0.0.0/24",
                }
            },
        )
    )
    response = await user.post(
        "/api/network/networks",
        json={
            "name": "new",
            "subnet": {"name": "new-subnet", "cidr": "10.0.0.0/24"},
        },
        headers=csrf_headers(user),
    )
    assert response.status_code == 201, response.text
    assert response.json()["subnets"][0]["cidr"] == "10.0.0.0/24"
    assert json.loads(created.calls.last.request.content) == {
        "network": {"name": "new", "admin_state_up": True}
    }
    sent = json.loads(subnet.calls.last.request.content)["subnet"]
    assert sent == {
        "name": "new-subnet",
        "cidr": "10.0.0.0/24",
        "ip_version": 4,
        "enable_dhcp": True,
        "dns_nameservers": ["1.1.1.1", "1.0.0.1"],
        "network_id": "net-new",
    }


async def test_failed_subnet_removes_the_new_network(user, neutron):
    neutron.post(f"{NEUTRON}/v2.0/networks").mock(
        return_value=httpx.Response(
            201, json={"network": {**PRIVATE, "id": "net-new"}}
        )
    )
    neutron.post(f"{NEUTRON}/v2.0/subnets").mock(
        return_value=httpx.Response(
            409,
            json={"NeutronError": {"message": "Quota exceeded for subnet"}},
        )
    )
    removed = neutron.delete(f"{NEUTRON}/v2.0/networks/net-new").mock(
        return_value=httpx.Response(204)
    )
    response = await user.post(
        "/api/network/networks",
        json={"name": "new", "subnet": {"cidr": "10.0.0.0/24"}},
        headers=csrf_headers(user),
    )
    assert response.status_code == 409
    assert removed.called


async def test_create_network_rejects_bad_subnet_before_calling_neutron(
    user, neutron
):
    created = neutron.post(f"{NEUTRON}/v2.0/networks").mock(
        return_value=httpx.Response(201, json={"network": PRIVATE})
    )
    response = await user.post(
        "/api/network/networks",
        json={"name": "new", "subnet": {"cidr": "10.0.0.1/32"}},
        headers=csrf_headers(user),
    )
    assert response.status_code == 400
    assert "too small" in response.json()["message"]
    assert not created.called


async def test_subnet_and_port_updates(user, neutron):
    updated = neutron.put(f"{NEUTRON}/v2.0/subnets/sub-priv").mock(
        return_value=httpx.Response(
            200, json={"subnet": {**SUBNETS[0], "gateway_ip": None}}
        )
    )
    response = await user.patch(
        "/api/network/subnets/sub-priv",
        json={"no_gateway": True, "dns_nameservers": []},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    assert json.loads(updated.calls.last.request.content) == {
        "subnet": {"gateway_ip": None, "dns_nameservers": []}
    }

    port = neutron.put(f"{NEUTRON}/v2.0/ports/vp-1").mock(
        return_value=httpx.Response(200, json={"port": {**VM_PORT, "name": "x"}})
    )
    # An unchanged port security flag is dropped; turning it off clears groups.
    response = await user.patch(
        "/api/network/ports/vp-1",
        json={"name": "x", "port_security_enabled": True},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    assert json.loads(port.calls.last.request.content) == {"port": {"name": "x"}}
    response = await user.patch(
        "/api/network/ports/vp-1",
        json={"port_security_enabled": False},
        headers=csrf_headers(user),
    )
    assert json.loads(port.calls.last.request.content) == {
        "port": {"port_security_enabled": False, "security_groups": []}
    }

    created = neutron.post(f"{NEUTRON}/v2.0/ports").mock(
        return_value=httpx.Response(201, json={"port": FREE_PORT})
    )
    response = await user.post(
        "/api/network/ports",
        json={
            "network_id": "net-priv",
            "name": "spare",
            "subnet_id": "sub-priv",
            "security_groups": ["sg-1"],
        },
        headers=csrf_headers(user),
    )
    assert response.status_code == 201, response.text
    assert json.loads(created.calls.last.request.content)["port"] == {
        "network_id": "net-priv",
        "name": "spare",
        "admin_state_up": True,
        "fixed_ips": [{"subnet_id": "sub-priv"}],
        "security_groups": ["sg-1"],
    }


# --- routers ---------------------------------------------------------------


async def test_routers_list_and_detail(user):
    response = await user.get("/api/network/routers")
    assert response.status_code == 200, response.text
    router = response.json()["items"][0]
    assert router["external_gateway"]["network_name"] == "ardctest-artm"
    assert router["external_gateway"]["fixed_ips"][0]["ip_address"] == (
        "203.0.113.50"
    )
    assert router["routes"] == [
        {"destination": "10.9.0.0/16", "nexthop": "192.168.1.9"}
    ]

    detail = (await user.get("/api/network/routers/r-1")).json()
    kinds = {p["id"]: p["kind"] for p in detail["interfaces"]}
    assert kinds == {"rp-gw": "gateway", "rp-int": "interface"}
    names = {p["id"]: p["network_name"] for p in detail["interfaces"]}
    assert names == {"rp-gw": "ardctest-artm", "rp-int": "private"}


async def test_create_router_with_floating_gateway_only(user, neutron):
    created = neutron.post(f"{NEUTRON}/v2.0/routers").mock(
        return_value=httpx.Response(201, json={"router": ROUTER})
    )
    response = await user.post(
        "/api/network/routers",
        json={"name": "default", "external_network_id": "net-prov"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 400
    assert "gateway" in response.json()["message"]
    assert not created.called

    response = await user.post(
        "/api/network/routers",
        json={"name": "default", "external_network_id": "net-float"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 201, response.text
    assert json.loads(created.calls.last.request.content) == {
        "router": {
            "name": "default",
            "admin_state_up": True,
            "external_gateway_info": {"network_id": "net-float"},
        }
    }


async def test_router_gateway_interfaces_and_routes(user, neutron):
    updated = neutron.put(f"{NEUTRON}/v2.0/routers/r-1").mock(
        return_value=httpx.Response(200, json={"router": ROUTER})
    )
    response = await user.put(
        "/api/network/routers/r-1/gateway",
        json={"network_id": "net-float"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    assert json.loads(updated.calls.last.request.content) == {
        "router": {"external_gateway_info": {"network_id": "net-float"}}
    }
    response = await user.delete(
        "/api/network/routers/r-1/gateway", headers=csrf_headers(user)
    )
    assert response.status_code == 200
    assert json.loads(updated.calls.last.request.content) == {
        "router": {"external_gateway_info": {}}
    }

    # Interface candidates: the project's subnets with a gateway that are
    # not attached yet; sub-priv is already on the router.
    candidates = (
        await user.get("/api/network/routers/r-1/interface-candidates")
    ).json()["items"]
    assert candidates == []

    response = await user.post(
        "/api/network/routers/r-1/interfaces",
        json={"subnet_id": "sub-float"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 400
    assert "one of your networks" in response.json()["message"]

    # Removing the gateway port clears the gateway; another port detaches.
    detached = neutron.put(
        f"{NEUTRON}/v2.0/routers/r-1/remove_router_interface"
    ).mock(return_value=httpx.Response(200, json={}))
    response = await user.delete(
        "/api/network/routers/r-1/interfaces/rp-gw", headers=csrf_headers(user)
    )
    assert response.status_code == 204
    assert json.loads(updated.calls.last.request.content) == {
        "router": {"external_gateway_info": {}}
    }
    response = await user.delete(
        "/api/network/routers/r-1/interfaces/rp-int",
        headers=csrf_headers(user),
    )
    assert response.status_code == 204
    assert json.loads(detached.calls.last.request.content) == {
        "port_id": "rp-int"
    }

    response = await user.put(
        "/api/network/routers/r-1/routes",
        json={"routes": [{"destination": "10.5.0.0/16", "nexthop": "192.168.1.5"}]},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    assert json.loads(updated.calls.last.request.content) == {
        "router": {
            "routes": [{"destination": "10.5.0.0/16", "nexthop": "192.168.1.5"}]
        }
    }

    # Delete detaches the interfaces first.
    deleted = neutron.delete(f"{NEUTRON}/v2.0/routers/r-1").mock(
        return_value=httpx.Response(204)
    )
    neutron.get(f"{NEUTRON}/v2.0/ports").mock(
        side_effect=lambda request: httpx.Response(
            200,
            json={
                "ports": [ROUTER_PORTS[1]]
                if request.url.params.get("device_owner")
                else PROJECT_PORTS
            },
        )
    )
    response = await user.delete(
        "/api/network/routers/r-1", headers=csrf_headers(user)
    )
    assert response.status_code == 204
    assert detached.calls.last.request.url.path.endswith(
        "/remove_router_interface"
    )
    assert deleted.called


async def test_add_interface_with_an_address_creates_a_port(user, neutron):
    free_subnet = {
        "id": "sub-two",
        "name": "two",
        "network_id": "net-priv",
        "cidr": "192.168.2.0/24",
        "ip_version": 4,
        "gateway_ip": "192.168.2.1",
    }
    neutron.get(f"{NEUTRON}/v2.0/subnets").mock(
        return_value=httpx.Response(200, json={"subnets": [*SUBNETS, free_subnet]})
    )
    created = neutron.post(f"{NEUTRON}/v2.0/ports").mock(
        return_value=httpx.Response(
            201,
            json={
                "port": {
                    "id": "p-new",
                    "fixed_ips": [
                        {"subnet_id": "sub-two", "ip_address": "192.168.2.254"}
                    ],
                }
            },
        )
    )
    attached = neutron.put(
        f"{NEUTRON}/v2.0/routers/r-1/add_router_interface"
    ).mock(
        return_value=httpx.Response(
            200, json={"port_id": "p-new", "subnet_id": "sub-two"}
        )
    )
    response = await user.post(
        "/api/network/routers/r-1/interfaces",
        json={"subnet_id": "sub-two", "ip_address": "192.168.2.254"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 202, response.text
    assert response.json() == {
        "status": "accepted",
        "port_id": "p-new",
        "subnet_id": "sub-two",
        "ip_address": "192.168.2.254",
    }
    assert json.loads(created.calls.last.request.content)["port"] == {
        "network_id": "net-priv",
        "fixed_ips": [{"subnet_id": "sub-two", "ip_address": "192.168.2.254"}],
    }
    assert json.loads(attached.calls.last.request.content) == {
        "port_id": "p-new"
    }

    # When the attach fails the port is deleted again.
    attached.mock(
        return_value=httpx.Response(
            409, json={"NeutronError": {"message": "Router already has a port"}}
        )
    )
    removed = neutron.delete(f"{NEUTRON}/v2.0/ports/p-new").mock(
        return_value=httpx.Response(204)
    )
    response = await user.post(
        "/api/network/routers/r-1/interfaces",
        json={"subnet_id": "sub-two", "ip_address": "192.168.2.254"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 409
    assert removed.called


# --- floating IPs ---------------------------------------------------------


async def test_floating_ips_list_targets_and_actions(user, neutron):
    response = await user.get("/api/network/floating-ips")
    assert response.status_code == 200, response.text
    items = {f["id"]: f for f in response.json()["items"]}
    assert items["fip-1"]["instance_name"] == "web"
    assert items["fip-1"]["instance_type"] == "compute"
    assert items["fip-1"]["pool_name"] == "ardctest-artm"
    assert items["fip-2"]["instance_id"] is None
    assert items["fip-2"]["port_forwarding_count"] == 1

    targets = (await user.get("/api/network/floating-ips/targets")).json()["items"]
    # vp-1 (web) and the free port sit on the subnet behind the gateway
    # router; the router's own port is never a target.
    assert [t["id"] for t in targets] == [
        "vp-free_192.168.1.21",
        "vp-1_192.168.1.20",
    ]
    assert targets[1]["name"] == "web 192.168.1.20"
    mine = (
        await user.get("/api/network/floating-ips/targets?instance_id=srv-1")
    ).json()["items"]
    assert [t["port_id"] for t in mine] == ["vp-1"]

    # Allocation is refused at the quota, before neutron is asked.
    created = neutron.post(f"{NEUTRON}/v2.0/floatingips").mock(
        return_value=httpx.Response(201, json={"floatingip": FIPS[1]})
    )
    response = await user.post(
        "/api/network/floating-ips",
        json={"floating_network_id": "net-float"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 409
    assert response.json()["error"] == "quota_exceeded"
    assert not created.called

    neutron.get(f"{NEUTRON}/v2.0/quotas/p1/details.json").mock(
        return_value=httpx.Response(
            200,
            json={"quota": {**QUOTA, "floatingip": {"used": 1, "limit": 2}}},
        )
    )
    response = await user.post(
        "/api/network/floating-ips",
        json={"floating_network_id": "net-float", "description": "web"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 201, response.text
    assert json.loads(created.calls.last.request.content) == {
        "floatingip": {"floating_network_id": "net-float", "description": "web"}
    }

    updated = neutron.put(f"{NEUTRON}/v2.0/floatingips/fip-2").mock(
        return_value=httpx.Response(200, json={"floatingip": FIPS[1]})
    )
    response = await user.post(
        "/api/network/floating-ips/fip-2/associate",
        json={"port_id": "vp-free", "fixed_ip_address": "192.168.1.21"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    assert json.loads(updated.calls.last.request.content) == {
        "floatingip": {"port_id": "vp-free", "fixed_ip_address": "192.168.1.21"}
    }
    response = await user.post(
        "/api/network/floating-ips/fip-2/disassociate",
        headers=csrf_headers(user),
    )
    assert response.status_code == 200
    assert json.loads(updated.calls.last.request.content) == {
        "floatingip": {"port_id": None}
    }

    released = neutron.delete(f"{NEUTRON}/v2.0/floatingips/fip-2").mock(
        return_value=httpx.Response(204)
    )
    response = await user.delete(
        "/api/network/floating-ips/fip-2", headers=csrf_headers(user)
    )
    assert response.status_code == 204
    assert released.called


async def test_port_forwarding_and_trunks_need_their_extensions(user):
    response = await user.get("/api/network/port-forwardings")
    assert response.status_code == 404
    assert "port forwarding" in response.json()["message"]
    response = await user.get("/api/network/trunks")
    assert response.status_code == 404
    assert "trunking" in response.json()["message"]


async def test_port_forwardings_and_trunks(user, neutron):
    # With the extensions present the rules and trunks come back shaped.
    neutron.get(f"{NEUTRON}/v2.0/extensions").mock(
        return_value=httpx.Response(
            200,
            json={
                "extensions": [
                    {"alias": a}
                    for a in [*EXTENSIONS, "floating-ip-port-forwarding", "trunk"]
                ]
            },
        )
    )
    neutron.get(f"{NEUTRON}/v2.0/floatingips/fip-2/port_forwardings").mock(
        return_value=httpx.Response(
            200,
            json={
                "port_forwardings": [
                    {
                        "id": "pf-1",
                        "protocol": "tcp",
                        "internal_port": 22,
                        "external_port_range": "2200:2201",
                        "internal_ip_address": "192.168.1.21",
                        "internal_port_id": "vp-free",
                    }
                ]
            },
        )
    )
    response = await user.get("/api/network/port-forwardings")
    assert response.status_code == 200, response.text
    assert response.json()["items"] == [
        {
            "id": "pf-1",
            "floating_ip_id": "fip-2",
            "floating_ip_address": "203.0.113.11",
            "protocol": "tcp",
            "external_port": "2200:2201",
            "internal_port": "22",
            "internal_ip_address": "192.168.1.21",
            "internal_port_id": "vp-free",
            "description": "",
        }
    ]
    created = neutron.post(
        f"{NEUTRON}/v2.0/floatingips/fip-2/port_forwardings"
    ).mock(return_value=httpx.Response(201, json={"port_forwarding": {"id": "pf-2"}}))
    response = await user.post(
        "/api/network/floating-ips/fip-2/port-forwardings",
        json={
            "protocol": "udp",
            "internal_port_id": "vp-free",
            "internal_ip_address": "192.168.1.21",
            "internal_port": "53",
            "external_port": "5353",
        },
        headers=csrf_headers(user),
    )
    assert response.status_code == 201, response.text
    assert json.loads(created.calls.last.request.content) == {
        "port_forwarding": {
            "protocol": "udp",
            "internal_port": 53,
            "external_port": 5353,
            "internal_ip_address": "192.168.1.21",
            "internal_port_id": "vp-free",
        }
    }

    neutron.get(f"{NEUTRON}/v2.0/trunks").mock(
        return_value=httpx.Response(
            200,
            json={
                "trunks": [
                    {
                        "id": "t-1",
                        "name": "trunk",
                        "port_id": "vp-1",
                        "status": "ACTIVE",
                        "admin_state_up": True,
                        "sub_ports": [
                            {
                                "port_id": "vp-free",
                                "segmentation_type": "vlan",
                                "segmentation_id": 100,
                            }
                        ],
                    }
                ]
            },
        )
    )
    trunks = (await user.get("/api/network/trunks")).json()["items"]
    assert trunks[0]["port_name"] == "vp-1"
    assert trunks[0]["sub_ports"][0]["port_name"] == "spare"
    assert trunks[0]["subport_count"] == 1
    options = (await user.get("/api/network/trunks/options")).json()
    # Both ports are in the trunk already; nothing is left to offer.
    assert options == {"parents": [], "subports": []}

    created = neutron.post(f"{NEUTRON}/v2.0/trunks").mock(
        return_value=httpx.Response(201, json={"trunk": {"id": "t-2"}})
    )
    response = await user.post(
        "/api/network/trunks",
        json={
            "name": "t",
            "port_id": "vp-free",
            "sub_ports": [{"port_id": "vp-1", "segmentation_type": "vlan"}],
        },
        headers=csrf_headers(user),
    )
    assert response.status_code == 400
    assert "segmentation id" in response.json()["message"]
    response = await user.post(
        "/api/network/trunks",
        json={
            "name": "t",
            "port_id": "vp-free",
            "sub_ports": [
                {"port_id": "vp-1", "segmentation_type": "vlan", "segmentation_id": 7}
            ],
        },
        headers=csrf_headers(user),
    )
    assert response.status_code == 201, response.text
    assert json.loads(created.calls.last.request.content)["trunk"]["sub_ports"] == [
        {"port_id": "vp-1", "segmentation_type": "vlan", "segmentation_id": 7}
    ]


# --- topology --------------------------------------------------------------


async def test_topology_lists_networks_routers_ports_and_servers(user):
    response = await user.get("/api/network/topology")
    assert response.status_code == 200, response.text
    body = response.json()
    # External networks first, each group by name.
    assert [n["id"] for n in body["networks"]] == [
        "net-float",
        CLASSIC,
        "net-prov",
        "net-priv",
    ]
    assert body["routers"] == [
        {
            "id": "r-1",
            "name": "default",
            "status": "ACTIVE",
            "admin_state_up": True,
            "external_network_id": "net-float",
        }
    ]
    assert body["servers"] == [{"id": "srv-1", "name": "web", "status": "ACTIVE"}]
    ports = {p["id"]: p for p in body["ports"]}
    # The gateway port is invisible to users, so a synthetic one stands in.
    assert ports["gateway-r-1"]["network_id"] == "net-float"
    assert ports["gateway-r-1"]["device_owner"] == "network:router_gateway"
    assert ports["vp-1"]["device_id"] == "srv-1"


# --- the simpler routes -----------------------------------------------------


async def test_subnet_port_and_network_crud_routes(user, neutron):
    assert (await user.get("/api/network/extensions")).json()["extraroute"] is True

    subnet = (await user.get("/api/network/subnets/sub-priv")).json()
    assert subnet["cidr"] == "192.168.1.0/24"
    assert subnet["dns_nameservers"] == ["1.1.1.1", "1.0.0.1"]

    created = neutron.post(f"{NEUTRON}/v2.0/subnets").mock(
        return_value=httpx.Response(201, json={"subnet": SUBNETS[0]})
    )
    response = await user.post(
        "/api/network/subnets",
        json={
            "network_id": "net-priv",
            "cidr": "192.168.2.0/24",
            "gateway_ip": "192.168.2.254",
            "dns_nameservers": [],
        },
        headers=csrf_headers(user),
    )
    assert response.status_code == 201, response.text
    assert json.loads(created.calls.last.request.content)["subnet"] == {
        "cidr": "192.168.2.0/24",
        "ip_version": 4,
        "gateway_ip": "192.168.2.254",
        "enable_dhcp": True,
        "dns_nameservers": [],
        "network_id": "net-priv",
    }

    port = (await user.get("/api/network/ports/vp-1")).json()
    assert port["network_name"] == "private"
    assert port["device_type"] == "compute"

    created = neutron.post(f"{NEUTRON}/v2.0/ports").mock(
        return_value=httpx.Response(201, json={"port": FREE_PORT})
    )
    response = await user.post(
        "/api/network/ports",
        json={
            "network_id": "net-priv",
            "fixed_ip": "192.168.1.40",
            "mac_address": "fa:16:3e:00:00:40",
            "device_id": "dev",
            "device_owner": "custom",
            "port_security_enabled": False,
            "security_groups": ["sg-1"],
        },
        headers=csrf_headers(user),
    )
    assert response.status_code == 201, response.text
    sent = json.loads(created.calls.last.request.content)["port"]
    assert sent["fixed_ips"] == [{"ip_address": "192.168.1.40"}]
    assert sent["mac_address"] == "fa:16:3e:00:00:40"
    assert sent["device_id"] == "dev" and sent["device_owner"] == "custom"
    # Port security off clears the groups whatever was chosen.
    assert sent["port_security_enabled"] is False
    assert sent["security_groups"] == []

    updated = neutron.put(f"{NEUTRON}/v2.0/networks/net-priv").mock(
        return_value=httpx.Response(200, json={"network": {**PRIVATE, "name": "x"}})
    )
    response = await user.patch(
        "/api/network/networks/net-priv",
        json={"name": "x", "admin_state_up": False},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "x"
    assert json.loads(updated.calls.last.request.content) == {
        "network": {"name": "x", "admin_state_up": False}
    }
    for path in (
        "/api/network/networks/net-priv",
        "/api/network/routers/r-1",
        "/api/network/trunks/t-1",
    ):
        response = await user.patch(path, json={}, headers=csrf_headers(user))
        assert response.status_code == 400, path

    created = neutron.post(f"{NEUTRON}/v2.0/networks").mock(
        return_value=httpx.Response(201, json={"network": PRIVATE})
    )
    response = await user.post(
        "/api/network/networks",
        json={"name": "zoned", "mtu": 1400, "availability_zone_hints": ["nova"]},
        headers=csrf_headers(user),
    )
    assert response.status_code == 201, response.text
    assert json.loads(created.calls.last.request.content)["network"] == {
        "name": "zoned",
        "admin_state_up": True,
        "mtu": 1400,
        "availability_zone_hints": ["nova"],
    }

    for path, route in (
        ("networks/net-priv", "networks/net-priv"),
        ("subnets/sub-priv", "subnets/sub-priv"),
        ("ports/vp-free", "ports/vp-free"),
    ):
        deleted = neutron.delete(f"{NEUTRON}/v2.0/{route}").mock(
            return_value=httpx.Response(204)
        )
        response = await user.delete(
            f"/api/network/{path}", headers=csrf_headers(user)
        )
        assert response.status_code == 204, path
        assert deleted.called

    response = await user.get("/api/network/networks?purpose=bogus")
    assert response.status_code == 400
    response = await user.get("/api/network/ports?purpose=router")
    assert response.status_code == 400
    ports = (await user.get("/api/network/ports")).json()["items"]
    # Only the free port on a bootable network can be attached to.
    assert [p["id"] for p in ports] == ["vp-free"]


async def test_router_create_with_zone_hints_and_interface_by_subnet(
    user, neutron
):
    created = neutron.post(f"{NEUTRON}/v2.0/routers").mock(
        return_value=httpx.Response(201, json={"router": ROUTER})
    )
    response = await user.post(
        "/api/network/routers",
        json={"name": "zoned", "availability_zone_hints": ["nova"]},
        headers=csrf_headers(user),
    )
    assert response.status_code == 201, response.text
    assert json.loads(created.calls.last.request.content)["router"] == {
        "name": "zoned",
        "admin_state_up": True,
        "availability_zone_hints": ["nova"],
    }
    updated = neutron.put(f"{NEUTRON}/v2.0/routers/r-1").mock(
        return_value=httpx.Response(200, json={"router": {**ROUTER, "name": "y"}})
    )
    response = await user.patch(
        "/api/network/routers/r-1",
        json={"name": "y"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200 and response.json()["name"] == "y"
    assert json.loads(updated.calls.last.request.content) == {
        "router": {"name": "y"}
    }

    # Without an address the interface is added by subnet and the new
    # port's address is read back for the message.
    free_subnet = {
        "id": "sub-two",
        "name": "two",
        "network_id": "net-priv",
        "cidr": "192.168.2.0/24",
        "ip_version": 4,
        "gateway_ip": "192.168.2.1",
    }
    neutron.get(f"{NEUTRON}/v2.0/subnets").mock(
        return_value=httpx.Response(
            200, json={"subnets": [*SUBNETS, free_subnet]}
        )
    )
    attached = neutron.put(
        f"{NEUTRON}/v2.0/routers/r-1/add_router_interface"
    ).mock(
        return_value=httpx.Response(
            200, json={"port_id": "p-new", "subnet_id": "sub-two"}
        )
    )
    neutron.get(f"{NEUTRON}/v2.0/ports/p-new").mock(
        return_value=httpx.Response(
            200,
            json={
                "port": {
                    "id": "p-new",
                    "fixed_ips": [
                        {"subnet_id": "sub-two", "ip_address": "192.168.2.1"}
                    ],
                }
            },
        )
    )
    response = await user.post(
        "/api/network/routers/r-1/interfaces",
        json={"subnet_id": "sub-two"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 202, response.text
    assert response.json()["ip_address"] == "192.168.2.1"
    assert json.loads(attached.calls.last.request.content) == {
        "subnet_id": "sub-two"
    }


async def test_floating_ip_detail_and_forwarding_rule_changes(user, neutron):
    neutron.get(f"{NEUTRON}/v2.0/floatingips/fip-1").mock(
        return_value=httpx.Response(200, json={"floatingip": FIPS[0]})
    )
    fip = (await user.get("/api/network/floating-ips/fip-1")).json()
    assert fip["instance_name"] == "web"
    assert fip["pool_name"] == "ardctest-artm"
    # A free IP has no port to look up.
    fip = (await user.get("/api/network/floating-ips/fip-2")).json()
    assert fip["instance_id"] is None

    neutron.get(f"{NEUTRON}/v2.0/extensions").mock(
        return_value=httpx.Response(
            200,
            json={
                "extensions": [
                    {"alias": a}
                    for a in [*EXTENSIONS, "floating-ip-port-forwarding", "trunk"]
                ]
            },
        )
    )
    neutron.get(f"{NEUTRON}/v2.0/floatingips/fip-2/port_forwardings").mock(
        return_value=httpx.Response(
            200,
            json={
                "port_forwardings": [
                    {"id": "pf-1", "protocol": "tcp", "internal_port": 22}
                ]
            },
        )
    )
    rules = (
        await user.get("/api/network/port-forwardings?floating_ip_id=fip-2")
    ).json()["items"]
    assert rules[0]["floating_ip_address"] == "203.0.113.11"

    updated = neutron.put(
        f"{NEUTRON}/v2.0/floatingips/fip-2/port_forwardings/pf-1"
    ).mock(return_value=httpx.Response(200, json={"port_forwarding": {"id": "pf-1"}}))
    response = await user.patch(
        "/api/network/floating-ips/fip-2/port-forwardings/pf-1",
        json={"external_port": "2300", "description": "moved"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    assert json.loads(updated.calls.last.request.content) == {
        "port_forwarding": {"external_port": 2300, "description": "moved"}
    }
    response = await user.patch(
        "/api/network/floating-ips/fip-2/port-forwardings/pf-1",
        json={},
        headers=csrf_headers(user),
    )
    assert response.status_code == 400
    deleted = neutron.delete(
        f"{NEUTRON}/v2.0/floatingips/fip-2/port_forwardings/pf-1"
    ).mock(return_value=httpx.Response(204))
    response = await user.delete(
        "/api/network/floating-ips/fip-2/port-forwardings/pf-1",
        headers=csrf_headers(user),
    )
    assert response.status_code == 204
    assert deleted.called

    trunk = {
        "id": "t-1",
        "name": "trunk",
        "port_id": "vp-1",
        "sub_ports": [],
    }
    neutron.get(f"{NEUTRON}/v2.0/trunks/t-1").mock(
        return_value=httpx.Response(200, json={"trunk": trunk})
    )
    detail = (await user.get("/api/network/trunks/t-1")).json()
    assert detail["port_name"] == "vp-1"
    updated = neutron.put(f"{NEUTRON}/v2.0/trunks/t-1").mock(
        return_value=httpx.Response(200, json={"trunk": {**trunk, "name": "t"}})
    )
    response = await user.patch(
        "/api/network/trunks/t-1",
        json={"name": "t", "admin_state_up": False},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200 and response.json()["name"] == "t"
    added = neutron.put(f"{NEUTRON}/v2.0/trunks/t-1/add_subports").mock(
        return_value=httpx.Response(200, json=trunk)
    )
    response = await user.post(
        "/api/network/trunks/t-1/subports",
        json={"sub_ports": [{"port_id": "vp-free", "segmentation_type": "inherit"}]},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    assert json.loads(added.calls.last.request.content) == {
        "sub_ports": [{"port_id": "vp-free", "segmentation_type": "inherit"}]
    }
    removed = neutron.put(f"{NEUTRON}/v2.0/trunks/t-1/remove_subports").mock(
        return_value=httpx.Response(200, json=trunk)
    )
    response = await user.post(
        "/api/network/trunks/t-1/subports/remove",
        json={"port_ids": ["vp-free"]},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200
    assert json.loads(removed.calls.last.request.content) == {
        "sub_ports": [{"port_id": "vp-free"}]
    }
    deleted = neutron.delete(f"{NEUTRON}/v2.0/trunks/t-1").mock(
        return_value=httpx.Response(204)
    )
    response = await user.delete(
        "/api/network/trunks/t-1", headers=csrf_headers(user)
    )
    assert response.status_code == 204
    assert deleted.called


async def test_topology_and_options_tolerate_upstream_failures(user, neutron):
    neutron.get(f"{NOVA}/servers/detail").mock(
        return_value=httpx.Response(500, json={"error": "boom"})
    )
    neutron.get(f"{NOVA}/servers").mock(
        return_value=httpx.Response(500, json={"error": "boom"})
    )
    neutron.get(f"{NEUTRON}/v2.0/routers").mock(
        return_value=httpx.Response(503, text="down")
    )
    body = (await user.get("/api/network/topology")).json()
    assert body["servers"] == [] and body["routers"] == []
    assert body["networks"]

    neutron.get(f"{NEUTRON}/v2.0/quotas/p1/details.json").mock(
        return_value=httpx.Response(403, json={"NeutronError": {"message": "no"}})
    )
    options = (await user.get("/api/network/options")).json()
    assert options["quota"] is None
    assert options["errors"]["quota"]["error"] == "forbidden"
    # The floating IP targets fall back to "no instance names" quietly.
    neutron.get(f"{NEUTRON}/v2.0/routers").mock(
        return_value=httpx.Response(200, json={"routers": [ROUTER]})
    )
    targets = (await user.get("/api/network/floating-ips/targets")).json()
    assert [t["name"] for t in targets["items"]] == [
        "spare 192.168.1.21",
        "vp-1 192.168.1.20",
    ]
    # Allocation goes ahead when the quota cannot be read.
    created = neutron.post(f"{NEUTRON}/v2.0/floatingips").mock(
        return_value=httpx.Response(201, json={"floatingip": FIPS[1]})
    )
    response = await user.post(
        "/api/network/floating-ips",
        json={"floating_network_id": "net-float"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 201, response.text
    assert created.called


async def test_security_group_routes(user, neutron):
    group = {"id": "sg-9", "name": "web", "description": "", "security_group_rules": []}
    created = neutron.post(f"{NEUTRON}/v2.0/security-groups").mock(
        return_value=httpx.Response(201, json={"security_group": group})
    )
    response = await user.post(
        "/api/network/security-groups",
        json={"name": "web", "description": "web servers"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 201, response.text
    assert json.loads(created.calls.last.request.content) == {
        "security_group": {"name": "web", "description": "web servers"}
    }
    updated = neutron.put(f"{NEUTRON}/v2.0/security-groups/sg-9").mock(
        return_value=httpx.Response(200, json={"security_group": group})
    )
    response = await user.patch(
        "/api/network/security-groups/sg-9",
        json={"description": "renamed"},
        headers=csrf_headers(user),
    )
    assert response.status_code == 200, response.text
    assert json.loads(updated.calls.last.request.content) == {
        "security_group": {"description": "renamed"}
    }
    response = await user.patch(
        "/api/network/security-groups/sg-9", json={}, headers=csrf_headers(user)
    )
    assert response.status_code == 400
    rule_gone = neutron.delete(f"{NEUTRON}/v2.0/security-group-rules/r-1").mock(
        return_value=httpx.Response(204)
    )
    response = await user.delete(
        "/api/network/security-groups/sg-9/rules/r-1", headers=csrf_headers(user)
    )
    assert response.status_code == 204 and rule_gone.called
    gone = neutron.delete(f"{NEUTRON}/v2.0/security-groups/sg-9").mock(
        return_value=httpx.Response(204)
    )
    response = await user.delete(
        "/api/network/security-groups/sg-9", headers=csrf_headers(user)
    )
    assert response.status_code == 204 and gone.called
