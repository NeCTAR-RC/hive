"""Nectar network classification.

Ported from the Horizon fork, ``openstack_dashboard/api/neutron.py``
(``_nectar_shared_tags``, ``_floating_network_params``,
``_query_classic_net``, ``network_list_for_tenant`` ordering,
``subnet_list_for_tenant``) and
``dashboards/project/instances/utils.py`` (launch candidates and
attachable ports). Which networks a user is offered depends on what they
are about to do with them; operators classify networks with tags:

* the floating tag marks external networks usable for floating IPs and
  router gateways;
* the bootable tag marks shared networks a user may boot or attach on;
* the classic network id is the placeholder nova swaps for a real provider
  network, offered first when booting or attaching.

Shared networks without any of these tags are never offered. With no tags
configured every listing behaves exactly like upstream.

The second half ports the Network dashboard's own rules: which subnets a
router may get an interface on (``routers/ports/forms.py``), which ports a
floating IP may land on (``FloatingIpManager._get_reachable_subnets`` and
``list_targets``), which ports a trunk may use
(``static/app/core/trunks/actions/ports-extra.service.js``), and the subnet
and port forwarding bodies the workflows build
(``networks/workflows.py``, ``api/neutron.py:PortForwardingManager``).
"""

import ipaddress

from hive.errors import BadRequest

PURPOSE_BOOT = "boot"
PURPOSE_ROUTER = "router"
PURPOSE_ANY = "any"

# Horizon api/neutron.py ROUTER_INTERFACE_OWNERS.
ROUTER_INTERFACE_OWNERS = (
    "network:router_interface",
    "network:router_interface_distributed",
    "network:ha_router_replicated_interface",
)
ROUTER_GATEWAY_OWNER = "network:router_gateway"
ROUTER_HA_OWNER = "network:router_ha_interface"
# Horizon FloatingIpManager.device_owner_map.
DEVICE_OWNER_TYPES = {
    "compute:": "compute",
    "neutron:LOADBALANCER": "loadbalancer",
}


class NetworkRules:
    def __init__(
        self,
        classic_network_id: str | None,
        bootable_tag: str | None,
        floating_tag: str | None,
    ):
        self.classic_network_id = classic_network_id or None
        self.bootable_tag = bootable_tag or None
        self.floating_tag = floating_tag or None

    @property
    def configured(self) -> bool:
        return bool(self.bootable_tag or self.floating_tag)

    def shared_tags_for(self, purpose: str) -> list[str] | None:
        """Tags a shared network needs to be offered for ``purpose``.

        None when tagging is not configured (list shared networks as
        upstream does), an empty list when no shared network may be
        offered, otherwise the accepted tags.
        """
        if not self.configured:
            return None
        if purpose == PURPOSE_ROUTER:
            return []
        if purpose == PURPOSE_BOOT:
            return [self.bootable_tag] if self.bootable_tag else []
        return [t for t in (self.floating_tag, self.bootable_tag) if t]

    def shared_query_params(self, purpose: str) -> dict | None:
        """Neutron params for the shared-network query, or None when no
        shared network may be offered."""
        tags = self.shared_tags_for(purpose)
        params: dict = {"shared": "true"}
        if tags is None:
            return params
        if not tags:
            return None
        params["tags-any"] = ",".join(tags)
        return params

    def floating_query_params(self) -> dict:
        params: dict = {"router:external": "true"}
        if self.floating_tag:
            params["tags-any"] = self.floating_tag
        return params

    def offers_classic(self, purpose: str) -> bool:
        return bool(self.classic_network_id) and purpose != PURPOSE_ROUTER

    def is_classic(self, network_id: str) -> bool:
        return bool(self.classic_network_id) and (
            network_id == self.classic_network_id
        )

    def order(self, classic, shared, project, external=()) -> list[dict]:
        """Classic first, then shared, project and external networks."""
        seen: set[str] = set()
        ordered: list[dict] = []
        for group in (classic, shared, project, external):
            for network in group:
                if network["id"] in seen:
                    continue
                seen.add(network["id"])
                ordered.append(network)
        return ordered

    def launch_candidates(self, networks: list[dict]) -> list[dict]:
        """Networks an instance may boot on: drop those without subnets,
        except the classic placeholder, keep classic first and sort the
        rest by name."""
        usable = [
            n for n in networks if n.get("subnets") or self.is_classic(n["id"])
        ]
        classic = [n for n in usable if self.is_classic(n["id"])]
        others = sorted(
            (n for n in usable if not self.is_classic(n["id"])),
            key=lambda n: (n.get("name") or n["id"]).lower(),
        )
        return classic + others

    def attachable_ports(
        self, ports: list[dict], bootable_ids: set[str]
    ) -> list[dict]:
        """Ports without a device, on networks an instance may attach to."""
        return [
            p
            for p in ports
            if not p.get("device_owner")
            and p.get("network_id") in bootable_ids
        ]

    # --- routers --------------------------------------------------------------

    def router_interface_subnets(
        self, networks: list[dict], used_subnet_ids: set[str]
    ) -> list[dict]:
        """Subnets a router may get an interface on: those of the networks
        offered for PURPOSE_ROUTER (the project's own), with a gateway and
        not already attached (``routers/ports/forms.py:AddInterface``)."""
        choices = []
        for network in networks:
            for subnet in network.get("subnets") or []:
                if subnet.get("id") in used_subnet_ids:
                    continue
                if not subnet.get("gateway_ip"):
                    continue
                choices.append(
                    {
                        **subnet,
                        "network_id": network.get("id"),
                        "network_name": network.get("name"),
                    }
                )
        return choices

    # --- floating IPs ---------------------------------------------------------

    def shared_subnets_reachable(self) -> bool:
        """Whether subnets of shared networks count as reachable from the
        external network. Upstream assumes they are (the router interface
        may be invisible); Nectar only counts shared networks a user can
        put a port on, so none when tags are configured without a bootable
        tag (``FloatingIpManager._get_reachable_subnets``)."""
        tags = self.shared_tags_for(PURPOSE_BOOT)
        return tags is None or bool(tags)

    def reachable_subnets(
        self,
        ports: list[dict],
        routers: list[dict],
        floating_network_ids: set[str],
        shared_subnet_ids: set[str],
        topology_check: bool = True,
    ) -> set[str]:
        """Subnets a floating IP can reach: those behind a router whose
        gateway is on a floating network, plus the shared bootable ones.
        Without the topology check every subnet with a port qualifies."""
        if not topology_check:
            return {
                p["fixed_ips"][0]["subnet_id"]
                for p in ports
                if p.get("fixed_ips")
            }
        gateway_routers = {
            r["id"]
            for r in routers
            if (r.get("external_gateway_info") or {}).get("network_id")
            in floating_network_ids
        }
        reachable = {
            p["fixed_ips"][0]["subnet_id"]
            for p in ports
            if p.get("device_owner") in ROUTER_INTERFACE_OWNERS
            and p.get("device_id") in gateway_routers
            and p.get("fixed_ips")
        }
        if self.shared_subnets_reachable():
            reachable |= shared_subnet_ids
        return reachable

    @staticmethod
    def floating_targets(
        ports: list[dict],
        server_names: dict[str, str],
        reachable: set[str],
        instance_id: str | None = None,
    ) -> list[dict]:
        """Port and IPv4 address pairs a floating IP may be associated with
        (``FloatingIpManager.list_targets``): no network-owned ports, only
        addresses on reachable subnets, optionally one instance's ports."""
        targets = []
        for port in ports:
            owner = port.get("device_owner") or ""
            if owner.startswith("network:"):
                continue
            device_id = port.get("device_id")
            if instance_id and device_id != instance_id:
                continue
            name = server_names.get(device_id or "")
            for ip in port.get("fixed_ips") or []:
                if ip.get("subnet_id") not in reachable:
                    continue
                try:
                    if ipaddress.ip_address(ip["ip_address"]).version != 4:
                        continue
                except (KeyError, ValueError):
                    continue
                label = (
                    f"{name} {ip['ip_address']}"
                    if name
                    else (
                        f"{port.get('name') or port['id']} {ip['ip_address']}"
                    )
                )
                targets.append(
                    {
                        "id": f"{port['id']}_{ip['ip_address']}",
                        "port_id": port["id"],
                        "ip_address": ip["ip_address"],
                        "instance_id": device_id or None,
                        "instance_name": name,
                        "name": label,
                    }
                )
        return sorted(targets, key=lambda t: t["name"].lower())

    @staticmethod
    def device_type(device_owner: str | None) -> str | None:
        """'compute', 'loadbalancer' or the raw owner, as Horizon shows it."""
        if not device_owner:
            return None
        for prefix, kind in DEVICE_OWNER_TYPES.items():
            if device_owner.startswith(prefix):
                return kind
        return device_owner

    # --- trunks ---------------------------------------------------------------

    @staticmethod
    def trunk_parent_candidates(
        ports: list[dict], trunks: list[dict]
    ) -> list[dict]:
        """Ports that may become a trunk's parent: up, unbound or bound to
        an instance, and not already part of a trunk (ports-extra.service.js
        ``isParentPortCandidate``)."""
        parents, children = _trunk_port_ids(trunks)
        return [
            p
            for p in ports
            if p.get("admin_state_up")
            and (
                not p.get("device_owner")
                or str(p.get("device_owner")).startswith("compute:")
            )
            and p["id"] not in parents
            and p["id"] not in children
        ]

    @staticmethod
    def trunk_subport_candidates(
        ports: list[dict], trunks: list[dict]
    ) -> list[dict]:
        """Ports that may become subports: up, unbound and not in a trunk
        (``isSubportCandidate``)."""
        parents, children = _trunk_port_ids(trunks)
        return [
            p
            for p in ports
            if p.get("admin_state_up")
            and not p.get("device_owner")
            and p["id"] not in parents
            and p["id"] not in children
        ]


def _trunk_port_ids(trunks: list[dict]) -> tuple[set[str], set[str]]:
    parents = {str(t.get("port_id")) for t in trunks if t.get("port_id")}
    children = {
        str(s.get("port_id"))
        for t in trunks
        for s in t.get("sub_ports") or []
        if s.get("port_id")
    }
    return parents, children


# --- request bodies --------------------------------------------------------


def subnet_body(
    data: dict,
    default_dns: list[str],
    enable_ipv6: bool = False,
    is_create: bool = True,
) -> dict:
    """The neutron subnet body for a create or update, with the checks of
    Horizon's ``CreateSubnetInfoAction._check_subnet_data`` and
    ``CreateSubnetDetailAction.clean``: the address and gateway must match
    the IP version, a host-sized prefix is refused, and the default name
    servers apply when the user leaves the field untouched.

    ``data`` holds the request fields (None for those not given).
    """
    body: dict = {}
    if data.get("name") is not None:
        body["name"] = data["name"]
    cidr = data.get("cidr")
    ip_version = data.get("ip_version") or 4
    if is_create:
        if not enable_ipv6 and ip_version != 4:
            raise BadRequest("IPv6 subnets are not available")
        if cidr:
            try:
                network = ipaddress.ip_network(cidr, strict=False)
            except ValueError:
                raise BadRequest(f"'{cidr}' is not a network address")
            if network.version != ip_version:
                raise BadRequest(
                    "the network address and IP version are inconsistent"
                )
            if network.prefixlen == network.max_prefixlen:
                raise BadRequest(
                    f"the subnet in the network address is too small "
                    f"(/{network.prefixlen})"
                )
            body["cidr"] = str(network)
        elif not data.get("subnetpool_id"):
            raise BadRequest("a network address or an address pool is needed")
        body["ip_version"] = ip_version
        if data.get("subnetpool_id"):
            body["subnetpool_id"] = data["subnetpool_id"]
            if data.get("prefixlen"):
                body["prefixlen"] = data["prefixlen"]
    if data.get("no_gateway"):
        body["gateway_ip"] = None
    elif data.get("gateway_ip"):
        try:
            gateway = ipaddress.ip_address(data["gateway_ip"])
        except ValueError:
            raise BadRequest(f"'{data['gateway_ip']}' is not an IP address")
        if gateway.version != ip_version:
            raise BadRequest("the gateway IP and IP version are inconsistent")
        body["gateway_ip"] = str(gateway)
    if data.get("enable_dhcp") is not None:
        body["enable_dhcp"] = data["enable_dhcp"]
    pools = data.get("allocation_pools")
    if pools is not None:
        for pool in pools:
            start = _ip(pool.get("start"), "allocation pool")
            end = _ip(pool.get("end"), "allocation pool")
            if start.version != end.version or int(start) > int(end):
                raise BadRequest(
                    f"allocation pool start {start} is after its end {end}"
                )
        if pools or not is_create:
            body["allocation_pools"] = [
                {"start": p["start"], "end": p["end"]} for p in pools
            ]
    nameservers = data.get("dns_nameservers")
    if nameservers is None:
        if is_create:
            body["dns_nameservers"] = list(default_dns)
    else:
        for server in nameservers:
            _ip(server, "DNS name server")
        body["dns_nameservers"] = list(nameservers)
    routes = data.get("host_routes")
    if routes is not None:
        for route in routes:
            try:
                ipaddress.ip_network(
                    route.get("destination") or "", strict=False
                )
            except ValueError:
                raise BadRequest(
                    f"host route destination '{route.get('destination')}' "
                    "is not a network address"
                )
            _ip(route.get("nexthop"), "host route next hop")
        body["host_routes"] = [
            {"destination": r["destination"], "nexthop": r["nexthop"]}
            for r in routes
        ]
    return body


def _ip(value, what: str):
    try:
        return ipaddress.ip_address(value)
    except (TypeError, ValueError):
        raise BadRequest(f"{what} '{value}' is not an IP address")


def port_forwarding_body(data: dict) -> dict:
    """Neutron's port forwarding fields: a single port goes as an int, a
    ``start:end`` range as a string (``PortForwardingManager``)."""
    body: dict = {}
    if data.get("protocol"):
        body["protocol"] = str(data["protocol"]).lower()
    for key in ("internal_port", "external_port"):
        value = data.get(key)
        if value is None:
            continue
        value = str(value).strip()
        if ":" in value:
            low, _, high = value.partition(":")
            if not (_port(low) <= _port(high)):
                raise BadRequest(
                    f"{key.replace('_', ' ')} range '{value}' is reversed"
                )
            body[f"{key}_range"] = f"{int(low)}:{int(high)}"
        else:
            body[key] = _port(value)
    for key in ("internal_ip_address", "internal_port_id", "description"):
        if data.get(key) is not None:
            body[key] = data[key]
    return body


def _port(value: str) -> int:
    try:
        port = int(value)
    except ValueError:
        raise BadRequest(f"'{value}' is not a port number")
    if not 1 <= port <= 65535:
        raise BadRequest(f"port {port} is outside 1 to 65535")
    return port


def static_routes(routes: list[dict]) -> list[dict]:
    """Validate and normalise router static routes (extraroutes/forms.py)."""
    result = []
    for route in routes:
        try:
            destination = ipaddress.ip_network(
                route.get("destination") or "", strict=False
            )
        except ValueError:
            raise BadRequest(
                f"destination '{route.get('destination')}' is not a CIDR"
            )
        nexthop = _ip(route.get("nexthop"), "next hop")
        if destination.version != nexthop.version:
            raise BadRequest(
                "the destination and next hop are not the same IP version"
            )
        result.append(
            {"destination": str(destination), "nexthop": str(nexthop)}
        )
    return result
