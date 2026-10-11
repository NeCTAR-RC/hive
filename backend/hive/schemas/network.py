"""Request bodies for the Network dashboard endpoints: networks, subnets,
ports, routers, floating IPs, port forwardings and trunks."""

from typing import Literal

from pydantic import BaseModel, Field

NAME = Field(default=None, max_length=255)


class AllocationPool(BaseModel):
    start: str = Field(min_length=1)
    end: str = Field(min_length=1)


class HostRoute(BaseModel):
    destination: str = Field(min_length=1)
    nexthop: str = Field(min_length=1)


class SubnetFields(BaseModel):
    """What a subnet create inside a network create carries."""

    name: str | None = NAME
    cidr: str | None = Field(default=None, max_length=64)
    ip_version: Literal[4, 6] = 4
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


class SubnetUpdate(BaseModel):
    name: str | None = NAME
    gateway_ip: str | None = Field(default=None, max_length=64)
    no_gateway: bool = False
    enable_dhcp: bool | None = None
    allocation_pools: list[AllocationPool] | None = None
    dns_nameservers: list[str] | None = None
    host_routes: list[HostRoute] | None = None


class NetworkCreate(BaseModel):
    name: str | None = NAME
    admin_state_up: bool = True
    mtu: int | None = Field(default=None, ge=68, le=65535)
    availability_zone_hints: list[str] | None = None
    subnet: SubnetFields | None = None


class NetworkUpdate(BaseModel):
    name: str | None = NAME
    admin_state_up: bool | None = None


class PortCreate(BaseModel):
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


class PortUpdate(BaseModel):
    name: str | None = NAME
    admin_state_up: bool | None = None
    port_security_enabled: bool | None = None
    security_groups: list[str] | None = None


class RouterCreate(BaseModel):
    name: str | None = NAME
    admin_state_up: bool = True
    external_network_id: str | None = None
    availability_zone_hints: list[str] | None = None


class RouterUpdate(BaseModel):
    name: str | None = NAME
    admin_state_up: bool | None = None


class SetGateway(BaseModel):
    network_id: str = Field(min_length=1)


class AddInterface(BaseModel):
    subnet_id: str = Field(min_length=1)
    ip_address: str | None = Field(default=None, max_length=64)


class StaticRoutes(BaseModel):
    routes: list[HostRoute]


class FloatingIpAllocate(BaseModel):
    floating_network_id: str = Field(min_length=1)
    floating_ip_address: str | None = Field(default=None, max_length=64)
    description: str | None = NAME
    dns_domain: str | None = NAME
    dns_name: str | None = NAME


class FloatingIpAssociate(BaseModel):
    port_id: str = Field(min_length=1)
    fixed_ip_address: str | None = Field(default=None, max_length=64)


class PortForwardingCreate(BaseModel):
    protocol: Literal["tcp", "udp"]
    internal_port_id: str = Field(min_length=1)
    internal_ip_address: str = Field(min_length=1, max_length=64)
    internal_port: str = Field(min_length=1, max_length=11)
    external_port: str = Field(min_length=1, max_length=11)
    description: str | None = NAME


class PortForwardingUpdate(BaseModel):
    protocol: Literal["tcp", "udp"] | None = None
    internal_port_id: str | None = None
    internal_ip_address: str | None = Field(default=None, max_length=64)
    internal_port: str | None = Field(default=None, max_length=11)
    external_port: str | None = Field(default=None, max_length=11)
    description: str | None = NAME


class Subport(BaseModel):
    port_id: str = Field(min_length=1)
    segmentation_type: Literal["vlan", "inherit"] = "vlan"
    segmentation_id: int | None = Field(default=None, ge=1, le=4094)


class TrunkCreate(BaseModel):
    name: str | None = NAME
    description: str | None = NAME
    admin_state_up: bool = True
    port_id: str = Field(min_length=1)
    sub_ports: list[Subport] = []


class TrunkUpdate(BaseModel):
    name: str | None = NAME
    description: str | None = NAME
    admin_state_up: bool | None = None


class Subports(BaseModel):
    sub_ports: list[Subport] = Field(min_length=1)


class SubportIds(BaseModel):
    port_ids: list[str] = Field(min_length=1)
