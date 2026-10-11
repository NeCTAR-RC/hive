"""Load balancers: list, wizard creation, tree, children and floating IPs."""

import asyncio
import json

import httpx
import pytest

from tests.conftest import csrf_headers, OCTAVIA

NEUTRON = "https://neutron.test"
NOVA = "https://nova.test/v2.1"
LB = f"{OCTAVIA}/v2/lbaas"

LOAD_BALANCER = {
    "id": "lb-1",
    "name": "web",
    "provisioning_status": "ACTIVE",
    "operating_status": "ONLINE",
    "admin_state_up": True,
    "vip_address": "192.168.1.10",
    "vip_port_id": "port-vip",
    "vip_subnet_id": "subnet-1",
    "vip_network_id": "net-priv",
    "provider": "ovn",
    "listeners": [{"id": "l-1"}],
    "pools": [{"id": "p-1"}],
}
LISTENER = {
    "id": "l-1",
    "name": "http",
    "protocol": "HTTP",
    "protocol_port": 80,
    "provisioning_status": "ACTIVE",
    "operating_status": "ONLINE",
    "admin_state_up": True,
    "default_pool_id": "p-1",
    "loadbalancers": [{"id": "lb-1"}],
    "l7policies": [{"id": "pol-1"}],
}
POOL = {
    "id": "p-1",
    "name": "web-pool",
    "protocol": "HTTP",
    "lb_algorithm": "ROUND_ROBIN",
    "provisioning_status": "ACTIVE",
    "operating_status": "ONLINE",
    "admin_state_up": True,
    "healthmonitor_id": "hm-1",
    "listeners": [{"id": "l-1"}],
    "loadbalancers": [{"id": "lb-1"}],
    "members": [{"id": "m-1"}],
}
MEMBER = {
    "id": "m-1",
    "address": "192.168.1.20",
    "protocol_port": 80,
    "subnet_id": "subnet-1",
    "weight": 1,
    "provisioning_status": "ACTIVE",
    "operating_status": "ONLINE",
    "admin_state_up": True,
}
MONITOR = {
    "id": "hm-1",
    "type": "HTTP",
    "delay": 5,
    "timeout": 5,
    "max_retries": 3,
    "http_method": "GET",
    "url_path": "/",
    "expected_codes": "200",
    "pools": [{"id": "p-1"}],
    "provisioning_status": "ACTIVE",
}
POLICY = {
    "id": "pol-1",
    "action": "REJECT",
    "listener_id": "l-1",
    "position": 1,
    "rules": [{"id": "r-1"}],
    "provisioning_status": "ACTIVE",
}
PRIVATE_NET = {
    "id": "net-priv",
    "name": "private",
    "shared": False,
    "router:external": False,
    "subnets": ["subnet-1"],
    "project_id": "p1",
    "status": "ACTIVE",
}
SUBNET = {
    "id": "subnet-1",
    "name": "private-subnet",
    "cidr": "192.168.1.0/24",
    "network_id": "net-priv",
    "ip_version": 4,
    "gateway_ip": "192.168.1.1",
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
def lb_catalog(upstream):
    from tests import conftest

    original = conftest.catalog

    def richer():
        return original() + [catalog_entry("network", "neutron", NEUTRON)]

    conftest.catalog = richer
    conftest.mock_keystone(upstream)
    yield
    conftest.catalog = original


def mock_octavia(upstream, lb=None):
    lb = lb or LOAD_BALANCER
    upstream.get(f"{LB}/loadbalancers").mock(
        return_value=httpx.Response(200, json={"loadbalancers": [lb]})
    )
    upstream.get(f"{LB}/loadbalancers/lb-1").mock(
        return_value=httpx.Response(200, json={"loadbalancer": lb})
    )
    upstream.get(f"{LB}/listeners").mock(
        return_value=httpx.Response(200, json={"listeners": [LISTENER]})
    )
    upstream.get(f"{LB}/listeners/l-1").mock(
        return_value=httpx.Response(200, json={"listener": LISTENER})
    )
    upstream.get(f"{LB}/pools").mock(
        return_value=httpx.Response(200, json={"pools": [POOL]})
    )
    upstream.get(f"{LB}/pools/p-1").mock(
        return_value=httpx.Response(200, json={"pool": POOL})
    )
    upstream.get(f"{LB}/pools/p-1/members").mock(
        return_value=httpx.Response(200, json={"members": [MEMBER]})
    )
    upstream.get(f"{LB}/healthmonitors").mock(
        return_value=httpx.Response(200, json={"healthmonitors": [MONITOR]})
    )
    upstream.get(f"{LB}/healthmonitors/hm-1").mock(
        return_value=httpx.Response(200, json={"healthmonitor": MONITOR})
    )
    upstream.get(f"{LB}/l7policies").mock(
        return_value=httpx.Response(200, json={"l7policies": [POLICY]})
    )
    upstream.get(f"{LB}/l7policies/pol-1").mock(
        return_value=httpx.Response(200, json={"l7policy": POLICY})
    )
    upstream.get(f"{LB}/l7policies/pol-1/rules").mock(
        return_value=httpx.Response(
            200,
            json={
                "rules": [
                    {
                        "id": "r-1",
                        "type": "PATH",
                        "compare_type": "STARTS_WITH",
                        "value": "/old",
                    }
                ]
            },
        )
    )
    upstream.get(f"{NEUTRON}/v2.0/floatingips").mock(
        return_value=httpx.Response(
            200,
            json={
                "floatingips": [
                    {
                        "id": "fip-1",
                        "floating_ip_address": "203.0.113.5",
                        "port_id": "port-vip",
                    }
                ]
            },
        )
    )


def mock_options(upstream):
    def networks(request):
        params = request.url.params
        if (
            params.get("shared") == "true"
            or params.get("router:external") == "true"
        ):
            return httpx.Response(200, json={"networks": []})
        return httpx.Response(200, json={"networks": [PRIVATE_NET]})

    upstream.get(f"{NEUTRON}/v2.0/networks").mock(side_effect=networks)
    upstream.get(
        f"{NEUTRON}/v2.0/networks/00000000-0000-0000-0000-000000000000"
    ).mock(
        return_value=httpx.Response(
            404, json={"NeutronError": {"message": "no"}}
        )
    )
    upstream.get(f"{NEUTRON}/v2.0/subnets").mock(
        return_value=httpx.Response(200, json={"subnets": [SUBNET]})
    )
    upstream.get(f"{NEUTRON}/v2.0/ports").mock(
        return_value=httpx.Response(
            200,
            json={
                "ports": [
                    {
                        "id": "port-1",
                        "device_id": "i-1",
                        "fixed_ips": [
                            {
                                "subnet_id": "subnet-1",
                                "ip_address": "192.168.1.20",
                            }
                        ],
                    }
                ]
            },
        )
    )
    upstream.get(f"{NOVA}/servers").mock(
        return_value=httpx.Response(
            200, json={"servers": [{"id": "i-1", "name": "web-1"}]}
        )
    )
    upstream.get(f"{LB}/flavors").mock(
        return_value=httpx.Response(
            200,
            json={
                "flavors": [{"id": "f-1", "name": "default", "enabled": True}]
            },
        )
    )
    upstream.get(f"{LB}/availabilityzones").mock(
        return_value=httpx.Response(
            200,
            json={
                "availability_zones": [
                    {"name": "ardctest-artm", "enabled": True},
                    {"name": "off", "enabled": False},
                ]
            },
        )
    )
    upstream.get(f"{LB}/quotas/p1").mock(
        return_value=httpx.Response(200, json={"quota": {"load_balancer": 22}})
    )


async def test_list_and_tree(lb_catalog, logged_in, upstream):
    mock_octavia(upstream)
    body = (await logged_in.get("/api/load-balancers")).json()
    item = body["items"][0]
    assert item["floating_ip"] == {"id": "fip-1", "address": "203.0.113.5"}
    assert item["can_delete"] is True and item["is_transitional"] is False

    tree = (await logged_in.get("/api/load-balancers/lb-1/tree")).json()
    assert tree["listeners"][0]["loadbalancer_id"] == "lb-1"
    assert tree["pools"][0]["member_rows"][0]["address"] == "192.168.1.20"
    assert tree["monitors"][0]["id"] == "hm-1"
    assert tree["l7policies"][0]["id"] == "pol-1"
    policy = (
        await logged_in.get("/api/load-balancers/l7policies/pol-1")
    ).json()
    assert policy["rule_rows"][0]["value"] == "/old"


async def test_options(lb_catalog, logged_in, upstream):
    mock_octavia(upstream)
    mock_options(upstream)
    body = (await logged_in.get("/api/load-balancers/options")).json()
    assert body["subnets"] == [
        {
            "id": "subnet-1",
            "name": "private-subnet",
            "cidr": "192.168.1.0/24",
            "network_id": "net-priv",
            "network_name": "private",
            "ip_version": 4,
        }
    ]
    assert body["availability_zones"] == [
        {"name": "ardctest-artm", "description": None}
    ]
    assert body["instances"] == [
        {
            "id": "i-1",
            "name": "web-1",
            "status": None,
            "addresses": [
                {"address": "192.168.1.20", "subnet_id": "subnet-1"}
            ],
        }
    ]
    assert body["quota"]["load_balancer"] == 22


async def test_create_runs_the_chain(lb_catalog, logged_in, upstream):
    mock_octavia(upstream)
    created = upstream.post(f"{LB}/loadbalancers").mock(
        return_value=httpx.Response(
            201,
            json={
                "loadbalancer": {
                    **LOAD_BALANCER,
                    "provisioning_status": "PENDING_CREATE",
                }
            },
        )
    )
    listener = upstream.post(f"{LB}/listeners").mock(
        return_value=httpx.Response(201, json={"listener": LISTENER})
    )
    pool = upstream.post(f"{LB}/pools").mock(
        return_value=httpx.Response(201, json={"pool": POOL})
    )
    member = upstream.post(f"{LB}/pools/p-1/members").mock(
        return_value=httpx.Response(201, json={"member": MEMBER})
    )
    monitor = upstream.post(f"{LB}/healthmonitors").mock(
        return_value=httpx.Response(201, json={"healthmonitor": MONITOR})
    )
    response = await logged_in.post(
        "/api/load-balancers",
        json={
            "name": "web",
            "vip_subnet_id": "subnet-1",
            "listener": {
                "protocol": "TERMINATED_HTTPS",
                "protocol_port": 443,
                "default_tls_container_ref": "https://barbican/x",
                "insert_headers": {"X-Forwarded-For": True},
            },
            "pool": {
                "lb_algorithm": "ROUND_ROBIN",
                "session_persistence": {"type": "SOURCE_IP"},
            },
            "members": [
                {
                    "address": "192.168.1.20",
                    "protocol_port": 80,
                    "subnet_id": "subnet-1",
                }
            ],
            "monitor": {"type": "HTTP", "url_path": "/healthz"},
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202, response.text
    assert response.json()["provisioning_status"] == "PENDING_CREATE"
    sent = json.loads(created.calls.last.request.content)["loadbalancer"]
    assert sent == {
        "vip_subnet_id": "subnet-1",
        "admin_state_up": True,
        "project_id": "p1",
        "name": "web",
    }
    state = None
    for _ in range(50):
        await asyncio.sleep(0.01)
        state = (await logged_in.get("/api/load-balancers/lb-1")).json()[
            "chain"
        ]
        if state and (len(state["done"]) == 4 or state["error"]):
            break
    assert (
        state is not None
        and state["error"] is None
        and state["done"] == ["listener", "pool", "member", "monitor"]
    )
    sent_listener = json.loads(listener.calls.last.request.content)["listener"]
    assert sent_listener["loadbalancer_id"] == "lb-1"
    assert sent_listener["default_tls_container_ref"] == "https://barbican/x"
    assert sent_listener["insert_headers"] == {"X-Forwarded-For": "true"}
    sent_pool = json.loads(pool.calls.last.request.content)["pool"]
    assert (
        sent_pool["listener_id"] == "l-1" and sent_pool["protocol"] == "HTTP"
    )
    assert sent_pool["session_persistence"] == {"type": "SOURCE_IP"}
    assert (
        json.loads(member.calls.last.request.content)["member"]["subnet_id"]
        == "subnet-1"
    )
    sent_monitor = json.loads(monitor.calls.last.request.content)[
        "healthmonitor"
    ]
    assert (
        sent_monitor["pool_id"] == "p-1"
        and sent_monitor["url_path"] == "/healthz"
    )


async def test_create_validation(lb_catalog, logged_in, upstream):
    mock_octavia(upstream)
    response = await logged_in.post(
        "/api/load-balancers",
        json={"vip_subnet_id": "subnet-1", "vip_address": "nope"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400
    response = await logged_in.post(
        "/api/load-balancers",
        json={
            "vip_subnet_id": "subnet-1",
            "listener": {
                "protocol": "HTTP",
                "protocol_port": 80,
                "allowed_cidrs": ["10/8x"],
            },
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400
    response = await logged_in.post(
        "/api/load-balancers",
        json={
            "vip_subnet_id": "subnet-1",
            "listener": {"protocol": "HTTP", "protocol_port": 80},
            "pool": {"lb_algorithm": "ROUND_ROBIN"},
            "monitor": {"type": "HTTP", "delay": 1, "timeout": 5},
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400
    assert "delay" in response.json()["message"]


async def test_update_delete_and_floating_ip(lb_catalog, logged_in, upstream):
    mock_octavia(upstream)
    updated = upstream.put(f"{LB}/loadbalancers/lb-1").mock(
        return_value=httpx.Response(
            200, json={"loadbalancer": {**LOAD_BALANCER, "name": "web2"}}
        )
    )
    response = await logged_in.patch(
        "/api/load-balancers/lb-1",
        json={"name": "web2"},
        headers=csrf_headers(logged_in),
    )
    assert response.json()["name"] == "web2"
    assert json.loads(updated.calls.last.request.content) == {
        "loadbalancer": {"name": "web2"}
    }

    deleted = upstream.delete(f"{LB}/loadbalancers/lb-1").mock(
        return_value=httpx.Response(204)
    )
    response = await logged_in.delete(
        "/api/load-balancers/lb-1", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 204
    assert deleted.calls.last.request.url.params["cascade"] == "true"

    upstream.get(f"{LB}/loadbalancers/lb-1").mock(
        return_value=httpx.Response(
            200,
            json={
                "loadbalancer": {
                    **LOAD_BALANCER,
                    "provisioning_status": "PENDING_UPDATE",
                }
            },
        )
    )
    response = await logged_in.delete(
        "/api/load-balancers/lb-1", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 409

    upstream.get(f"{LB}/loadbalancers/lb-1").mock(
        return_value=httpx.Response(200, json={"loadbalancer": LOAD_BALANCER})
    )
    upstream.get(f"{NEUTRON}/v2.0/networks").mock(
        return_value=httpx.Response(200, json={"networks": []})
    )
    associated = upstream.put(f"{NEUTRON}/v2.0/floatingips/fip-2").mock(
        return_value=httpx.Response(
            200,
            json={
                "floatingip": {
                    "id": "fip-2",
                    "floating_ip_address": "203.0.113.9",
                    "port_id": "port-vip",
                }
            },
        )
    )
    response = await logged_in.post(
        "/api/load-balancers/lb-1/floating-ip",
        json={"floating_ip_id": "fip-2"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200, response.text
    assert json.loads(associated.calls.last.request.content) == {
        "floatingip": {
            "port_id": "port-vip",
            "fixed_ip_address": "192.168.1.10",
        }
    }
    freed = upstream.put(f"{NEUTRON}/v2.0/floatingips/fip-1").mock(
        return_value=httpx.Response(
            200,
            json={
                "floatingip": {
                    "id": "fip-1",
                    "floating_ip_address": "203.0.113.5",
                    "port_id": None,
                }
            },
        )
    )
    response = await logged_in.delete(
        "/api/load-balancers/lb-1/floating-ip", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 200
    assert json.loads(freed.calls.last.request.content) == {
        "floatingip": {"port_id": None}
    }


async def test_children(lb_catalog, logged_in, upstream):
    mock_octavia(upstream)
    listener = upstream.post(f"{LB}/listeners").mock(
        return_value=httpx.Response(
            201,
            json={
                "listener": {**LISTENER, "id": "l-2", "protocol_port": 8080}
            },
        )
    )
    response = await logged_in.post(
        "/api/load-balancers/listeners",
        json={
            "loadbalancer_id": "lb-1",
            "protocol": "HTTP",
            "protocol_port": 8080,
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202, response.text
    assert (
        json.loads(listener.calls.last.request.content)["listener"][
            "protocol_port"
        ]
        == 8080
    )
    upstream.put(f"{LB}/listeners/l-1").mock(
        return_value=httpx.Response(
            200, json={"listener": {**LISTENER, "name": "renamed"}}
        )
    )
    response = await logged_in.patch(
        "/api/load-balancers/listeners/l-1",
        json={
            "name": "renamed",
            "insert_headers": {"X-Forwarded-Proto": True},
        },
        headers=csrf_headers(logged_in),
    )
    assert response.json()["name"] == "renamed"
    upstream.delete(f"{LB}/listeners/l-1").mock(
        return_value=httpx.Response(204)
    )
    assert (
        await logged_in.delete(
            "/api/load-balancers/listeners/l-1",
            headers=csrf_headers(logged_in),
        )
    ).status_code == 204

    pool = upstream.post(f"{LB}/pools").mock(
        return_value=httpx.Response(201, json={"pool": {**POOL, "id": "p-2"}})
    )
    response = await logged_in.post(
        "/api/load-balancers/pools",
        json={
            "loadbalancer_id": "lb-1",
            "listener_id": "l-1",
            "lb_algorithm": "LEAST_CONNECTIONS",
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202, response.text
    assert (
        json.loads(pool.calls.last.request.content)["pool"]["protocol"]
        == "HTTP"
    )
    response = await logged_in.post(
        "/api/load-balancers/pools",
        json={"loadbalancer_id": "lb-1", "lb_algorithm": "LEAST_CONNECTIONS"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400

    upstream.get(f"{LB}/pools/p-1/members").mock(
        return_value=httpx.Response(200, json={"members": [MEMBER]})
    )
    added = upstream.post(f"{LB}/pools/p-1/members").mock(
        return_value=httpx.Response(
            201,
            json={
                "member": {**MEMBER, "id": "m-2", "address": "192.168.1.21"}
            },
        )
    )
    removed = upstream.delete(f"{LB}/pools/p-1/members/m-1").mock(
        return_value=httpx.Response(204)
    )
    response = await logged_in.put(
        "/api/load-balancers/lb-1/pools/p-1/members",
        json={"members": [{"address": "192.168.1.21", "protocol_port": 80}]},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200, response.text
    assert removed.called and added.called

    monitor = upstream.post(f"{LB}/healthmonitors").mock(
        return_value=httpx.Response(201, json={"healthmonitor": MONITOR})
    )
    response = await logged_in.post(
        "/api/load-balancers/monitors",
        json={"pool_id": "p-1", "type": "TCP", "delay": 10, "timeout": 5},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202, response.text
    sent = json.loads(monitor.calls.last.request.content)["healthmonitor"]
    assert sent["pool_id"] == "p-1" and "url_path" not in sent
    upstream.put(f"{LB}/healthmonitors/hm-1").mock(
        return_value=httpx.Response(
            200, json={"healthmonitor": {**MONITOR, "delay": 10}}
        )
    )
    response = await logged_in.patch(
        "/api/load-balancers/monitors/hm-1",
        json={"delay": 10, "expected_codes": "200-204"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200, response.text
    response = await logged_in.patch(
        "/api/load-balancers/monitors/hm-1",
        json={"timeout": 20},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400

    policy = upstream.post(f"{LB}/l7policies").mock(
        return_value=httpx.Response(201, json={"l7policy": POLICY})
    )
    response = await logged_in.post(
        "/api/load-balancers/l7policies",
        json={
            "listener_id": "l-1",
            "action": "REDIRECT_TO_URL",
            "redirect_url": "https://x",
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202, response.text
    assert (
        json.loads(policy.calls.last.request.content)["l7policy"][
            "redirect_url"
        ]
        == "https://x"
    )
    response = await logged_in.post(
        "/api/load-balancers/l7policies",
        json={"listener_id": "l-1", "action": "REDIRECT_TO_POOL"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400
    rule = upstream.post(f"{LB}/l7policies/pol-1/rules").mock(
        return_value=httpx.Response(
            201, json={"rule": {"id": "r-2", "type": "HEADER"}}
        )
    )
    response = await logged_in.post(
        "/api/load-balancers/l7policies/pol-1/rules",
        json={
            "type": "HEADER",
            "compare_type": "EQUAL_TO",
            "key": "Host",
            "value": "x",
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202, response.text
    assert json.loads(rule.calls.last.request.content)["rule"]["key"] == "Host"
    response = await logged_in.post(
        "/api/load-balancers/l7policies/pol-1/rules",
        json={"type": "FILE_TYPE", "compare_type": "CONTAINS", "value": "x"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400
    upstream.delete(f"{LB}/l7policies/pol-1/rules/r-1").mock(
        return_value=httpx.Response(204)
    )
    assert (
        await logged_in.delete(
            "/api/load-balancers/l7policies/pol-1/rules/r-1",
            headers=csrf_headers(logged_in),
        )
    ).status_code == 204
    upstream.delete(f"{LB}/l7policies/pol-1").mock(
        return_value=httpx.Response(204)
    )
    assert (
        await logged_in.delete(
            "/api/load-balancers/l7policies/pol-1",
            headers=csrf_headers(logged_in),
        )
    ).status_code == 204
