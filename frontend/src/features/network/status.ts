// Status presentation and row action rules for the Network panels, ported
// from Horizon's networks, routers, floating_ips, floating_ip_portforwardings
// and trunks tables.py so the menus offer what Horizon offers.
import type {
  FloatingIp,
  Network,
  NetworkExtensions,
  NetworkQuota,
  Port,
  Router,
  RouterInterface,
  SecurityGroup,
  SubnetDetail,
  Trunk,
} from "../../lib/api/types/network";
import { offerActions, type ActionTable } from "../../lib/actions";
import { defineStatus } from "../../lib/status";

const readers = defineStatus({
  transitional: ["BUILD", "PENDING_CREATE", "PENDING_UPDATE"],
  success: ["ACTIVE"],
  danger: ["ERROR", "DEGRADED"],
  labels: { "N/A": "N/A" },
  missing: "",
});

/** The tone of a neutron status. */
export const statusTone = readers.tone;
/** A neutron status in words. */
export const statusLabel = readers.label;

/** Whether the item is between states (building or pending). */
export function isTransitional(item: { status: string | null }) {
  return readers.isTransitional(item.status);
}

/** Horizon's "UP"/"DOWN" admin state words. */
export function adminStateLabel(up: boolean | null | undefined): string {
  if (up === null || up === undefined) return "";
  return up ? "Up" : "Down";
}

/** Horizon's Type column on router interfaces. */
export function interfaceKindLabel(kind: RouterInterface["kind"]): string {
  switch (kind) {
    case "gateway":
      return "External gateway";
    case "interface":
      return "Internal interface";
    case "ha":
      return "HA interface";
    default:
      return "";
  }
}

/** Horizon's Attached Device column on ports: the raw owner. */
export function portAttachmentLabel(port: Port): string {
  if (port.device_owner) return port.device_owner;
  return port.device_id ? "Attached" : "Detached";
}

/** Owners whose device is a router (Horizon's ROUTER_INTERFACE_OWNERS,
 * the gateway and the HA ports). */
const ROUTER_OWNERS = new Set([
  "network:router_interface",
  "network:router_interface_distributed",
  "network:ha_router_replicated_interface",
  "network:router_gateway",
  "network:router_ha_interface",
]);

/** The instance or router a port is attached to, which Hive has a page
 * for: its kind, id and name (the id where the name is unknown). */
export interface PortDevice {
  kind: "instance" | "router";
  id: string;
  name: string;
}

/**
 * The device behind `port`, read from its owner as Horizon's
 * device_owner_map does; null for a free port or any other owner (DHCP,
 * a load balancer), which keeps the owner string.
 */
export function portDevice(port: Port): PortDevice | null {
  if (!port.device_id) return null;
  const kind = port.device_owner.startsWith("compute:")
    ? "instance"
    : ROUTER_OWNERS.has(port.device_owner)
      ? "router"
      : null;
  if (!kind) return null;
  return { kind, id: port.device_id, name: port.device_name ?? port.device_id };
}

/** A port's device in words, for sorting and searching its column:
 * "Instance web-1", "Router default", or Horizon's owner label. */
export function portDeviceText(port: Port): string {
  const device = portDevice(port);
  if (!device) return portAttachmentLabel(port);
  return `${device.kind === "instance" ? "Instance" : "Router"} ${device.name}`;
}

/** Whether a quota resource still has room; unknown quotas never block. */
export function quotaLeft(
  quota: NetworkQuota | null | undefined,
  resource: string,
): boolean {
  const entry = quota?.[resource];
  if (!entry || entry.limit < 0) return true;
  return entry.used + entry.reserved < entry.limit;
}

export type NetworkActionId = "edit" | "create-subnet" | "delete";

const NOT_OWN_NETWORK = "Only your project's own networks can be changed";

/** Horizon offers edit, create subnet and delete on every row; neutron
 * refuses them on shared and external networks, so grey them out here.
 * Delete also waits until the network holds no ports but the DHCP ones
 * (`ports_in_use`, counted where the list or page knows it). */
const NETWORK_ACTIONS: ActionTable<
  NetworkActionId,
  Network,
  NetworkQuota | null | undefined
> = {
  guard: (network) => !network.is_project && NOT_OWN_NETWORK,
  rules: [
    { id: "edit", label: "Edit network" },
    {
      id: "create-subnet",
      label: "Create subnet",
      checks: [
        (_, quota) => !quotaLeft(quota, "subnet") && "Subnet quota exceeded",
      ],
    },
    {
      id: "delete",
      label: "Delete network",
      tone: "danger",
      checks: [
        (network) =>
          (network.ports_in_use ?? 0) > 0 &&
          "Remove the router interface and instance ports first",
      ],
    },
  ],
};

/** The network row menu; create subnet also needs room in `quota`. */
export function availableNetworkActions(
  network: Network,
  quota?: NetworkQuota | null,
) {
  return offerActions(NETWORK_ACTIONS, network, quota);
}

export type SubnetActionId = "edit" | "delete";

/** A subnet can change only on the project's own network (or one unknown). */
const SUBNET_ACTIONS: ActionTable<
  SubnetActionId,
  SubnetDetail,
  Network | undefined
> = {
  guard: (_, __, network) =>
    network !== undefined && !network.is_project && NOT_OWN_NETWORK,
  rules: [
    { id: "edit", label: "Edit subnet" },
    { id: "delete", label: "Delete subnet", tone: "danger" },
  ],
};

/** The subnet row menu on `network` (undefined when unknown). */
export function availableSubnetActions(
  subnet: SubnetDetail,
  network: Network | undefined,
) {
  return offerActions(SUBNET_ACTIONS, subnet, network);
}

export type PortActionId = "edit" | "delete";

const PORT_ACTIONS: ActionTable<PortActionId, Port> = {
  guard: (port) =>
    port.device_owner.startsWith("network:") &&
    "Ports owned by the network service cannot be changed here",
  rules: [
    { id: "edit", label: "Edit port" },
    {
      id: "delete",
      label: "Delete port",
      tone: "danger",
      checks: [
        (port) =>
          Boolean(port.device_id) && "Detach the port from its device first",
      ],
    },
  ],
};

/** The port row menu. */
export function availablePortActions(port: Port) {
  return offerActions(PORT_ACTIONS, port);
}

export type RouterActionId =
  "set-gateway" | "clear-gateway" | "edit" | "delete";

/** Horizon's routers/tables.py row actions: set gateway only without one,
 * clear gateway only with one. */
const ROUTER_ACTIONS: ActionTable<RouterActionId, Router> = {
  rules: [
    {
      id: "set-gateway",
      label: "Set gateway",
      checks: [
        (router) =>
          router.external_gateway !== null &&
          "The router already has a gateway",
      ],
    },
    {
      id: "clear-gateway",
      label: "Clear gateway",
      tone: "danger",
      checks: [
        (router) =>
          router.external_gateway === null && "The router has no gateway",
      ],
    },
    { id: "edit", label: "Edit router" },
    { id: "delete", label: "Delete router", tone: "danger" },
  ],
};

/** The router row menu. */
export function availableRouterActions(router: Router) {
  return offerActions(ROUTER_ACTIONS, router);
}

export type RouterInterfaceActionId = "remove";

/** A router's ports: one remove action, worded "Clear gateway" on the
 * gateway port; the HA ports the cloud manages itself cannot be removed. */
const ROUTER_INTERFACE_ACTIONS: ActionTable<
  RouterInterfaceActionId,
  RouterInterface
> = {
  rules: [
    {
      id: "remove",
      label: (port) =>
        port.kind === "gateway" ? "Clear gateway" : "Delete interface",
      tone: "danger",
      checks: [
        (port) =>
          port.kind === "ha" && "HA interfaces are managed by the cloud",
      ],
    },
  ],
};

/** The router interface row menu. */
export function availableRouterInterfaceActions(port: RouterInterface) {
  return offerActions(ROUTER_INTERFACE_ACTIONS, port);
}

export type FloatingIpActionId =
  "associate" | "disassociate" | "port-forwardings" | "release";

const hasForwarding = (fip: FloatingIp) => fip.port_forwarding_count > 0;
const isAssociated = (fip: FloatingIp) => fip.port_id !== null;

/** Horizon's floating_ips/tables.py: associate needs a free IP without
 * forwarding rules, disassociate needs a port, release is refused while
 * forwarding rules exist, and the rules page needs the extension. */
const FLOATING_IP_ACTIONS: ActionTable<
  FloatingIpActionId,
  FloatingIp,
  NetworkExtensions | null | undefined
> = {
  rules: [
    {
      id: "associate",
      label: "Associate",
      checks: [
        (fip) => isAssociated(fip) && "The IP is already associated",
        (fip) =>
          hasForwarding(fip) &&
          "Remove the port forwarding rules before associating",
      ],
    },
    {
      id: "disassociate",
      label: "Disassociate",
      tone: "danger",
      checks: [(fip) => !isAssociated(fip) && "The IP is not associated"],
    },
    {
      id: "port-forwardings",
      label: (fip) =>
        hasForwarding(fip)
          ? "Edit port forwarding rules"
          : "Add port forwarding rules",
      offered: (extensions) => Boolean(extensions?.port_forwarding),
      checks: [
        (fip) =>
          isAssociated(fip) && "Only an unassociated IP can forward ports",
      ],
    },
    {
      id: "release",
      label: "Release floating IP",
      tone: "danger",
      checks: [
        (fip) =>
          hasForwarding(fip) &&
          "Remove the port forwarding rules before releasing",
      ],
    },
  ],
};

/** The floating IP row menu; `extensions` decides the forwarding action. */
export function availableFloatingIpActions(
  fip: FloatingIp,
  extensions?: NetworkExtensions | null,
) {
  return offerActions(FLOATING_IP_ACTIONS, fip, extensions);
}

/** "web (192.168.1.20)" or "Load balancer VIP 10.0.0.5" for the mapped
 * fixed IP column (Horizon's get_instance_info). */
export function floatingIpTargetLabel(fip: FloatingIp): string {
  if (!fip.fixed_ip_address) return "";
  if (fip.instance_type === "loadbalancer") {
    return `Load balancer VIP ${fip.fixed_ip_address}`;
  }
  if (fip.instance_name) {
    return `${fip.instance_name} ${fip.fixed_ip_address}`;
  }
  return fip.fixed_ip_address;
}

export type SecurityGroupActionId = "edit" | "delete";

/** Horizon's security groups table: the default group cannot be deleted,
 * so its delete is greyed out. */
const SECURITY_GROUP_ACTIONS: ActionTable<
  SecurityGroupActionId,
  SecurityGroup
> = {
  rules: [
    { id: "edit", label: "Edit security group" },
    {
      id: "delete",
      label: "Delete security group",
      tone: "danger",
      checks: [
        (group) =>
          group.name === "default" && "The default group cannot be deleted",
      ],
    },
  ],
};

/** The security group row menu. */
export function availableSecurityGroupActions(group: SecurityGroup) {
  return offerActions(SECURITY_GROUP_ACTIONS, group);
}

export type TrunkActionId = "edit" | "delete";

const TRUNK_ACTIONS: ActionTable<TrunkActionId, Trunk> = {
  rules: [
    { id: "edit", label: "Edit trunk" },
    { id: "delete", label: "Delete trunk", tone: "danger" },
  ],
};

/** The trunk row menu: edit and delete, always offered. */
export function availableTrunkActions(trunk: Trunk) {
  return offerActions(TRUNK_ACTIONS, trunk);
}
