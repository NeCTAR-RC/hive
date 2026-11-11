"""Request bodies for the Network dashboard endpoints: networks, subnets,
ports, routers, floating IPs, port forwardings and trunks."""

from typing import Literal

from pydantic import Field

from hive.schemas import StrictModel, UpdateModel

NAME = Field(default=None, max_length=255)


class AllocationPool(StrictModel):
    start: str = Field(min_length=1)
    end: str = Field(min_length=1)


class HostRoute(StrictModel):
    destination: str = Field(min_length=1)
    nexthop: str = Field(min_length=1)


# Neutron's IPv6 router advertisement and address modes.
Ipv6Mode = Literal["slaac", "dhcpv6-stateful", "dhcpv6-stateless"]


class SubnetFields(StrictModel):
    """What a subnet create inside a network create carries. The IPv6
    modes count only for an IPv6 subnet, as one of the pairs Horizon's
    menu offers (``nectar.networks.IPV6_MODES``)."""

    name: str | None = NAME
    cidr: str | None = Field(default=None, max_length=64)
    ip_version: Literal[4, 6] = 4
    ipv6_ra_mode: Ipv6Mode | None = None
    ipv6_address_mode: Ipv6Mode | None = None
    gateway_ip: str | None = Field(default=None, max_length=64)
    no_gateway: bool = False
    enable_dhcp: bool = True
    allocation_pools: list[AllocationPool] | None = None
    dns_nameservers: list[str] | None = None
    host_routes: list[HostRoute] | None = None
    subnetpool_id: str | None = None
    prefixlen: int | None = Field(default=None, ge=0, le=128)


class SubnetCreate(SubnetFields):
    network_id: str = Field(min_length=1)


class SubnetUpdate(StrictModel):
    name: str | None = NAME
    gateway_ip: str | None = Field(default=None, max_length=64)
    no_gateway: bool = False
    enable_dhcp: bool | None = None
    allocation_pools: list[AllocationPool] | None = None
    dns_nameservers: list[str] | None = None
    host_routes: list[HostRoute] | None = None


class NetworkCreate(StrictModel):
    """A new network. The MTU runs from Horizon's minimum (68) to 9000,
    the largest jumbo frame; Neutron refuses one above what the network
    type can carry. ``port_security_enabled`` needs the port-security
    extension."""

    name: str | None = NAME
    admin_state_up: bool = True
    mtu: int | None = Field(default=None, ge=68, le=9000)
    port_security_enabled: bool | None = None
    availability_zone_hints: list[str] | None = None
    subnet: SubnetFields | None = None


class NetworkUpdate(UpdateModel):
    name: str | None = NAME
    admin_state_up: bool | None = None


class PortCreate(StrictModel):
    network_id: str = Field(min_length=1)
    name: str | None = NAME
    admin_state_up: bool = True
    device_id: str | None = Field(default=None, max_length=255)
    device_owner: str | None = Field(default=None, max_length=255)
    subnet_id: str | None = None
    fixed_ip: str | None = Field(default=None, max_length=64)
    mac_address: str | None = Field(default=None, max_length=32)
    port_security_enabled: bool | None = None
    security_groups: list[str] | None = None


class PortUpdate(StrictModel):
    name: str | None = NAME
    admin_state_up: bool | None = None
    port_security_enabled: bool | None = None
    security_groups: list[str] | None = None


class AllowedAddressPair(StrictModel):
    """An extra address a port may send from: an IP address or a CIDR,
    and optionally a MAC address (the port's own when left out)."""

    ip_address: str = Field(min_length=1, max_length=64)
    mac_address: str | None = Field(default=None, max_length=32)


class AllowedAddressPairs(StrictModel):
    """Every allowed address pair the port keeps; Neutron stores them as
    one list, so adding or deleting one sends the list that remains."""

    pairs: list[AllowedAddressPair]


class RouterCreate(StrictModel):
    name: str | None = NAME
    admin_state_up: bool = True
    external_network_id: str | None = None
    availability_zone_hints: list[str] | None = None


class RouterUpdate(UpdateModel):
    name: str | None = NAME
    admin_state_up: bool | None = None


class SetGateway(StrictModel):
    network_id: str = Field(min_length=1)


class AddInterface(StrictModel):
    subnet_id: str = Field(min_length=1)
    ip_address: str | None = Field(default=None, max_length=64)


class StaticRoutes(StrictModel):
    routes: list[HostRoute]


class FloatingIpAllocate(StrictModel):
    floating_network_id: str = Field(min_length=1)
    floating_ip_address: str | None = Field(default=None, max_length=64)
    description: str | None = NAME
    dns_domain: str | None = NAME
    dns_name: str | None = NAME


class FloatingIpAssociate(StrictModel):
    port_id: str = Field(min_length=1)
    fixed_ip_address: str | None = Field(default=None, max_length=64)


class PortForwardingCreate(StrictModel):
    protocol: Literal["tcp", "udp"]
    internal_port_id: str = Field(min_length=1)
    internal_ip_address: str = Field(min_length=1, max_length=64)
    internal_port: str = Field(min_length=1, max_length=11)
    external_port: str = Field(min_length=1, max_length=11)
    description: str | None = NAME


class PortForwardingUpdate(StrictModel):
    protocol: Literal["tcp", "udp"] | None = None
    internal_port_id: str | None = None
    internal_ip_address: str | None = Field(default=None, max_length=64)
    internal_port: str | None = Field(default=None, max_length=11)
    external_port: str | None = Field(default=None, max_length=11)
    description: str | None = NAME


class Subport(StrictModel):
    port_id: str = Field(min_length=1)
    segmentation_type: Literal["vlan", "inherit"] = "vlan"
    segmentation_id: int | None = Field(default=None, ge=1, le=4094)


class TrunkCreate(StrictModel):
    name: str | None = NAME
    description: str | None = NAME
    admin_state_up: bool = True
    port_id: str = Field(min_length=1)
    sub_ports: list[Subport] = Field(default_factory=list)


class TrunkUpdate(UpdateModel):
    name: str | None = NAME
    description: str | None = NAME
    admin_state_up: bool | None = None


class Subports(StrictModel):
    sub_ports: list[Subport] = Field(min_length=1)


class SubportIds(StrictModel):
    port_ids: list[str] = Field(min_length=1)
