// How a port reads in the trunk dialogs' port pickers.
import type { Port } from "../../../../lib/api/types/network";

/** "web on private-net (10.0.0.5)": the port, its network and addresses. */
export function portLabel(port: Port): string {
  const ips = port.fixed_ips.map((ip) => ip.ip_address).join(", ");
  return `${port.name || port.id}${port.network_name ? ` on ${port.network_name}` : ""}${ips ? ` (${ips})` : ""}`;
}
