// The request bodies the Networks panel's dialogs send: a new network
// (with its first subnet), a network's changes, a new port and a port's
// changes. A create sends what the user filled in; an edit sends only what
// changed, and nothing at all when nothing did.
import type {
  Network,
  NetworkCreateRequest,
  Port,
  PortCreateRequest,
  PortUpdateRequest,
} from "../../../../lib/api/types/network";
import type { useUpdateNetwork } from "../../api";
import { subnetFieldsFromForm } from "../subnetRules";
import type {
  CreateNetworkValues,
  EditNetworkValues,
  PortValues,
} from "./schema";

/** What the update network mutation takes: the id and the changes. */
export type NetworkUpdate = Parameters<
  ReturnType<typeof useUpdateNetwork>["mutate"]
>[0];

/**
 * The create network body; the subnet goes along only when asked for, and
 * port security only where the cloud has the extension (`portSecurity`).
 */
export function createNetworkRequest(
  values: CreateNetworkValues,
  portSecurity: boolean,
): NetworkCreateRequest {
  const body: NetworkCreateRequest = {
    admin_state_up: values.admin_state_up,
  };
  if (values.name) body.name = values.name;
  if (values.mtu) body.mtu = Number(values.mtu);
  if (portSecurity) body.port_security_enabled = values.port_security_enabled;
  if (values.availability_zone_hints.length > 0) {
    body.availability_zone_hints = values.availability_zone_hints;
  }
  if (values.with_subnet) {
    body.subnet = subnetFieldsFromForm(values.subnet);
  }
  return body;
}

/** The changes to `network`, or null when there are none. */
export function updateNetworkRequest(
  network: Pick<Network, "id" | "name" | "admin_state_up">,
  values: EditNetworkValues,
): NetworkUpdate | null {
  const body: NetworkUpdate = { networkId: network.id };
  if (values.name !== network.name) body.name = values.name;
  if (values.admin_state_up !== network.admin_state_up) {
    body.admin_state_up = values.admin_state_up;
  }
  return Object.keys(body).length === 1 ? null : body;
}

/**
 * The create port body on `networkId`. Port security and the groups go
 * along only where the cloud has the extension (`portSecurity`), and the
 * groups only while port security is on.
 */
export function createPortRequest(
  networkId: string,
  values: PortValues,
  portSecurity: boolean,
): PortCreateRequest {
  const body: PortCreateRequest = {
    network_id: networkId,
    admin_state_up: values.admin_state_up,
  };
  if (values.name) body.name = values.name;
  if (values.device_id) body.device_id = values.device_id;
  if (values.device_owner) body.device_owner = values.device_owner;
  if (values.specify_ip === "subnet") body.subnet_id = values.subnet_id;
  if (values.specify_ip === "fixed") body.fixed_ip = values.fixed_ip;
  if (values.mac_address) body.mac_address = values.mac_address;
  if (portSecurity) {
    body.port_security_enabled = values.port_security_enabled;
    if (values.port_security_enabled) {
      body.security_groups = values.security_groups;
    }
  }
  return body;
}

/**
 * The changes to `port`, or null when there are none. The groups count as
 * changed only when the set differs, whatever its order.
 */
export function updatePortRequest(
  port: Pick<
    Port,
    | "id"
    | "name"
    | "admin_state_up"
    | "port_security_enabled"
    | "security_groups"
  >,
  values: PortValues,
  portSecurity: boolean,
): (PortUpdateRequest & { portId: string }) | null {
  const body: PortUpdateRequest & { portId: string } = {
    portId: port.id,
  };
  if (values.name !== port.name) body.name = values.name;
  if (values.admin_state_up !== port.admin_state_up) {
    body.admin_state_up = values.admin_state_up;
  }
  if (portSecurity) {
    if (values.port_security_enabled !== port.port_security_enabled) {
      body.port_security_enabled = values.port_security_enabled;
    }
    if (
      values.port_security_enabled &&
      [...values.security_groups].sort().join() !==
        [...port.security_groups].sort().join()
    ) {
      body.security_groups = values.security_groups;
    }
  }
  return Object.keys(body).length === 1 ? null : body;
}
