// Status presentation and row action rules for the Network panels, ported
// from Horizon's networks, routers, floating_ips, floating_ip_portforwardings
// and trunks tables.py so the menus offer what Horizon offers.
import type { StatusTone } from "../../components/StatusPill/StatusPill";
import type {
  FloatingIp,
  Network,
  NetworkExtensions,
  NetworkQuota,
  Port,
  Router,
  RouterInterface,
  SubnetDetail,
  Trunk,
} from "../../lib/api/types";

const TRANSITIONAL = new Set(["BUILD", "PENDING_CREATE", "PENDING_UPDATE"]);

const LABELS: Record<string, string> = {
  ACTIVE: "Active",
  BUILD: "Build",
  DOWN: "Down",
  ERROR: "Error",
  DEGRADED: "Degraded",
  "N/A": "N/A",
};

export function isTransitional(item: { status: string | null }) {
  return item.status !== null && TRANSITIONAL.has(item.status);
}

export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return "neutral";
  if (TRANSITIONAL.has(status)) return "progress";
  if (status === "ACTIVE") return "success";
  if (status === "DOWN") return "neutral";
  if (status === "ERROR" || status === "DEGRADED") return "danger";
  return "neutral";
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "";
  const known = LABELS[status];
  if (known) return known;
  const spaced = status.replace(/[_-]/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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

/** Horizon's Attached Device column on ports. */
export function portAttachmentLabel(port: Port): string {
  if (port.device_owner) return port.device_owner;
  return port.device_id ? "Attached" : "Detached";
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

export interface ActionOffer<Id extends string> {
  id: Id;
  label: string;
  tone?: "danger";
  isDisabled: boolean;
  disabledReason?: string;
}

function offer<Id extends string>(
  id: Id,
  label: string,
  reason: string | null,
  tone?: "danger",
): ActionOffer<Id> {
  return {
    id,
    label,
    ...(tone ? { tone } : {}),
    isDisabled: reason !== null,
    ...(reason ? { disabledReason: reason } : {}),
  };
}

// --- networks ----------------------------------------------------------------

export type NetworkActionId = "edit" | "create-subnet" | "delete";

const NOT_OWN_NETWORK = "Only your project's own networks can be changed";

/** Horizon offers edit, create subnet and delete on every row; neutron
 * refuses them on shared and external networks, so grey them out here. */
export function availableNetworkActions(
  network: Network,
  quota?: NetworkQuota | null,
): ActionOffer<NetworkActionId>[] {
  const own = network.is_project ? null : NOT_OWN_NETWORK;
  return [
    offer("edit", "Edit network", own),
    offer(
      "create-subnet",
      "Create subnet",
      own ?? (quotaLeft(quota, "subnet") ? null : "Subnet quota exceeded"),
    ),
    offer("delete", "Delete network", own, "danger"),
  ];
}

export type SubnetActionId = "edit" | "delete";

export function availableSubnetActions(
  subnet: SubnetDetail,
  network: Network | undefined,
): ActionOffer<SubnetActionId>[] {
  const own = !network || network.is_project ? null : NOT_OWN_NETWORK;
  void subnet;
  return [
    offer("edit", "Edit subnet", own),
    offer("delete", "Delete subnet", own, "danger"),
  ];
}

export type PortActionId = "edit" | "delete";

export function availablePortActions(port: Port): ActionOffer<PortActionId>[] {
  const owned = port.device_owner.startsWith("network:")
    ? "Ports owned by the network service cannot be changed here"
    : null;
  return [
    offer("edit", "Edit port", owned),
    offer(
      "delete",
      "Delete port",
      owned ??
        (port.device_id ? "Detach the port from its device first" : null),
      "danger",
    ),
  ];
}

// --- routers -----------------------------------------------------------------

export type RouterActionId =
  "set-gateway" | "clear-gateway" | "edit" | "delete";

/** Horizon's routers/tables.py row actions: set gateway only without one,
 * clear gateway only with one. */
export function availableRouterActions(
  router: Router,
): ActionOffer<RouterActionId>[] {
  const hasGateway = router.external_gateway !== null;
  const actions: ActionOffer<RouterActionId>[] = [];
  if (hasGateway) {
    actions.push(offer("clear-gateway", "Clear gateway", null, "danger"));
  } else {
    actions.push(offer("set-gateway", "Set gateway", null));
  }
  actions.push(offer("edit", "Edit router", null));
  actions.push(offer("delete", "Delete router", null, "danger"));
  return actions;
}

// --- floating IPs ------------------------------------------------------------

export type FloatingIpActionId =
  "associate" | "disassociate" | "port-forwardings" | "release";

/** Horizon's floating_ips/tables.py: associate needs a free IP without
 * forwarding rules, disassociate needs a port, release is refused while
 * forwarding rules exist, and the rules page needs the extension. */
export function availableFloatingIpActions(
  fip: FloatingIp,
  extensions?: NetworkExtensions | null,
): ActionOffer<FloatingIpActionId>[] {
  const forwarding = fip.port_forwarding_count > 0;
  const associated = fip.port_id !== null;
  const actions: ActionOffer<FloatingIpActionId>[] = [];
  if (associated) {
    actions.push(offer("disassociate", "Disassociate", null, "danger"));
  } else {
    actions.push(
      offer(
        "associate",
        "Associate",
        forwarding
          ? "Remove the port forwarding rules before associating"
          : null,
      ),
    );
  }
  if (extensions?.port_forwarding) {
    actions.push(
      offer(
        "port-forwardings",
        forwarding ? "Edit port forwarding rules" : "Add port forwarding rules",
        associated ? "Only an unassociated IP can forward ports" : null,
      ),
    );
  }
  actions.push(
    offer(
      "release",
      "Release floating IP",
      forwarding ? "Remove the port forwarding rules before releasing" : null,
      "danger",
    ),
  );
  return actions;
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

// --- trunks ------------------------------------------------------------------

export type TrunkActionId = "edit" | "delete";

export function availableTrunkActions(
  trunk: Trunk,
): ActionOffer<TrunkActionId>[] {
  void trunk;
  return [
    offer("edit", "Edit trunk", null),
    offer("delete", "Delete trunk", null, "danger"),
  ];
}
