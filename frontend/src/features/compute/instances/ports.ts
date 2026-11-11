// How an instance's ports, and the ports a project can attach, are named
// in tables, choices and confirmations.
import type { InstancePort } from "../../../lib/api/types/compute";
import type { AttachablePort } from "../../../lib/api/types/network";

/** A port's fixed addresses, which name it in the detach dialog. */
export function portAddresses(port: Pick<InstancePort, "fixed_ips">): string {
  return port.fixed_ips.map((ip) => ip.ip).join(", ");
}

/**
 * An attachable port as a choice: its name (or id) with its network and
 * fixed addresses, so ports of the same name can be told apart.
 */
export function attachablePortLabel(port: AttachablePort): string {
  return `${port.name || port.id} (${port.network_name ?? "network"}: ${port.fixed_ips.join(", ") || "no address"})`;
}
