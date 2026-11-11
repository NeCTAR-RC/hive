// Status wording and tones for load balancers and their children
// (octavia-dashboard loadbalancers.service.js labels), and the row actions
// of the load balancer, its listeners, pools, members, health monitors, L7
// policies and rules.
import { offerActions, type ActionTable } from "../../lib/actions";
import type {
  HealthMonitor,
  L7Policy,
  L7Rule,
  Listener,
  LoadBalancer,
  LoadBalancerOptions,
  LoadBalancerTree,
  Member,
  Pool,
} from "../../lib/api/types/loadbalancers";
import type { ListenerTimeouts } from "./bodies";
import { defineStatus } from "../../lib/status";

const provisioning = defineStatus({
  transitional: ["PENDING_CREATE", "PENDING_UPDATE", "PENDING_DELETE"],
  success: ["ACTIVE"],
  danger: ["ERROR"],
  labels: {
    ACTIVE: "Active",
    INACTIVE: "Inactive",
    PENDING_CREATE: "Creating",
    PENDING_UPDATE: "Updating",
    PENDING_DELETE: "Deleting",
    ERROR: "Error",
  },
  unlisted: "as-is",
});

const operating = defineStatus({
  success: ["ONLINE"],
  warning: ["DEGRADED", "DRAINING"],
  danger: ["ERROR", "OFFLINE"],
  labels: {
    ONLINE: "Online",
    DRAINING: "Draining",
    OFFLINE: "Offline",
    DEGRADED: "Degraded",
    ERROR: "Error",
    NO_MONITOR: "No monitor",
  },
  unlisted: "as-is",
});

export const provisioningTone = provisioning.tone;
export const provisioningLabel = provisioning.label;
export const operatingTone = operating.tone;
export const operatingLabel = operating.label;

/** Whether Octavia is still applying a change (any PENDING_ state). */
export function isPending(status: string | null | undefined): boolean {
  return Boolean(status?.startsWith("PENDING_"));
}

/**
 * What Octavia is doing for a PENDING_* status, as the end of "The load
 * balancer is ...": "being created", "being updated" or "being deleted".
 */
export function pendingPhrase(status: string | null | undefined): string {
  switch (status) {
    case "PENDING_CREATE":
      return "being created";
    case "PENDING_DELETE":
      return "being deleted";
    default:
      return "being updated";
  }
}

/**
 * The load balancer's flavour by name, from the offered `flavors`: its id
 * when the flavour is not offered (disabled since), "Default" without one.
 */
export function flavourLabel(
  lb: Pick<LoadBalancer, "flavor_id">,
  flavors: readonly Pick<
    LoadBalancerOptions["flavors"][number],
    "id" | "name"
  >[],
): string {
  if (!lb.flavor_id) return "Default";
  return flavors.find((f) => f.id === lb.flavor_id)?.name || lb.flavor_id;
}

/** What each step of the backend's change chain does, as a phrase. */
const CHAIN_STEPS: Readonly<Record<string, string>> = {
  listener: "creating the listener",
  pool: "creating the pool",
  member: "adding a member",
  delete_member: "removing a member",
  monitor: "creating the health monitor",
};

/** The phrase for a chain step ("adding a member"), or a plain "working". */
export function chainStepLabel(step: string | null | undefined): string {
  return (step && CHAIN_STEPS[step]) || "working";
}

/** Whether the backend's chain of queued changes still has steps to run. */
export function isChainRunning(chain: LoadBalancerTree["chain"]): boolean {
  return Boolean(
    chain && !chain.error && chain.done.length < chain.steps.length,
  );
}

/** Anything in a load balancer's tree, as its pending checks read it. */
interface Provisioned {
  provisioning_status: string | null;
}

/**
 * Whether anything in the tree is still being applied: the load balancer,
 * a listener, pool, member, health monitor or L7 policy. The detail pages
 * poll while it is, so a status settles on screen without a reload.
 */
export function isTreePending(tree: {
  load_balancer: Provisioned;
  listeners: readonly Provisioned[];
  pools: readonly (Provisioned & { member_rows: readonly Provisioned[] })[];
  monitors: readonly Provisioned[];
  l7policies: readonly Provisioned[];
}): boolean {
  return (
    isPending(tree.load_balancer.provisioning_status) ||
    tree.listeners.some((l) => isPending(l.provisioning_status)) ||
    tree.pools.some(
      (p) =>
        isPending(p.provisioning_status) ||
        p.member_rows.some((m) => isPending(m.provisioning_status)),
    ) ||
    tree.monitors.some((m) => isPending(m.provisioning_status)) ||
    tree.l7policies.some((p) => isPending(p.provisioning_status))
  );
}

/** Whether an L7 policy or one of its rules is still being applied. */
export function isPolicyPending(
  policy: Provisioned & { rule_rows: readonly Provisioned[] },
): boolean {
  return (
    isPending(policy.provisioning_status) ||
    policy.rule_rows.some((r) => isPending(r.provisioning_status))
  );
}

/** The reason every change waits while Octavia applies another one. */
export const WAIT_FOR_ACTIVE = "Wait until the load balancer is Active";

/**
 * Why Octavia would refuse a change now, or null when it would not: while
 * a load balancer or any of its children is PENDING_*, Octavia answers 409
 * ("is immutable and cannot be updated") to every write in its tree.
 * octavia-dashboard disables its row actions the same way (believed: the
 * plugin is not checked out here).
 */
export function octaviaLock(
  ...statuses: (string | null | undefined)[]
): string | null {
  return statuses.some(isPending) ? WAIT_FOR_ACTIVE : null;
}

/**
 * The guard of every child's menu. Its context is the provisioning status
 * of the child's load balancer, which Octavia moves to PENDING_UPDATE
 * while any child changes.
 */
function childLock(item: Provisioned, _id: string, lbStatus: string | null) {
  return octaviaLock(lbStatus, item.provisioning_status);
}

export type LoadBalancerActionId =
  "edit" | "associate-fip" | "disassociate-fip" | "delete";

/**
 * The load balancer menu, from octavia-dashboard's row actions. Every
 * action waits while the load balancer is PENDING_*. Associate needs a VIP
 * port and no floating IP yet; disassociate needs one. Delete follows the
 * backend's `can_delete` (ACTIVE or ERROR only, as
 * delete.action.service.js allows), worded as the other status reasons.
 */
const LOAD_BALANCER_ACTIONS: ActionTable<LoadBalancerActionId, LoadBalancer> = {
  guard: (lb) => octaviaLock(lb.provisioning_status),
  rules: [
    { id: "edit", label: "Edit load balancer" },
    {
      id: "associate-fip",
      label: "Associate floating IP",
      checks: [
        (lb) =>
          lb.floating_ip !== null &&
          "The load balancer already has a floating IP",
        (lb) => !lb.vip_port_id && "The load balancer has no VIP port yet",
      ],
    },
    {
      id: "disassociate-fip",
      label: "Disassociate floating IP",
      checks: [
        (lb) =>
          lb.floating_ip === null && "The load balancer has no floating IP",
      ],
    },
    {
      id: "delete",
      label: "Delete load balancer",
      tone: "danger",
      checks: [
        (lb) =>
          !lb.can_delete &&
          `Not available while the status is ${provisioningLabel(lb.provisioning_status)}`,
      ],
    },
  ],
};

/** The load balancer's menu, every action with its availability. */
export function availableLoadBalancerActions(lb: LoadBalancer) {
  return offerActions(LOAD_BALANCER_ACTIONS, lb);
}

export type ListenerActionId = "edit" | "delete";

const LISTENER_ACTIONS: ActionTable<ListenerActionId, Listener, string | null> =
  {
    guard: childLock,
    rules: [
      { id: "edit", label: "Edit listener" },
      { id: "delete", label: "Delete listener", tone: "danger" },
    ],
  };

/** A listener's menu; `lbStatus` is its load balancer's provisioning status. */
export function availableListenerActions(
  listener: Listener,
  lbStatus: string | null,
) {
  return offerActions(LISTENER_ACTIONS, listener, lbStatus);
}

export type PoolActionId = "edit" | "delete";

const POOL_ACTIONS: ActionTable<PoolActionId, Pool, string | null> = {
  guard: childLock,
  rules: [
    { id: "edit", label: "Edit pool" },
    { id: "delete", label: "Delete pool", tone: "danger" },
  ],
};

/** A pool's menu; `lbStatus` is its load balancer's provisioning status. */
export function availablePoolActions(pool: Pool, lbStatus: string | null) {
  return offerActions(POOL_ACTIONS, pool, lbStatus);
}

export type MemberActionId = "edit" | "remove";

const MEMBER_ACTIONS: ActionTable<MemberActionId, Member, string | null> = {
  guard: childLock,
  rules: [
    { id: "edit", label: "Edit member" },
    { id: "remove", label: "Remove member", tone: "danger" },
  ],
};

/** A member's menu; `lbStatus` is its load balancer's provisioning status. */
export function availableMemberActions(
  member: Member,
  lbStatus: string | null,
) {
  return offerActions(MEMBER_ACTIONS, member, lbStatus);
}

export type MonitorActionId = "edit" | "delete";

const MONITOR_ACTIONS: ActionTable<
  MonitorActionId,
  HealthMonitor,
  string | null
> = {
  guard: childLock,
  rules: [
    { id: "edit", label: "Edit health monitor" },
    { id: "delete", label: "Delete health monitor", tone: "danger" },
  ],
};

/** A health monitor's actions; `lbStatus` is its load balancer's status. */
export function availableMonitorActions(
  monitor: HealthMonitor,
  lbStatus: string | null,
) {
  return offerActions(MONITOR_ACTIONS, monitor, lbStatus);
}

export type PolicyActionId = "rules" | "edit" | "delete";

/** The policy menu: its rules can always be looked at, not always changed. */
const POLICY_ACTIONS: ActionTable<PolicyActionId, L7Policy, string | null> = {
  guard: (policy, id, lbStatus) =>
    id !== "rules" && childLock(policy, id, lbStatus),
  rules: [
    { id: "rules", label: "Manage rules" },
    { id: "edit", label: "Edit policy" },
    { id: "delete", label: "Delete policy", tone: "danger" },
  ],
};

/** An L7 policy's menu; `lbStatus` is its load balancer's status. */
export function availablePolicyActions(
  policy: L7Policy,
  lbStatus: string | null,
) {
  return offerActions(POLICY_ACTIONS, policy, lbStatus);
}

export type RuleActionId = "edit" | "delete";

const RULE_ACTIONS: ActionTable<RuleActionId, L7Rule, string | null> = {
  guard: childLock,
  rules: [
    { id: "edit", label: "Edit rule" },
    { id: "delete", label: "Delete rule", tone: "danger" },
  ],
};

/** An L7 rule's menu; `lbStatus` is its load balancer's status. */
export function availableRuleActions(rule: L7Rule, lbStatus: string | null) {
  return offerActions(RULE_ACTIONS, rule, lbStatus);
}

export const DEFAULT_PORTS: Record<string, number> = {
  HTTP: 80,
  HTTPS: 443,
  TERMINATED_HTTPS: 443,
};

/** Octavia's listener timeouts in milliseconds, which a new listener starts with. */
export const LISTENER_TIMEOUT_DEFAULTS: ListenerTimeouts = {
  timeout_client_data: 50000,
  timeout_member_connect: 5000,
  timeout_member_data: 50000,
  timeout_tcp_inspect: 0,
};

/**
 * A new listener's port for `protocol`, stepped past the ports already
 * `used` on the load balancer; undefined for a protocol without a default
 * (TCP, UDP, SCTP), which leaves the port for the user to enter.
 */
export function defaultPort(
  protocol: string,
  used: number[],
): number | undefined {
  let port = DEFAULT_PORTS[protocol];
  if (port === undefined) return undefined;
  while (used.includes(port)) port += 1;
  return port;
}

/**
 * A new member's port in a pool of `poolProtocol`: 80 on an HTTP pool and
 * none otherwise (octavia-dashboard model.service.js
 * `{HTTP: 80}[pool.protocol]`).
 */
export function memberDefaultPort(poolProtocol: string): number | undefined {
  return poolProtocol === "HTTP" ? 80 : undefined;
}

export function poolProtocolFor(listenerProtocol: string): string {
  return listenerProtocol === "TERMINATED_HTTPS" ? "HTTP" : listenerProtocol;
}

/**
 * The session persistence types a pool of `protocol` can use: Octavia
 * accepts only source IP persistence on UDP and SCTP pools.
 */
export function persistenceTypesFor(
  protocol: string | null | undefined,
  types: readonly string[],
): string[] {
  return ["UDP", "SCTP"].includes(protocol ?? "")
    ? types.filter((type) => type === "SOURCE_IP")
    : [...types];
}

/**
 * `persistence` when a pool of `protocol` can use it, else "" (none): a
 * protocol change drops a choice Octavia would refuse.
 */
export function usablePersistence(
  protocol: string | null | undefined,
  persistence: string,
  types: readonly string[],
): string {
  return persistenceTypesFor(protocol, types).includes(persistence)
    ? persistence
    : "";
}

/** The listener protocols that need no certificate store. */
const PLAIN_LISTENER_PROTOCOLS = ["HTTP", "TCP", "HTTPS", "UDP", "SCTP"];

/**
 * The listener protocols to offer: the options' list, where terminated
 * HTTPS appears only when Barbican runs (`barbican_available`), as
 * octavia-dashboard hides it otherwise. Before the options load, only the
 * protocols that need no certificate.
 */
export function listenerProtocols(
  options:
    | Pick<LoadBalancerOptions, "listener_protocols" | "barbican_available">
    | undefined,
): string[] {
  if (!options) return PLAIN_LISTENER_PROTOCOLS;
  return options.listener_protocols.filter(
    (protocol) => options.barbican_available || protocol !== "TERMINATED_HTTPS",
  );
}

/**
 * Help for the certificate field of a terminated HTTPS listener. The
 * protocol is offered only where Barbican runs (`barbican_available`), but
 * the forms cannot list or upload certificates, so the reference is typed.
 */
export const TLS_REF_HELP =
  "The Barbican reference (a URL ending in /containers/<id> or " +
  "/secrets/<id>) of the certificate and key to terminate TLS with. " +
  "Create it in the Key Manager (Barbican) first.";

export const EXPECTED_CODES = /^\d+((\s*-\s*\d+)|(\s*,\s*\d+)+)?$/;
export const URL_PATH = /^((\/)|(\/[^/]+)+)$/;
