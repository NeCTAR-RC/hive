// The pool forms (octavia-dashboard workflow/pool): the create and edit
// fields, and the request bodies the values become.
import { z } from "zod";
import { offered } from "../../../../lib/api/offered";
import type {
  Listener,
  PoolCreate,
  PoolSpec,
  PoolUpdate,
} from "../../../../lib/api/types/loadbalancers";
import { maxLength } from "../../../../lib/validation";
import { sessionPersistence } from "../../bodies";
import { poolFields, refinePool } from "../../schemas";
import { poolProtocolFor } from "../../status";

/**
 * The create dialog's fields. A pool follows its listener's protocol, so
 * the protocol is asked for only when no listener is chosen.
 */
export const createPoolSchema = z
  .object({
    ...poolFields,
    description: maxLength(255),
    listener_id: z.string(),
    protocol: z.string(),
    admin_state_up: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.listener_id && !v.protocol) {
      ctx.addIssue({
        code: "custom",
        path: ["protocol"],
        message: "Choose a protocol or a listener",
      });
    }
    refinePool(v, ctx);
  });

export type CreatePoolValues = z.infer<typeof createPoolSchema>;

/**
 * A new pool's protocol: its listener's (terminated HTTPS sends HTTP to
 * the members) when `listenerId` names one of `listeners`, else `chosen`.
 */
export function newPoolProtocol(
  listeners: readonly Pick<Listener, "id" | "protocol">[],
  listenerId: string,
  chosen: string,
): string {
  const listener = listeners.find((l) => l.id === listenerId);
  return listener ? poolProtocolFor(listener.protocol) : chosen;
}

/**
 * The edit dialog's fields; the protocol and listener are fixed, and TLS
 * to the members can be switched on or off.
 */
export const editPoolSchema = z
  .object({
    ...poolFields,
    description: maxLength(255),
    tls_enabled: z.boolean(),
    admin_state_up: z.boolean(),
  })
  .superRefine(refinePool);

export type EditPoolValues = z.infer<typeof editPoolSchema>;

/**
 * The create body: the listener when one is chosen, else the protocol;
 * the name and description only when set; and no session persistence
 * (null) unless one is chosen, with the cookie name for APP_COOKIE.
 */
export function createPoolBody(
  loadBalancerId: string,
  v: CreatePoolValues,
): PoolCreate {
  return {
    loadbalancer_id: loadBalancerId,
    ...(v.listener_id
      ? { listener_id: v.listener_id }
      : { protocol: offered<NonNullable<PoolSpec["protocol"]>>(v.protocol) }),
    lb_algorithm: offered<PoolSpec["lb_algorithm"]>(v.lb_algorithm),
    admin_state_up: v.admin_state_up,
    ...(v.name ? { name: v.name } : {}),
    ...(v.description ? { description: v.description } : {}),
    session_persistence: sessionPersistence(v.persistence, v.cookie_name),
  };
}

/**
 * The update body: every editable field, TLS to the members, and the
 * session persistence as on a create, so "None" clears it.
 */
export function editPoolBody(v: EditPoolValues): PoolUpdate {
  return {
    name: v.name,
    description: v.description,
    lb_algorithm: offered<PoolSpec["lb_algorithm"]>(v.lb_algorithm),
    admin_state_up: v.admin_state_up,
    tls_enabled: v.tls_enabled,
    session_persistence: sessionPersistence(v.persistence, v.cookie_name),
  };
}
