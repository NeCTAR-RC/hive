// The create load balancer wizard's form: its fields, the rules of each
// optional part, the values it opens with, and what every step receives.
import { z } from "zod";
import type { LoadBalancerOptions } from "../../../lib/api/types/loadbalancers";
import { maxLength } from "../../../lib/validation";
import {
  addressProblem,
  listenerFields,
  listenerTimeoutFields,
  memberFields,
  monitorFields,
  poolFields,
  refineListener,
  refineMember,
  refineMonitor,
  refinePool,
  type SubnetRange,
} from "../schemas";
import {
  defaultPort,
  LISTENER_TIMEOUT_DEFAULTS,
  memberDefaultPort,
  poolProtocolFor,
  usablePersistence,
} from "../status";

/** The wizard's fields, before the rules that read the offered subnets. */
const createFormFields = z.object({
  name: maxLength(255),
  description: maxLength(255),
  vip_subnet_id: z.string().min(1, "Choose a subnet"),
  vip_address: z.string().trim(),
  flavor_id: z.string(),
  availability_zone: z.string(),
  admin_state_up: z.boolean(),
  create_listener: z.boolean(),
  listener: z.object({ ...listenerFields, ...listenerTimeoutFields }),
  create_pool: z.boolean(),
  pool: z.object(poolFields),
  members: z.array(z.object(memberFields)),
  create_monitor: z.boolean(),
  monitor: z.object(monitorFields),
});

/**
 * The wizard's schema for the offered `subnets`: the load balancer's
 * fields, then its optional listener, pool, members and health monitor,
 * each checked only when its `create_*` flag is on. A VIP address and every
 * member address must be an IP address on its chosen subnet.
 */
export function createFormSchema(subnets: readonly SubnetRange[]) {
  return createFormFields.superRefine((v, ctx) => {
    if (v.vip_address) {
      const problem = addressProblem(v.vip_address, v.vip_subnet_id, subnets);
      if (problem) {
        ctx.addIssue({
          code: "custom",
          path: ["vip_address"],
          message: problem,
        });
      }
    }
    // A part's rules apply only when it is switched on.
    if (v.create_listener) refineListener(v.listener, ctx, ["listener"]);
    if (v.create_pool) {
      refinePool(v.pool, ctx, ["pool"]);
      v.members.forEach((member, index) =>
        refineMember(member, subnets, ctx, ["members", index]),
      );
    }
    if (v.create_monitor) refineMonitor(v.monitor, ctx, ["monitor"]);
  });
}

export type CreateForm = z.infer<typeof createFormFields>;

/** The wizard's opening values: an HTTP listener on port 80 with a pool. */
export const CREATE_DEFAULTS: CreateForm = {
  name: "",
  description: "",
  vip_subnet_id: "",
  vip_address: "",
  flavor_id: "",
  availability_zone: "",
  admin_state_up: true,
  create_listener: true,
  listener: {
    name: "",
    protocol: "HTTP",
    protocol_port: 80,
    connection_limit: -1,
    allowed_cidrs: "",
    xff: false,
    xfp: false,
    xfproto: false,
    tls_ref: "",
    ...LISTENER_TIMEOUT_DEFAULTS,
  },
  create_pool: true,
  pool: {
    name: "",
    lb_algorithm: "ROUND_ROBIN",
    persistence: "",
    cookie_name: "",
  },
  members: [],
  create_monitor: false,
  monitor: {
    type: "HTTP",
    delay: 5,
    timeout: 5,
    max_retries: 3,
    max_retries_down: 3,
    http_method: "GET",
    url_path: "/",
    expected_codes: "200",
  },
};

/** What a listener protocol change sets elsewhere in the wizard. */
export interface ProtocolLinks {
  /** The listener's port; undefined leaves the field empty. */
  listenerPort: number | undefined;
  /** Every member's port; undefined leaves the fields empty. */
  memberPort: number | undefined;
  /** The pool's persistence type, "" for none. */
  persistence: string;
}

/**
 * What a change of the listener protocol to `protocol` moves, as the
 * Angular wizard's `protocolChange` does: the listener port to the
 * protocol's default, every member port to the new pool protocol's member
 * default, and a `persistence` type the new pool protocol cannot use back
 * to none.
 */
export function protocolLinks(
  protocol: string,
  persistence: string,
  persistenceTypes: readonly string[],
): ProtocolLinks {
  const poolProtocol = poolProtocolFor(protocol);
  return {
    listenerPort: defaultPort(protocol, []),
    memberPort: memberDefaultPort(poolProtocol),
    persistence: usablePersistence(poolProtocol, persistence, persistenceTypes),
  };
}

/** What every step gets from the page: the load balancer options. */
export interface CreateStepProps {
  data: LoadBalancerOptions;
}
