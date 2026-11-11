"""Replies of the network endpoints: networks, subnets and ports, routers,
floating IPs and their port forwardings, trunks, the topology payload and
security groups.

``Network``, ``SecurityGroup`` and ``FloatingIp`` are also what the
compute, database and load balancer panels receive from the network
service, so their fields change only together with those panels.
"""

from typing import Literal

from pydantic import RootModel

from hive.schemas.responses import Accepted, Items, ResponseModel


class Subnet(ResponseModel):
    """A subnet as a network listing embeds it."""

    id: str
    name: str | None
    cidr: str | None
    ip_version: Literal[4, 6] | None
    gateway_ip: str | None
    enable_dhcp: bool | None


class Network(ResponseModel):
    """A network with the Nectar classification: ``is_classic`` marks the
    placeholder Nova swaps for a provider network, ``is_project`` one the
    project owns. ``name`` falls back to the id."""

    id: str
    name: str
    description: str
    status: str | None
    admin_state_up: bool | None
    is_shared: bool
    is_external: bool
    is_classic: bool
    is_project: bool
    project_id: str | None
    mtu: int | None
    port_security_enabled: bool | None
    availability_zones: list[str]
    tags: list[str]
    subnets: list[Subnet]
    created_at: str | None
    updated_at: str | None
    # The project's ports on the network that Neutron would not remove with
    # it (all but the DHCP and metadata ports): a network that has any
    # cannot be deleted. Counted for the Networks panel's listing and a
    # network's page only; None where the pickers list networks.
    ports_in_use: int | None = None


class NetworkAllocationPool(ResponseModel):
    start: str
    end: str


class NetworkHostRoute(ResponseModel):
    """A subnet host route or a router static route."""

    destination: str
    nexthop: str


class SubnetDetail(Subnet):
    """The full subnet, for the subnet pages and the edit form."""

    network_id: str | None
    project_id: str | None
    allocation_pools: list[NetworkAllocationPool]
    dns_nameservers: list[str]
    host_routes: list[NetworkHostRoute]
    subnetpool_id: str | None
    ipv6_address_mode: str | None
    ipv6_ra_mode: str | None
    created_at: str | None
    updated_at: str | None


class FixedIp(ResponseModel):
    ip_address: str | None
    subnet_id: str | None


class PortAddressPair(ResponseModel):
    """An allowed address pair: an IP address or CIDR, and the MAC address
    it may use."""

    ip_address: str
    mac_address: str | None


class Port(ResponseModel):
    """A port; ``device_type`` is Horizon's reading of the device owner
    ('compute', 'loadbalancer' or the raw owner). ``device_name`` names
    the instance or router behind it where a port's page or its
    network's page could read it, and is None elsewhere."""

    id: str
    name: str
    description: str
    network_id: str | None
    network_name: str | None
    project_id: str | None
    status: str | None
    admin_state_up: bool | None
    mac_address: str | None
    device_id: str
    device_owner: str
    device_type: str | None
    device_name: str | None
    fixed_ips: list[FixedIp]
    security_groups: list[str]
    port_security_enabled: bool | None
    allowed_address_pairs: list[PortAddressPair]
    vnic_type: str | None
    trunk_id: str | None
    created_at: str | None
    updated_at: str | None


class NetworkDetail(Network):
    """A network's page: its full subnets and the project's ports on it."""

    subnets: list[SubnetDetail]
    ports: list[Port]


class AttachablePort(ResponseModel):
    """A port an instance may be attached to, its addresses as strings."""

    id: str
    name: str
    network_id: str | None
    network_name: str | None
    mac_address: str | None
    fixed_ips: list[str]
    status: str | None


class RouterGateway(ResponseModel):
    network_id: str | None
    network_name: str | None
    enable_snat: bool | None
    fixed_ips: list[FixedIp]


class Router(ResponseModel):
    """A router; ``external_gateway`` is None when it has no gateway."""

    id: str
    name: str
    description: str
    status: str | None
    admin_state_up: bool | None
    project_id: str | None
    external_gateway: RouterGateway | None
    routes: list[NetworkHostRoute]
    availability_zones: list[str]
    created_at: str | None
    updated_at: str | None


class RouterInterface(Port):
    """A port on a router, with the role its device owner gives it."""

    kind: Literal["gateway", "interface", "ha", "other"]


class RouterDetail(Router):
    interfaces: list[RouterInterface]


class InterfaceCandidate(Subnet):
    """A subnet a router may take an interface on, with its network.
    ``overlaps`` is the address range of a subnet already on the router
    that this one overlaps (Neutron refuses the interface), else None."""

    network_id: str | None
    network_name: str | None
    overlaps: str | None


class AddInterfaceResult(Accepted):
    """An interface the router took; ``ip_address`` is None when the
    address could not be read back."""

    port_id: str | None
    subnet_id: str
    ip_address: str | None


class FloatingIp(ResponseModel):
    """A floating IP with the pool's name and the instance (or load
    balancer) behind its port."""

    id: str
    floating_ip_address: str | None
    floating_network_id: str | None
    pool_name: str | None
    fixed_ip_address: str | None
    port_id: str | None
    router_id: str | None
    status: str | None
    description: str
    dns_name: str
    dns_domain: str
    instance_id: str | None
    instance_name: str | None
    instance_type: str | None
    port_forwarding_count: int
    created_at: str | None
    updated_at: str | None


class FloatingIpTarget(ResponseModel):
    """A port and IPv4 address a floating IP may be associated with; the
    id is ``<port id>_<address>``, unique per address."""

    id: str
    port_id: str
    ip_address: str
    instance_id: str | None
    instance_name: str | None
    name: str


class PortForwarding(ResponseModel):
    """A floating IP port forwarding rule; the ports are strings because
    either may be a ``start:end`` range."""

    id: str
    floating_ip_id: str | None
    floating_ip_address: str | None
    protocol: str
    external_port: str
    internal_port: str
    internal_ip_address: str | None
    internal_port_id: str | None
    description: str


class TrunkSubport(ResponseModel):
    port_id: str | None
    port_name: str | None
    segmentation_type: str | None
    segmentation_id: int | None


class Trunk(ResponseModel):
    id: str
    name: str
    description: str
    status: str | None
    admin_state_up: bool | None
    project_id: str | None
    port_id: str | None
    port_name: str | None
    sub_ports: list[TrunkSubport]
    subport_count: int
    created_at: str | None
    updated_at: str | None


class TrunkOptions(ResponseModel):
    """Ports that may become a trunk's parent or one of its subports."""

    parents: list[Port]
    subports: list[Port]


class NetworkExtensions(ResponseModel):
    """Which optional Neutron features the panels may offer."""

    port_forwarding: bool
    trunk: bool
    dns_integration: bool
    extraroute: bool
    network_availability_zone: bool
    router_availability_zone: bool
    subnet_allocation: bool
    port_security: bool
    allowed_address_pairs: bool


class NetworkQuotaUsage(ResponseModel):
    used: int
    reserved: int
    limit: int


class NetworkQuota(RootModel[dict[str, NetworkQuotaUsage]]):
    """Usage per Neutron quota resource (``network``, ``floatingip``),
    only for the resources Neutron reports; a limit of -1 is unlimited."""


class SubnetPool(ResponseModel):
    id: str
    name: str
    prefixes: list[str]
    ip_version: int | None
    min_prefixlen: int | None
    max_prefixlen: int | None
    default_prefixlen: int | None


class NetworkAvailabilityZones(ResponseModel):
    """Available zones per resource; empty where Neutron lacks the zone
    extension for it."""

    network: list[str]
    router: list[str]


class FloatingNetwork(ResponseModel):
    """An external network floating IPs and router gateways may use."""

    id: str
    name: str


class NetworkOptionsError(ResponseModel):
    """Why one section of the form options could not be loaded."""

    error: str
    message: str


class NetworkOptions(ResponseModel):
    """What the network, subnet, port, router and floating IP forms need.
    A section that failed is None and explained under ``errors``.
    ``floating_ip_address_allowed`` says whether the allocate form may
    offer a chosen address (``HIVE_FLOATING_IP_ADDRESS_ALLOWED``)."""

    extensions: NetworkExtensions | None
    availability_zones: NetworkAvailabilityZones | None
    subnetpools: list[SubnetPool] | None
    floating_networks: list[FloatingNetwork] | None
    quota: NetworkQuota | None
    default_dns_nameservers: list[str]
    enable_ipv6: bool
    floating_ip_address_allowed: bool
    errors: dict[str, NetworkOptionsError]


class MyAddress(ResponseModel):
    """The address the browser's requests come from, as the ingress
    reports it, for a security group rule open to the user alone; None
    when it is unknown."""

    address: str | None
    ip_version: Literal[4, 6] | None


class TopologyRouter(ResponseModel):
    id: str
    name: str
    status: str | None
    admin_state_up: bool | None
    external_network_id: str | None


class TopologyPort(ResponseModel):
    """A port the topology draws. A router's gateway gets a synthetic one
    (id ``gateway-<router id>``), as users cannot see the real port."""

    id: str
    name: str
    network_id: str | None
    device_id: str
    device_owner: str
    status: str | None
    fixed_ips: list[FixedIp]


class TopologyServer(ResponseModel):
    id: str
    name: str
    status: str | None


class Topology(ResponseModel):
    """What the Network Topology panel lays out: external networks first,
    then the rest by name."""

    networks: list[Network]
    routers: list[TopologyRouter]
    ports: list[TopologyPort]
    servers: list[TopologyServer]


class SecurityGroupRule(ResponseModel):
    """A security group rule; ``open_to_the_world`` flags a remote of
    0.0.0.0/0 or ::/0 so the SPA can warn about it."""

    id: str
    direction: Literal["ingress", "egress"]
    ethertype: Literal["IPv4", "IPv6"]
    protocol: str | None
    port_range_min: int | None
    port_range_max: int | None
    remote_ip_prefix: str | None
    remote_group_id: str | None
    description: str
    open_to_the_world: bool


class SecurityGroup(ResponseModel):
    """A security group as listings show it: its rules counted, not
    listed."""

    id: str
    name: str
    description: str
    project_id: str | None
    created_at: str | None
    updated_at: str | None
    rule_count: int


class SecurityGroupDetail(SecurityGroup):
    """A security group with its rules, for its page and after a write."""

    rules: list[SecurityGroupRule]


class RulePreset(ResponseModel):
    """A Nectar rule preset (``SECURITY_GROUP_RULES``); ``port`` is None
    for presets that open the protocol's whole range."""

    id: str
    name: str
    protocol: str
    port: int | None = None


class RulePresets(Items[RulePreset]):
    """The rule presets and the remote CIDR the rule form starts with
    (empty on Nectar: the user must type one)."""

    default_remote_cidr: str
