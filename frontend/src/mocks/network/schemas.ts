// The request bodies the mocked network endpoints accept, each tied to the
// frontend's request type so the two cannot drift apart unnoticed.
import { z } from "zod";
import type {
  AddInterfaceRequest,
  AllowedAddressPairsRequest,
  FloatingIpAllocateRequest,
  NetworkCreateRequest,
  PortCreateRequest,
  PortForwardingRequest,
  PortUpdateRequest,
  RouterCreateRequest,
  SubnetCreateRequest,
  SubnetUpdateRequest,
  TrunkCreateRequest,
  TrunkSubportRequest,
} from "../../lib/api/types/network";

const hostRoute = z.object({ destination: z.string(), nexthop: z.string() });
const allocationPool = z.object({ start: z.string(), end: z.string() });
const ipv6Mode = z.enum(["slaac", "dhcpv6-stateful", "dhcpv6-stateless"]);

const subnetFields = z.object({
  name: z.string().optional(),
  cidr: z.string().optional(),
  ip_version: z.union([z.literal(4), z.literal(6)]).optional(),
  ipv6_ra_mode: ipv6Mode.optional(),
  ipv6_address_mode: ipv6Mode.optional(),
  gateway_ip: z.string().optional(),
  no_gateway: z.boolean().optional(),
  enable_dhcp: z.boolean().optional(),
  allocation_pools: z.array(allocationPool).optional(),
  dns_nameservers: z.array(z.string()).optional(),
  host_routes: z.array(hostRoute).optional(),
  subnetpool_id: z.string().optional(),
  prefixlen: z.number().int().optional(),
});

const stateUpdate = z.object({
  name: z.string().optional(),
  admin_state_up: z.boolean().optional(),
});

export const networkCreateBody = z.object({
  name: z.string().optional(),
  admin_state_up: z.boolean().optional(),
  mtu: z.number().int().min(68).max(9000).optional(),
  port_security_enabled: z.boolean().optional(),
  availability_zone_hints: z.array(z.string()).optional(),
  subnet: subnetFields.optional(),
}) satisfies z.ZodType<NetworkCreateRequest>;

export const networkUpdateBody = stateUpdate;

export const subnetCreateBody = subnetFields.extend({
  network_id: z.string().min(1),
}) satisfies z.ZodType<SubnetCreateRequest>;

export const subnetUpdateBody = z.object({
  name: z.string().optional(),
  gateway_ip: z.string().optional(),
  no_gateway: z.boolean().optional(),
  enable_dhcp: z.boolean().optional(),
  allocation_pools: z.array(allocationPool).optional(),
  dns_nameservers: z.array(z.string()).optional(),
  host_routes: z.array(hostRoute).optional(),
}) satisfies z.ZodType<SubnetUpdateRequest>;

export const portCreateBody = z.object({
  network_id: z.string().min(1),
  name: z.string().optional(),
  admin_state_up: z.boolean().optional(),
  device_id: z.string().optional(),
  device_owner: z.string().optional(),
  subnet_id: z.string().optional(),
  fixed_ip: z.string().optional(),
  mac_address: z.string().optional(),
  port_security_enabled: z.boolean().optional(),
  security_groups: z.array(z.string()).optional(),
}) satisfies z.ZodType<PortCreateRequest>;

export const portUpdateBody = z.object({
  name: z.string().optional(),
  admin_state_up: z.boolean().optional(),
  port_security_enabled: z.boolean().optional(),
  security_groups: z.array(z.string()).optional(),
}) satisfies z.ZodType<PortUpdateRequest>;

export const allowedAddressPairsBody = z.object({
  pairs: z.array(
    z.object({
      ip_address: z.string().min(1),
      mac_address: z.string().optional(),
    }),
  ),
}) satisfies z.ZodType<AllowedAddressPairsRequest>;

export const routerCreateBody = z.object({
  name: z.string().optional(),
  admin_state_up: z.boolean().optional(),
  external_network_id: z.string().optional(),
  availability_zone_hints: z.array(z.string()).optional(),
}) satisfies z.ZodType<RouterCreateRequest>;

export const routerUpdateBody = stateUpdate;

export const routerGatewayBody = z.object({ network_id: z.string().min(1) });

export const addInterfaceBody = z.object({
  subnet_id: z.string().min(1),
  ip_address: z.string().optional(),
}) satisfies z.ZodType<AddInterfaceRequest>;

export const routerRoutesBody = z.object({ routes: z.array(hostRoute) });

export const floatingIpAllocateBody = z.object({
  floating_network_id: z.string().min(1),
  floating_ip_address: z.string().optional(),
  description: z.string().optional(),
  dns_domain: z.string().optional(),
  dns_name: z.string().optional(),
}) satisfies z.ZodType<FloatingIpAllocateRequest>;

export const floatingIpAssociateBody = z.object({
  port_id: z.string().min(1),
  fixed_ip_address: z.string().optional(),
});

const portForwarding = z.object({
  protocol: z.enum(["tcp", "udp"]),
  internal_port_id: z.string().min(1),
  internal_ip_address: z.string().min(1),
  internal_port: z.string().min(1),
  external_port: z.string().min(1),
  description: z.string().optional(),
});

export const portForwardingCreateBody =
  portForwarding satisfies z.ZodType<PortForwardingRequest>;

export const portForwardingUpdateBody =
  portForwarding.partial() satisfies z.ZodType<Partial<PortForwardingRequest>>;

const trunkSubport = z.object({
  port_id: z.string().min(1),
  segmentation_type: z.enum(["vlan", "inherit"]),
  segmentation_id: z.number().int().optional(),
}) satisfies z.ZodType<TrunkSubportRequest>;

export const trunkCreateBody = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  admin_state_up: z.boolean().optional(),
  port_id: z.string().min(1),
  sub_ports: z.array(trunkSubport),
}) satisfies z.ZodType<TrunkCreateRequest>;

export const trunkUpdateBody = stateUpdate.extend({
  description: z.string().optional(),
});

export const subportsAddBody = z.object({ sub_ports: z.array(trunkSubport) });

export const subportsRemoveBody = z.object({ port_ids: z.array(z.string()) });
