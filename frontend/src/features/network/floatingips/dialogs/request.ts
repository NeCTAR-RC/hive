// The request bodies the Floating IPs panel's dialogs send: an allocation
// from a pool, and a port forwarding rule.
import type {
  FloatingIpAllocateRequest,
  FloatingIpTarget,
  PortForwardingRequest,
} from "../../../../lib/api/types/network";
import type { AllocateValues, PortForwardingValues } from "./schema";

/**
 * The allocate body: the pool, and whatever optional field is filled in.
 * The DNS names go only where the cloud has DNS integration (`dns`).
 */
export function allocateFloatingIpRequest(
  values: AllocateValues,
  dns: boolean,
): FloatingIpAllocateRequest {
  const body: FloatingIpAllocateRequest = {
    floating_network_id: values.floating_network_id,
  };
  if (values.floating_ip_address) {
    body.floating_ip_address = values.floating_ip_address;
  }
  if (values.description) body.description = values.description;
  if (dns && values.dns_domain) body.dns_domain = values.dns_domain;
  if (dns && values.dns_name) body.dns_name = values.dns_name;
  return body;
}

/** A port forwarding rule to `target`, the internal address chosen. */
export function portForwardingRequest(
  values: PortForwardingValues,
  target: Pick<FloatingIpTarget, "port_id" | "ip_address">,
): PortForwardingRequest {
  const body: PortForwardingRequest = {
    protocol: values.protocol,
    internal_port_id: target.port_id,
    internal_ip_address: target.ip_address,
    internal_port: values.internal_port,
    external_port: values.external_port,
  };
  if (values.description) body.description = values.description;
  return body;
}
