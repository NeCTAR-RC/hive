// The form schemas of the Networks panel's dialogs: create and edit a
// network, create or edit a subnet, create or edit a port.
import { z } from "zod";
import { isIpAddress } from "../../../../lib/net";
import { NAME } from "../../schema";
import {
  addSubnetIssues,
  IPV6_MODES,
  type Ipv6ModeId,
  type SubnetFormValues,
} from "../subnetRules";

/** Horizon's MTU floor and the largest jumbo frame; Neutron refuses an MTU
 * above what the network type carries. */
export const MTU_RANGE = { min: 68, max: 9000 } as const;
/** The smallest MTU an IPv6 subnet works on (Horizon's MTU help text). */
export const IPV6_MIN_MTU = 1280;

/** The subnet fields, alone or nested under `subnet` in the network form. */
const subnetShape = {
  name: NAME,
  address_source: z.enum(["manual", "pool"]),
  subnetpool_id: z.string(),
  prefixlen: z.string(),
  cidr: z.string().trim(),
  ip_version: z.enum(["4", "6"]),
  ipv6_modes: z.custom<Ipv6ModeId>((value) =>
    IPV6_MODES.some((mode) => mode.id === value),
  ),
  gateway_ip: z.string().trim(),
  no_gateway: z.boolean(),
  enable_dhcp: z.boolean(),
  allocation_pools: z.string(),
  dns_nameservers: z.string(),
  host_routes: z.string(),
};

/** Why `mtu` (blank for the default) cannot be the network's MTU, or null. */
export function checkMtu(mtu: string, ipv6Subnet: boolean): string | null {
  if (!mtu) return null;
  if (!/^\d+$/.test(mtu)) return "Enter a whole number of bytes";
  const bytes = Number(mtu);
  if (bytes < MTU_RANGE.min || bytes > MTU_RANGE.max) {
    return `The MTU runs from ${MTU_RANGE.min} to ${MTU_RANGE.max} bytes`;
  }
  if (ipv6Subnet && bytes < IPV6_MIN_MTU) {
    return `An IPv6 subnet needs an MTU of at least ${IPV6_MIN_MTU} bytes`;
  }
  return null;
}

/**
 * The create network form: the network, and its first subnet checked only
 * while "Create a subnet" is on. IPv6 addresses pass only where the cloud
 * enables them.
 */
export function createNetworkSchema(enableIpv6: boolean) {
  return z
    .object({
      name: NAME,
      admin_state_up: z.boolean(),
      port_security_enabled: z.boolean(),
      with_subnet: z.boolean(),
      availability_zone_hints: z.array(z.string()),
      mtu: z.string().trim(),
      subnet: z.object(subnetShape),
    })
    .superRefine((values, ctx) => {
      const mtu = checkMtu(
        values.mtu,
        values.with_subnet && values.subnet.ip_version === "6",
      );
      if (mtu) ctx.addIssue({ code: "custom", path: ["mtu"], message: mtu });
      if (values.with_subnet) {
        addSubnetIssues(values.subnet, ctx, { isCreate: true, enableIpv6 }, [
          "subnet",
        ]);
      }
    });
}

export type CreateNetworkValues = z.infer<
  ReturnType<typeof createNetworkSchema>
>;

/** The edit network form: its name and admin state. */
export const editNetworkSchema = z.object({
  name: NAME,
  admin_state_up: z.boolean(),
});

export type EditNetworkValues = z.infer<typeof editNetworkSchema>;

/**
 * The subnet form; the address is checked only when creating, and an
 * edit's gateway and pools against the stored subnet (`previous`) only
 * when it changes them.
 */
export function subnetSchema(
  isCreate: boolean,
  enableIpv6: boolean,
  previous?: SubnetFormValues,
) {
  return z
    .object(subnetShape)
    .superRefine((values, ctx) =>
      addSubnetIssues(values, ctx, { isCreate, enableIpv6, previous }),
    );
}

/** The port form, for creating and editing alike. */
export const portSchema = z
  .object({
    name: NAME,
    admin_state_up: z.boolean(),
    device_id: NAME,
    device_owner: NAME,
    specify_ip: z.enum(["", "subnet", "fixed"]),
    subnet_id: z.string(),
    fixed_ip: z.string().trim(),
    mac_address: z.string().trim(),
    port_security_enabled: z.boolean(),
    security_groups: z.array(z.string()),
  })
  .superRefine((values, ctx) => {
    if (values.specify_ip === "subnet" && !values.subnet_id) {
      ctx.addIssue({
        code: "custom",
        path: ["subnet_id"],
        message: "Choose a subnet",
      });
    }
    if (values.specify_ip === "fixed") {
      if (!values.fixed_ip) {
        ctx.addIssue({
          code: "custom",
          path: ["fixed_ip"],
          message: "Enter the fixed IP address",
        });
      } else if (!isIpAddress(values.fixed_ip)) {
        ctx.addIssue({
          code: "custom",
          path: ["fixed_ip"],
          message: "Enter an IP address",
        });
      }
    }
    if (
      values.mac_address &&
      !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(values.mac_address)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["mac_address"],
        message: "Enter a MAC address such as fa:16:3e:00:00:01",
      });
    }
  });

export type PortValues = z.infer<typeof portSchema>;
