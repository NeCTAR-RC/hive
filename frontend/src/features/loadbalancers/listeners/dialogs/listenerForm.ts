// The listener forms (octavia-dashboard workflow/listener): the create and
// edit fields, the pools a listener can default to, and the request bodies
// the values become.
import { z } from "zod";
import { offered } from "../../../../lib/api/offered";
import type {
  ListenerCreate,
  ListenerSpec,
  ListenerUpdate,
  LoadBalancerTree,
} from "../../../../lib/api/types/loadbalancers";
import { maxLength } from "../../../../lib/validation";
import { insertHeadersPart, timeoutsPart } from "../../bodies";
import {
  enteredPort,
  listEntries,
  listenerFields,
  listenerTimeoutFields,
  refineListener,
} from "../../schemas";
import { poolProtocolFor } from "../../status";

/** The create dialog's fields: a whole listener and its default pool. */
export const createListenerSchema = z
  .object({
    ...listenerFields,
    ...listenerTimeoutFields,
    description: maxLength(255),
    default_pool_id: z.string(),
    admin_state_up: z.boolean(),
  })
  .superRefine(refineListener);

export type CreateListenerValues = z.infer<typeof createListenerSchema>;

/**
 * The edit dialog's fields; the protocol and port are fixed. A terminated
 * HTTPS listener can change its certificate, its SNI certificates (one
 * reference per line) and its TLS ciphers.
 */
export const editListenerSchema = z
  .object({
    name: listenerFields.name,
    description: maxLength(255),
    connection_limit: listenerFields.connection_limit,
    allowed_cidrs: listenerFields.allowed_cidrs,
    xff: listenerFields.xff,
    xfp: listenerFields.xfp,
    xfproto: listenerFields.xfproto,
    ...listenerTimeoutFields,
    tls_ref: listenerFields.tls_ref,
    sni_refs: z.string().trim(),
    tls_ciphers: z.string().trim(),
    default_pool_id: z.string(),
    admin_state_up: z.boolean(),
  })
  .superRefine(refineListener);

export type EditListenerValues = z.infer<typeof editListenerSchema>;

/** The load balancer's pools a listener of `protocol` can send traffic to. */
export function poolsFor(tree: LoadBalancerTree, protocol: string) {
  const wanted = poolProtocolFor(protocol);
  return tree.pools.filter((p) => p.protocol === wanted);
}

/**
 * The create body: optional fields only when set, the forwarded headers on
 * an HTTP or terminated HTTPS listener, the certificate on a terminated
 * HTTPS one, and the timeouts on every protocol but UDP and SCTP.
 */
export function createListenerBody(
  loadBalancerId: string,
  v: CreateListenerValues,
): ListenerCreate {
  const cidrs = listEntries(v.allowed_cidrs);
  return {
    loadbalancer_id: loadBalancerId,
    protocol: offered<ListenerSpec["protocol"]>(v.protocol),
    protocol_port: enteredPort(v.protocol_port),
    connection_limit: v.connection_limit,
    admin_state_up: v.admin_state_up,
    ...(v.name ? { name: v.name } : {}),
    ...(v.description ? { description: v.description } : {}),
    ...(cidrs.length ? { allowed_cidrs: cidrs } : {}),
    ...insertHeadersPart(v.protocol, v),
    ...timeoutsPart(v.protocol, v),
    ...(v.protocol === "TERMINATED_HTTPS"
      ? { default_tls_container_ref: v.tls_ref }
      : {}),
    ...(v.default_pool_id ? { default_pool_id: v.default_pool_id } : {}),
  };
}

/**
 * The TLS part of an update for a listener of `protocol`: on terminated
 * HTTPS, the certificate when one is given (Octavia needs one, so a blank
 * field keeps it), the SNI references, and the ciphers, which blank clears
 * back to Octavia's default; nothing on any other protocol.
 */
export function tlsUpdatePart(
  protocol: string,
  v: Pick<EditListenerValues, "tls_ref" | "sni_refs" | "tls_ciphers">,
): Pick<
  ListenerUpdate,
  "default_tls_container_ref" | "sni_container_refs" | "tls_ciphers"
> {
  if (protocol !== "TERMINATED_HTTPS") return {};
  return {
    ...(v.tls_ref ? { default_tls_container_ref: v.tls_ref } : {}),
    sni_container_refs: listEntries(v.sni_refs),
    tls_ciphers: v.tls_ciphers || null,
  };
}

/**
 * The update body for a listener of `protocol`: every editable field, the
 * forwarded headers, timeouts and TLS settings only where the protocol has
 * them, and "None" as the default pool clears it.
 */
export function editListenerBody(
  protocol: string,
  v: EditListenerValues,
): ListenerUpdate {
  return {
    name: v.name,
    description: v.description,
    connection_limit: v.connection_limit,
    allowed_cidrs: listEntries(v.allowed_cidrs),
    admin_state_up: v.admin_state_up,
    ...insertHeadersPart(protocol, v),
    ...timeoutsPart(protocol, v),
    ...tlsUpdatePart(protocol, v),
    default_pool_id: v.default_pool_id || null,
  };
}
