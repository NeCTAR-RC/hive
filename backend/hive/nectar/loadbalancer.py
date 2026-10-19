"""Load balancer (Octavia) rules, as octavia-dashboard builds them.

- Statuses: provisioning ``PENDING_*`` is transitional; a load balancer
  can be deleted only in ``ACTIVE`` or ``ERROR``
  (``actions/delete/delete.action.service.js:128-146``); deletes cascade.
- Create: the wizard posts the load balancer with optional listener, pool,
  members and monitor; the server creates them one after another, waiting
  for the load balancer to become ``ACTIVE`` between steps
  (``api/rest/lbaasv2.py:150-321, 357-412``). Hive runs those waits in a
  background chain and never blocks a request on them: a child-resource
  request against a load balancer that is not ``ACTIVE`` is refused with
  409 for the panel to retry (octavia-dashboard's single-resource views
  return at once too, and Octavia itself answers 409 for a change to a
  load balancer in a ``PENDING_*`` state).
- Cleaning (``workflow/model.service.js:421-618``): the listener needs a
  protocol and port; the pool protocol follows the listener (HTTP behind
  TERMINATED_HTTPS); session persistence without a type is dropped and
  the cookie name kept only for APP_COOKIE; members need address and port;
  the monitor's HTTP fields apply to HTTP and HTTPS only.
- Defaults: listener port 80 for HTTP and 443 for TERMINATED_HTTPS,
  connection limit -1, timeouts 50000/5000/50000/0 ms; monitor delay 5,
  timeout 5, retries 3, ``GET`` ``/`` expecting ``200``.
- Subnets offered for the VIP and members are those of the networks the
  project may boot on (the Nectar fork's ``subnet_list_for_tenant``,
  ``api/neutron.py:1823-1837``); member candidates are the project's
  servers with their ports' fixed IPs (``model.service.js:646-694``).
"""

import ipaddress
import re

TRANSITIONAL = ("PENDING_CREATE", "PENDING_UPDATE", "PENDING_DELETE")
DELETABLE = ("ACTIVE", "ERROR")
LISTENER_PROTOCOLS = (
    "HTTP",
    "TCP",
    "TERMINATED_HTTPS",
    "HTTPS",
    "UDP",
    "SCTP",
)
POOL_PROTOCOLS = ("HTTP", "HTTPS", "PROXY", "PROXYV2", "TCP", "UDP", "SCTP")
ALGORITHMS = ("LEAST_CONNECTIONS", "ROUND_ROBIN", "SOURCE_IP")
PERSISTENCE = ("SOURCE_IP", "HTTP_COOKIE", "APP_COOKIE")
MONITOR_TYPES = (
    "HTTP",
    "HTTPS",
    "PING",
    "TCP",
    "TLS-HELLO",
    "UDP-CONNECT",
    "SCTP",
)
HTTP_METHODS = (
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "DELETE",
    "TRACE",
    "OPTIONS",
    "PATCH",
    "CONNECT",
)
L7_ACTIONS = (
    "REJECT",
    "REDIRECT_TO_URL",
    "REDIRECT_TO_POOL",
    "REDIRECT_PREFIX",
)
L7_RULE_TYPES = ("HOST_NAME", "PATH", "FILE_TYPE", "HEADER", "COOKIE")
L7_COMPARE = ("REGEX", "EQUAL_TO", "STARTS_WITH", "ENDS_WITH", "CONTAINS")
DEFAULT_PORTS = {"HTTP": 80, "TERMINATED_HTTPS": 443, "HTTPS": 443}
EXPECTED_CODES = re.compile(r"^\d+((\s*-\s*\d+)|(\s*,\s*\d+)+)?$")
URL_PATH = re.compile(r"^((/)|(/[^/]+)+)$")
CIPHERS = re.compile(r"^([A-Z0-9_-]+:)*[A-Z0-9_-]+$")
UDP_LIKE = ("UDP", "SCTP")


def is_transitional(lb: dict) -> bool:
    return lb.get("provisioning_status") in TRANSITIONAL


def can_delete(lb: dict) -> bool:
    return lb.get("provisioning_status") in DELETABLE


def valid_ip(value: str | None) -> bool:
    if not value:
        return False
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return False
    return True


def valid_cidrs(values: list[str] | None) -> str | None:
    for value in values or []:
        try:
            ipaddress.ip_network(value, strict=False)
        except ValueError:
            return f'"{value}" is not a valid CIDR.'
    return None


def default_port(protocol: str, used: set[int]) -> int:
    port = DEFAULT_PORTS.get(protocol, 80)
    while port in used:
        port += 1
    return port


def pool_protocol_for(listener_protocol: str | None) -> str | None:
    if listener_protocol is None:
        return None
    return (
        "HTTP"
        if listener_protocol == "TERMINATED_HTTPS"
        else listener_protocol
    )


def listener_fields(data: dict, lb_id: str | None = None) -> dict:
    """The Octavia listener body from the wizard's step."""
    protocol = data["protocol"]
    body: dict = {
        "protocol": protocol,
        "protocol_port": data["protocol_port"],
        "admin_state_up": data.get("admin_state_up", True),
        "connection_limit": data.get("connection_limit", -1),
    }
    if lb_id:
        body["loadbalancer_id"] = lb_id
    for key in ("name", "description"):
        if data.get(key):
            body[key] = data[key]
    if protocol not in UDP_LIKE:
        for key in (
            "timeout_client_data",
            "timeout_member_connect",
            "timeout_member_data",
            "timeout_tcp_inspect",
        ):
            if data.get(key) is not None:
                body[key] = data[key]
    if data.get("allowed_cidrs"):
        body["allowed_cidrs"] = data["allowed_cidrs"]
    if protocol in ("HTTP", "TERMINATED_HTTPS"):
        headers = {
            k: "true"
            for k, v in (data.get("insert_headers") or {}).items()
            if v
        }
        if headers:
            body["insert_headers"] = headers
    if protocol == "TERMINATED_HTTPS":
        if data.get("default_tls_container_ref"):
            body["default_tls_container_ref"] = data[
                "default_tls_container_ref"
            ]
        if data.get("sni_container_refs"):
            body["sni_container_refs"] = data["sni_container_refs"]
        if data.get("tls_ciphers"):
            body["tls_ciphers"] = data["tls_ciphers"]
    if data.get("default_pool_id"):
        body["default_pool_id"] = data["default_pool_id"]
    return body


def pool_fields(
    data: dict,
    *,
    listener_id: str | None = None,
    lb_id: str | None = None,
    listener_protocol: str | None = None,
) -> dict:
    body: dict = {
        "lb_algorithm": data["lb_algorithm"],
        "admin_state_up": data.get("admin_state_up", True),
    }
    protocol = pool_protocol_for(listener_protocol) or data.get("protocol")
    if protocol:
        body["protocol"] = protocol
    if listener_id:
        body["listener_id"] = listener_id
    elif lb_id:
        body["loadbalancer_id"] = lb_id
    for key in ("name", "description"):
        if data.get(key):
            body[key] = data[key]
    persistence = data.get("session_persistence") or {}
    ptype = persistence.get("type")
    if ptype:
        entry = {"type": ptype}
        if ptype == "APP_COOKIE" and persistence.get("cookie_name"):
            entry["cookie_name"] = persistence["cookie_name"]
        body["session_persistence"] = entry
    else:
        body["session_persistence"] = None
    if data.get("tls_enabled"):
        body["tls_enabled"] = True
        if data.get("tls_ciphers"):
            body["tls_ciphers"] = data["tls_ciphers"]
    return body


def member_fields(data: dict) -> dict:
    body: dict = {
        "address": data["address"],
        "protocol_port": data["protocol_port"],
        "weight": data.get("weight", 1),
        "admin_state_up": data.get("admin_state_up", True),
        "backup": data.get("backup", False),
    }
    for key in ("subnet_id", "name", "monitor_address", "monitor_port"):
        if data.get(key):
            body[key] = data[key]
    return body


def monitor_fields(data: dict, pool_id: str | None = None) -> dict:
    mtype = data["type"]
    body: dict = {
        "type": mtype,
        "delay": data.get("delay", 5),
        "timeout": data.get("timeout", 5),
        "max_retries": data.get("max_retries", 3),
        "max_retries_down": data.get("max_retries_down", 3),
        "admin_state_up": data.get("admin_state_up", True),
    }
    if pool_id:
        body["pool_id"] = pool_id
    if data.get("name"):
        body["name"] = data["name"]
    if mtype in ("HTTP", "HTTPS"):
        body["http_method"] = data.get("http_method") or "GET"
        body["url_path"] = data.get("url_path") or "/"
        body["expected_codes"] = data.get("expected_codes") or "200"
    return body


def validate_monitor(data: dict) -> str | None:
    if data.get("delay", 5) < data.get("timeout", 5):
        return "The delay must be at least the timeout."
    if data["type"] in ("HTTP", "HTTPS"):
        if not EXPECTED_CODES.match(str(data.get("expected_codes") or "200")):
            return "Expected codes are a code, a range (200-204) or a list (200,301)."
        if not URL_PATH.match(data.get("url_path") or "/"):
            return "The URL path must start with a slash."
    return None


def l7_policy_fields(data: dict, listener_id: str | None = None) -> dict:
    body: dict = {
        "action": data["action"],
        "admin_state_up": data.get("admin_state_up", True),
    }
    if listener_id:
        body["listener_id"] = listener_id
    for key in ("name", "description", "position"):
        if data.get(key) is not None and data.get(key) != "":
            body[key] = data[key]
    if data["action"] == "REDIRECT_TO_URL":
        body["redirect_url"] = data.get("redirect_url")
    elif data["action"] == "REDIRECT_TO_POOL":
        body["redirect_pool_id"] = data.get("redirect_pool_id")
    elif data["action"] == "REDIRECT_PREFIX":
        body["redirect_prefix"] = data.get("redirect_prefix")
    return body


def l7_rule_fields(data: dict) -> dict:
    body: dict = {
        "type": data["type"],
        "compare_type": data["compare_type"],
        "value": data["value"],
        "invert": data.get("invert", False),
        "admin_state_up": data.get("admin_state_up", True),
    }
    if data["type"] in ("HEADER", "COOKIE") and data.get("key"):
        body["key"] = data["key"]
    return body


def pools_of(pools: list[dict], lb_id: str) -> list[dict]:
    """The pools of one load balancer, matched on the first entry of
    ``loadbalancers`` client-side rather than trusting a server-side
    filter (octavia-dashboard ``api/rest/lbaasv2.py``
    ``Pools._filter_pools``)."""
    return [
        pool
        for pool in pools
        if (pool.get("loadbalancers") or [{}])[0].get("id") == lb_id
    ]


def member_candidates(
    servers: list[dict], ports: list[dict], subnet_ids: set[str]
):
    """Instances with the fixed IPs of their ports on offered subnets
    (``model.service.js:646-694``)."""
    by_device: dict[str, list[dict]] = {}
    for port in ports:
        device = port.get("device_id")
        if not device:
            continue
        for fixed in port.get("fixed_ips") or []:
            if fixed.get("subnet_id") in subnet_ids and fixed.get(
                "ip_address"
            ):
                by_device.setdefault(device, []).append(
                    {
                        "address": fixed["ip_address"],
                        "subnet_id": fixed["subnet_id"],
                    }
                )
    items = []
    for server in servers:
        addresses = by_device.get(server.get("id") or "", [])
        if not addresses:
            continue
        items.append(
            {
                "id": server.get("id"),
                "name": server.get("name"),
                "status": server.get("status"),
                "addresses": addresses,
            }
        )
    items.sort(key=lambda s: (s["name"] or "").lower())
    return items
