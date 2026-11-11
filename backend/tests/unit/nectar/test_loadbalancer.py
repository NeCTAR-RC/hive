import pytest

from hive.nectar import loadbalancer
from hive.nectar.violation import RuleViolation


def test_listener_pool_member_monitor_fields():
    listener = loadbalancer.listener_fields(
        {
            "protocol": "HTTP",
            "protocol_port": 80,
            "name": "web",
            "insert_headers": {
                "X-Forwarded-For": True,
                "X-Forwarded-Port": False,
            },
            "allowed_cidrs": ["10.0.0.0/8"],
            "timeout_client_data": 1000,
        },
        "lb-1",
    )
    assert listener["loadbalancer_id"] == "lb-1"
    assert listener["insert_headers"] == {"X-Forwarded-For": "true"}
    assert listener['timeout_client_data'] == 1000
    assert listener['connection_limit'] == -1
    udp = loadbalancer.listener_fields(
        {"protocol": "UDP", "protocol_port": 53, "timeout_client_data": 5},
        None,
    )
    assert 'timeout_client_data' not in udp
    assert 'insert_headers' not in udp
    pool = loadbalancer.pool_fields(
        {
            "lb_algorithm": "ROUND_ROBIN",
            "session_persistence": {
                "type": "APP_COOKIE",
                "cookie_name": "sid",
            },
        },
        listener_id="l-1",
        listener_protocol="TERMINATED_HTTPS",
    )
    assert pool['protocol'] == 'HTTP'
    assert pool['listener_id'] == 'l-1'
    assert pool["session_persistence"] == {
        "type": "APP_COOKIE",
        "cookie_name": "sid",
    }
    bare = loadbalancer.pool_fields(
        {"lb_algorithm": "SOURCE_IP", "protocol": "TCP"}, lb_id="lb-1"
    )
    assert bare['loadbalancer_id'] == 'lb-1'
    assert bare['session_persistence'] is None
    member = loadbalancer.member_fields(
        {"address": "10.0.0.5", "protocol_port": 8080, "subnet_id": "s-1"}
    )
    assert member == {
        "address": "10.0.0.5",
        "protocol_port": 8080,
        "weight": 1,
        "admin_state_up": True,
        "backup": False,
        "subnet_id": "s-1",
    }
    monitor = loadbalancer.monitor_fields(
        {"type": "HTTP", "url_path": "/healthz"}, "p-1"
    )
    assert monitor['pool_id'] == 'p-1'
    assert monitor['expected_codes'] == '200'
    assert monitor['http_method'] == 'GET'
    assert monitor['url_path'] == '/healthz'
    ping = loadbalancer.monitor_fields({"type": "PING"})
    assert "http_method" not in ping


@pytest.mark.parametrize(
    "monitor",
    [{"type": "HTTP", "expected_codes": "200-204"}, {"type": "TCP"}],
)
def test_monitors_that_pass(monitor):
    loadbalancer.validate_monitor(monitor)


@pytest.mark.parametrize(
    ("monitor", "says"),
    [
        ({"type": "HTTP", "delay": 5, "timeout": 10}, "delay"),
        ({"type": "HTTP", "expected_codes": "abc"}, "Expected codes"),
        ({"type": "HTTP", "url_path": "nope"}, "slash"),
    ],
)
def test_monitors_that_break_the_rules(monitor, says):
    with pytest.raises(RuleViolation, match=says):
        loadbalancer.validate_monitor(monitor)


def test_valid_cidrs_pass():
    loadbalancer.valid_cidrs(["10.0.0.0/8", "fd00::/64"])
    loadbalancer.valid_cidrs(None)


def test_an_invalid_cidr_is_named():
    with pytest.raises(RuleViolation, match="not a valid CIDR"):
        loadbalancer.valid_cidrs(["10.0.0.0/33"])


@pytest.mark.parametrize(
    ("value", "valid"), [("10.0.0.1", True), ("x", False)]
)
def test_valid_ip(value, valid):
    assert loadbalancer.valid_ip(value) is valid


@pytest.mark.parametrize(
    ("protocol", "taken", "port"),
    [("HTTP", set(), 80), ("TERMINATED_HTTPS", {443, 444}, 445)],
)
def test_default_port(protocol, taken, port):
    assert loadbalancer.default_port(protocol, taken) == port


def test_a_terminated_https_listener_takes_an_http_pool():
    assert loadbalancer.pool_protocol_for("TERMINATED_HTTPS") == "HTTP"


def test_l7_fields_and_member_candidates():
    policy = loadbalancer.l7_policy_fields(
        {
            "action": "REDIRECT_TO_URL",
            "redirect_url": "https://x",
            "position": 1,
        },
        "l-1",
    )
    assert policy == {
        "action": "REDIRECT_TO_URL",
        "admin_state_up": True,
        "listener_id": "l-1",
        "position": 1,
        "redirect_url": "https://x",
    }
    rule = loadbalancer.l7_rule_fields(
        {
            "type": "HEADER",
            "compare_type": "EQUAL_TO",
            "key": "Host",
            "value": "a",
        }
    )
    assert rule["key"] == "Host"
    servers = [
        {"id": "i-1", "name": "web", "status": "ACTIVE"},
        {"id": "i-2", "name": "nope"},
    ]
    ports = [
        {
            "device_id": "i-1",
            "fixed_ips": [
                {"subnet_id": "s-1", "ip_address": "10.0.0.5"},
                {"subnet_id": "s-x", "ip_address": "1.1.1.1"},
            ],
        },
        {
            "device_id": "i-2",
            "fixed_ips": [{"subnet_id": "s-x", "ip_address": "2.2.2.2"}],
        },
    ]
    candidates = loadbalancer.member_candidates(servers, ports, {"s-1"})
    assert candidates == [
        {
            "id": "i-1",
            "name": "web",
            "status": "ACTIVE",
            "addresses": [{"address": "10.0.0.5", "subnet_id": "s-1"}],
        }
    ]
    lb = {"provisioning_status": "PENDING_UPDATE"}
    assert loadbalancer.is_transitional(lb)
    assert not loadbalancer.can_delete(lb)


def test_pools_of_matches_the_first_load_balancer():
    pools = [
        {"id": "p-1", "loadbalancers": [{"id": "lb-1"}]},
        {"id": "p-2", "loadbalancers": [{"id": "lb-2"}, {"id": "lb-1"}]},
        {"id": "p-3", "loadbalancers": []},
        {"id": "p-4"},
    ]
    assert [p["id"] for p in loadbalancer.pools_of(pools, "lb-1")] == ["p-1"]
