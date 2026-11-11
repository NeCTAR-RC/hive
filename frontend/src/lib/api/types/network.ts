/**
 * Network (Neutron): networks, subnets, ports, routers, floating IPs,
 * trunks, the topology and security groups.
 *
 * Aliases of the generated contract (`../generated/openapi`); the backend's
 * models are the source of truth.
 */
import type { components } from "../generated/openapi";

type Schemas = components["schemas"];

export type Subnet = Schemas["Subnet"];
export type Network = Schemas["Network"];
export type AllocationPool = Schemas["AllocationPool"];
export type HostRoute = Schemas["HostRoute"];
export type SubnetDetail = Schemas["SubnetDetail"];
export type FixedIp = Schemas["FixedIp"];
export type Port = Schemas["Port"];
export type NetworkDetail = Schemas["NetworkDetail"];
export type RouterGateway = Schemas["RouterGateway"];
export type Router = Schemas["Router"];
export type RouterInterface = Schemas["RouterInterface"];
export type RouterInterfaceKind = RouterInterface["kind"];
export type RouterDetail = Schemas["RouterDetail"];

/** A subnet a router may take an interface on, with its network named. */
export type InterfaceCandidate = Schemas["InterfaceCandidate"];

export type FloatingIp = Schemas["FloatingIp"];

/** An address a floating IP can go to; `id` is `<port id>_<address>`. */
export type FloatingIpTarget = Schemas["FloatingIpTarget"];

export type PortForwarding = Schemas["PortForwarding"];
export type TrunkSubport = Schemas["TrunkSubport"];
export type Trunk = Schemas["Trunk"];
export type TrunkOptions = Schemas["TrunkOptions"];
export type NetworkExtensions = Schemas["NetworkExtensions"];
export type NetworkQuota = Schemas["NetworkQuota"];
export type SubnetPool = Schemas["SubnetPool"];
export type NetworkOptions = Schemas["NetworkOptions"];
export type TopologyRouter = Schemas["TopologyRouter"];
export type TopologyPort = Schemas["TopologyPort"];
export type TopologyServer = Schemas["TopologyServer"];
export type Topology = Schemas["Topology"];
export type SubnetFields = Schemas["SubnetFields"];

/** The create body (the backend's `NetworkCreate`). */
export type NetworkCreateRequest = Schemas["NetworkCreate"];

/** The create body (the backend's `SubnetCreate`). */
export type SubnetCreateRequest = Schemas["SubnetCreate"];

/** The edit body (the backend's `SubnetUpdate`). */
export type SubnetUpdateRequest = Schemas["SubnetUpdate"];

/** The create body (the backend's `PortCreate`). */
export type PortCreateRequest = Schemas["PortCreate"];

/** The edit body (the backend's `PortUpdate`). */
export type PortUpdateRequest = Schemas["PortUpdate"];

/** An allowed address pair as a port keeps it. */
export type PortAddressPair = Schemas["PortAddressPair"];

/** The body that replaces a port's allowed address pairs (the backend's
 * `AllowedAddressPairs`). */
export type AllowedAddressPairsRequest = Schemas["AllowedAddressPairs"];

/** The browser's own address, as the backend sees it. */
export type MyAddress = Schemas["MyAddress"];

/** The create body (the backend's `RouterCreate`). */
export type RouterCreateRequest = Schemas["RouterCreate"];

/** The body that adds a router interface (the backend's `AddInterface`). */
export type AddInterfaceRequest = Schemas["AddInterface"];

export type AddInterfaceResult = Schemas["AddInterfaceResult"];

/** The allocate body (the backend's `FloatingIpAllocate`). */
export type FloatingIpAllocateRequest = Schemas["FloatingIpAllocate"];

/** The create body (the backend's `PortForwardingCreate`). */
export type PortForwardingRequest = Schemas["PortForwardingCreate"];

/** One subport to add to a trunk (the backend's `Subport`). */
export type TrunkSubportRequest = Schemas["Subport"];

/** The create body (the backend's `TrunkCreate`). */
export type TrunkCreateRequest = Schemas["TrunkCreate"];

export type AttachablePort = Schemas["AttachablePort"];
export type SecurityGroupRule = Schemas["SecurityGroupRule"];

/** A security group as the list shows it, with its rule count. */
export type SecurityGroup = Schemas["SecurityGroup"];

/** One security group with its rules. */
export type SecurityGroupDetail = Schemas["SecurityGroupDetail"];

export type RulePreset = Schemas["RulePreset"];
export type RulePresets = Schemas["RulePresets"];
export type RuleCreate = Schemas["RuleCreate"];
