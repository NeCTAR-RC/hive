"""Nectar network classification.

Ported from the Horizon fork, ``openstack_dashboard/api/neutron.py``
(``_nectar_shared_tags``, ``_floating_network_params``,
``_query_classic_net``, ``network_list_for_tenant`` ordering,
``subnet_list_for_tenant``) and
``dashboards/project/instances/utils.py`` (launch candidates and
attachable ports), as proposed in Gerrit changes 71397, 71398 and 71399
on nectar/2025.1 (still in review in October 2026; follow them if the
rules change). Which networks a user is offered depends on what they
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
import itertools
import re

from hive.nectar.violation import RuleViolation

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
# Router ports of every kind: their device is a router.
ROUTER_OWNERS = (
    *ROUTER_INTERFACE_OWNERS,
    ROUTER_GATEWAY_OWNER,
    ROUTER_HA_OWNER,
)
# Ports Neutron deletes together with their network (DHCP, and the OVN
# metadata port), so they never keep a network from being deleted.
AUTO_DELETED_OWNERS = ("network:dhcp", "network:distributed")
MAC_ADDRESS = re.compile(r"[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}")


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

    def router_interface_subnets(
        self, networks: list[dict], used_subnet_ids: set[str]
    ) -> list[dict]:
        """Subnets a router may get an interface on: those of the networks
        offered for PURPOSE_ROUTER (the project's own), with a gateway and
        not already attached (``routers/ports/forms.py:AddInterface``).

        Each choice carries ``overlaps``: the range of a subnet already on
        the router that its own range overlaps, which Neutron refuses
        (``l3_db._check_for_dup_router_subnets``), else None. Horizon
        lists such subnets and shows the refusal.
        """
        subnets = [
            (network, subnet)
            for network in networks
            for subnet in network.get("subnets") or []
        ]
        attached = [
            attached_range
            for _, subnet in subnets
            if subnet.get("id") in used_subnet_ids
            and (attached_range := _network_or_none(subnet.get("cidr")))
        ]
        choices = []
        for network, subnet in subnets:
            if subnet.get("id") in used_subnet_ids:
                continue
            if not subnet.get("gateway_ip"):
                continue
            own = _network_or_none(subnet.get("cidr"))
            overlaps = next(
                (
                    str(other)
                    for other in attached
                    if own is not None
                    and own.version == other.version
                    and own.overlaps(other)
                ),
                None,
            )
            choices.append(
                {
                    **subnet,
                    "network_id": network.get("id"),
                    "network_name": network.get("name"),
                    "overlaps": overlaps,
                }
            )
        return choices

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


def ports_in_use(ports: list[dict]) -> dict[str, int]:
    """Per network id, the ports that keep the network from being deleted:
    every port but those Neutron removes along with the network
    (``AUTO_DELETED_OWNERS``). Horizon offers Delete regardless and shows
    Neutron's refusal ("There are one or more ports still in use")."""
    counts: dict[str, int] = {}
    for port in ports:
        if port.get("device_owner") in AUTO_DELETED_OWNERS:
            continue
        network_id = str(port.get("network_id") or "")
        counts[network_id] = counts.get(network_id, 0) + 1
    return counts


def device_kind(device_owner: str | None) -> str | None:
    """'instance' or 'router' for a port whose device Hive has a page for,
    read from the owner as Horizon's ``device_owner_map`` and router
    owner lists do; None for any other owner."""
    owner = device_owner or ""
    if owner.startswith("compute:"):
        return "instance"
    if owner in ROUTER_OWNERS:
        return "router"
    return None


def _trunk_port_ids(trunks: list[dict]) -> tuple[set[str], set[str]]:
    parents = {str(t.get("port_id")) for t in trunks if t.get("port_id")}
    children = {
        str(s.get("port_id"))
        for t in trunks
        for s in t.get("sub_ports") or []
        if s.get("port_id")
    }
    return parents, children


# Horizon networks/subnets/utils.py IPV6_MODE_CHOICES: the router
# advertisement and address mode pairs (ra, address) the subnet form offers.
IPV6_MODES = (
    (None, None),
    ("slaac", "slaac"),
    (None, "slaac"),
    ("dhcpv6-stateful", "dhcpv6-stateful"),
    ("dhcpv6-stateless", "dhcpv6-stateless"),
)

IpAddress = ipaddress.IPv4Address | ipaddress.IPv6Address
IpNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network


def subnet_body(
    data: dict,
    default_dns: list[str],
    enable_ipv6: bool = False,
    stored: dict | None = None,
) -> dict:
    """The neutron subnet body for a create, or for an update of
    ``stored`` (the subnet as Neutron holds it), with the checks of
    Horizon's ``CreateSubnetInfoAction._check_subnet_data`` and
    ``CreateSubnetDetailAction.clean``, plus the range checks Neutron
    would otherwise refuse the request on (``check_subnet_ranges``). The
    default name servers apply to a create that leaves the field
    untouched.

    ``data`` holds the request fields (None for those not given).
    """
    body: dict = {}
    if data.get("name") is not None:
        body["name"] = data["name"]
    if stored is None:
        network = _create_fields(data, enable_ipv6, body)
        ip_version = body["ip_version"]
    else:
        ip_version = stored.get("ip_version") or 4
        network = _network_or_none(stored.get("cidr"))
    gateway = _gateway(data, ip_version, body)
    if data.get("enable_dhcp") is not None:
        body["enable_dhcp"] = data["enable_dhcp"]
    pools = _pools(data.get("allocation_pools"))
    if pools is not None and (pools or stored is not None):
        body["allocation_pools"] = [
            {"start": str(start), "end": str(end)} for start, end in pools
        ]
    # An update checks the ranges only when it changes one, so a rename
    # never trips over a subnet an administrator made by other rules.
    changes_ranges = stored is None or any(
        data.get(key) is not None for key in ("gateway_ip", "allocation_pools")
    )
    if network is not None and changes_ranges:
        if gateway is None and not data.get("no_gateway"):
            # The gateway the subnet keeps: the stored one on an update,
            # Neutron's first address on a create.
            gateway = (
                _network_first_host(network)
                if stored is None
                else _address_or_none(stored.get("gateway_ip"))
            )
        if pools is None and stored is not None:
            pools = _pools(stored.get("allocation_pools"))
        check_subnet_ranges(network, gateway, pools or [])
    nameservers = data.get("dns_nameservers")
    if nameservers is None:
        if stored is None and default_dns:
            body["dns_nameservers"] = list(default_dns)
    else:
        for server in nameservers:
            _ip(server, "DNS name server")
        body["dns_nameservers"] = list(nameservers)
    routes = data.get("host_routes")
    if routes is not None:
        body["host_routes"] = _host_routes(routes, ip_version)
    return body


def _create_fields(
    data: dict, enable_ipv6: bool, body: dict
) -> IpNetwork | None:
    """The fields only a create sends (address, IP version, pool and IPv6
    modes) into ``body``; returns the typed network address, if any."""
    ip_version = data.get("ip_version") or 4
    if not enable_ipv6 and ip_version != 4:
        raise RuleViolation("IPv6 subnets are not available")
    network = None
    if data.get("cidr"):
        network = _subnet_address(data["cidr"], ip_version)
        body["cidr"] = str(network)
    elif not data.get("subnetpool_id"):
        raise RuleViolation("a network address or an address pool is needed")
    body["ip_version"] = ip_version
    if data.get("subnetpool_id"):
        body["subnetpool_id"] = data["subnetpool_id"]
        if data.get("prefixlen"):
            body["prefixlen"] = data["prefixlen"]
    body.update(_ipv6_modes(data, ip_version))
    return network


def _subnet_address(cidr: str, ip_version: int) -> IpNetwork:
    """A new subnet's network address: a CIDR of the subnet's IP version,
    larger than a single host."""
    try:
        network = ipaddress.ip_network(cidr, strict=False)
    except ValueError:
        raise RuleViolation(f"'{cidr}' is not a network address") from None
    if network.version != ip_version:
        raise RuleViolation(
            "the network address and IP version are inconsistent"
        )
    if network.prefixlen == network.max_prefixlen:
        raise RuleViolation(
            f"the subnet in the network address is too small "
            f"(/{network.prefixlen})"
        )
    return network


def _ipv6_modes(data: dict, ip_version: int) -> dict:
    """The IPv6 mode fields a create sends: one of Horizon's pairs
    (``IPV6_MODES``), for an IPv6 subnet only."""
    modes = (data.get("ipv6_ra_mode"), data.get("ipv6_address_mode"))
    if ip_version != 6:
        if modes != (None, None):
            raise RuleViolation("IPv6 modes apply to IPv6 subnets only")
        return {}
    if modes not in IPV6_MODES:
        raise RuleViolation(
            f"IPv6 router advertisement mode {modes[0]} with address "
            f"mode {modes[1]} is not a supported pair"
        )
    fields = {}
    if modes[0]:
        fields["ipv6_ra_mode"] = modes[0]
    if modes[1]:
        fields["ipv6_address_mode"] = modes[1]
    return fields


def _gateway(data: dict, ip_version: int, body: dict) -> IpAddress | None:
    """The requested gateway, written to ``body``: None to disable it, the
    address when one is given (of the subnet's IP version)."""
    if data.get("no_gateway"):
        body["gateway_ip"] = None
        return None
    if not data.get("gateway_ip"):
        return None
    try:
        gateway = ipaddress.ip_address(data["gateway_ip"])
    except ValueError:
        raise RuleViolation(
            f"'{data['gateway_ip']}' is not an IP address"
        ) from None
    if gateway.version != ip_version:
        raise RuleViolation("the gateway IP and IP version are inconsistent")
    body["gateway_ip"] = str(gateway)
    return gateway


def _pools(pools) -> list[tuple[IpAddress, IpAddress]] | None:
    """Allocation pools as address pairs, each start no later than its
    end; None when not given."""
    if pools is None:
        return None
    result = []
    for pool in pools:
        start = _ip(pool.get("start"), "allocation pool")
        end = _ip(pool.get("end"), "allocation pool")
        if start.version != end.version or int(start) > int(end):
            raise RuleViolation(
                f"allocation pool start {start} is after its end {end}"
            )
        result.append((start, end))
    return result


def check_subnet_ranges(
    network: IpNetwork,
    gateway: IpAddress | None,
    pools: list[tuple[IpAddress, IpAddress]],
) -> None:
    """The checks Neutron's subnet validation (``ipam/utils.py``,
    ``db/ipam_backend_mixin.py``) refuses a request on, made before the
    call so the message names the field: the gateway inside the subnet and
    not its network or broadcast address, every pool inside the subnet,
    no two pools overlapping, and no pool holding the gateway. Horizon
    leaves all of these to Neutron."""
    if gateway is not None:
        if gateway not in network:
            raise RuleViolation(f"the gateway {gateway} is outside {network}")
        # A /31 or /32 has no network or broadcast address to avoid.
        if (
            network.version == 4
            and network.num_addresses > 2
            and gateway in (network.network_address, network.broadcast_address)
        ):
            raise RuleViolation(
                f"the gateway {gateway} is the network or broadcast "
                f"address of {network}"
            )
    for start, end in pools:
        if start not in network or end not in network:
            raise RuleViolation(
                f"allocation pool {start}-{end} is outside {network}"
            )
        if gateway is not None and int(start) <= int(gateway) <= int(end):
            raise RuleViolation(
                f"the gateway {gateway} is inside allocation pool "
                f"{start}-{end}"
            )
    ordered = sorted(pools, key=lambda pool: int(pool[0]))
    for (start, end), (next_start, next_end) in itertools.pairwise(ordered):
        if int(next_start) <= int(end):
            raise RuleViolation(
                f"allocation pools {start}-{end} and {next_start}-{next_end} "
                "overlap"
            )


def _host_routes(routes: list[dict], ip_version: int) -> list[dict]:
    """Host routes checked as Neutron checks them: a network destination
    and a next hop address, both of the subnet's IP version."""
    result = []
    for route in routes:
        try:
            destination = ipaddress.ip_network(
                route.get("destination") or "", strict=False
            )
        except ValueError:
            raise RuleViolation(
                f"host route destination '{route.get('destination')}' "
                "is not a network address"
            ) from None
        nexthop = _ip(route.get("nexthop"), "host route next hop")
        if destination.version != ip_version or nexthop.version != ip_version:
            raise RuleViolation(
                f"host route {route.get('destination')} via "
                f"{route.get('nexthop')} is not IPv{ip_version}"
            )
        result.append(
            {"destination": route["destination"], "nexthop": route["nexthop"]}
        )
    return result


def _network_or_none(cidr) -> IpNetwork | None:
    try:
        return ipaddress.ip_network(cidr or "", strict=False)
    except ValueError:
        return None


def _address_or_none(value) -> IpAddress | None:
    try:
        return ipaddress.ip_address(value or "")
    except ValueError:
        return None


def _network_first_host(network: IpNetwork) -> IpAddress:
    """The address Neutron makes the gateway when none is given."""
    return network.network_address + 1


def allowed_address_pairs(pairs: list[dict]) -> list[dict]:
    """A port's allowed address pairs checked and normalised as Horizon's
    ``AddAllowedAddressPairForm`` does: an IP address or a CIDR, and an
    optional MAC address (``ports/extensions/allowed_address_pairs``)."""
    result = []
    for pair in pairs:
        text = str(pair.get("ip_address") or "").strip()
        try:
            address = (
                str(ipaddress.ip_network(text, strict=False))
                if "/" in text
                else str(ipaddress.ip_address(text))
            )
        except ValueError:
            raise RuleViolation(
                f"'{text}' is not an IP address or CIDR"
            ) from None
        item = {"ip_address": address}
        mac = str(pair.get("mac_address") or "").strip()
        if mac:
            if not MAC_ADDRESS.fullmatch(mac):
                raise RuleViolation(f"'{mac}' is not a MAC address")
            item["mac_address"] = mac.lower()
        result.append(item)
    return result


def _ip(value, what: str):
    try:
        return ipaddress.ip_address(value)
    except (TypeError, ValueError):
        raise RuleViolation(f"{what} '{value}' is not an IP address") from None


def port_forwarding_body(data: dict) -> dict:
    """Neutron's port forwarding fields: a single port goes as an int, a
    ``start:end`` range as a string (``PortForwardingManager``).

    When both ports are given, the internal side is one port or a range
    as long as the external one (N:1 or N:N), the pairings Neutron's port
    ranges extension accepts; Horizon leaves the check to Neutron.
    """
    body: dict = {}
    if data.get("protocol"):
        body["protocol"] = str(data["protocol"]).lower()
    sizes: dict[str, int] = {}
    for key in ("internal_port", "external_port"):
        value = data.get(key)
        if value is None:
            continue
        value = str(value).strip()
        if ":" in value:
            low, _, high = value.partition(":")
            if not (_port(low) <= _port(high)):
                raise RuleViolation(
                    f"{key.replace('_', ' ')} range '{value}' is reversed"
                )
            body[f"{key}_range"] = f"{int(low)}:{int(high)}"
            sizes[key] = int(high) - int(low) + 1
        else:
            body[key] = _port(value)
            sizes[key] = 1
    internal = sizes.get("internal_port")
    external = sizes.get("external_port")
    if internal and external and internal not in (1, external):
        raise RuleViolation(
            "the internal port must be a single port or a range as long "
            "as the external one"
        )
    for key in ("internal_ip_address", "internal_port_id", "description"):
        if data.get(key) is not None:
            body[key] = data[key]
    return body


def _port(value: str) -> int:
    try:
        port = int(value)
    except ValueError:
        raise RuleViolation(f"'{value}' is not a port number") from None
    if not 1 <= port <= 65535:
        raise RuleViolation(f"port {port} is outside 1 to 65535")
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
            raise RuleViolation(
                f"destination '{route.get('destination')}' is not a CIDR"
            ) from None
        nexthop = _ip(route.get("nexthop"), "next hop")
        if destination.version != nexthop.version:
            raise RuleViolation(
                "the destination and next hop are not the same IP version"
            )
        result.append(
            {"destination": str(destination), "nexthop": str(nexthop)}
        )
    return result
