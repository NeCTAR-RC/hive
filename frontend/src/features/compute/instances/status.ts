// Instance status presentation and the action availability rules, ported
// from Horizon's project/instances/tables.py so the row menu offers what
// Horizon offers.
import type { Instance } from "../../../lib/api/types";
import type { StatusTone } from "../../../components/StatusPill/StatusPill";

const TRANSITIONAL = new Set([
  "BUILD",
  "REBUILD",
  "RESIZE",
  "REVERT_RESIZE",
  "REBOOT",
  "HARD_REBOOT",
  "MIGRATING",
  "PASSWORD",
  "DELETED",
]);

export function isTransitional(
  instance: Pick<Instance, "status" | "task_state">,
) {
  return Boolean(instance.task_state) || TRANSITIONAL.has(instance.status);
}

export function isDeleting(instance: Pick<Instance, "task_state">) {
  return instance.task_state === "deleting";
}

export function statusTone(
  instance: Pick<Instance, "status" | "task_state">,
): StatusTone {
  if (isTransitional(instance)) return "progress";
  switch (instance.status) {
    case "ACTIVE":
      return "success";
    case "ERROR":
      return "danger";
    case "SHUTOFF":
    case "SHELVED":
    case "SHELVED_OFFLOADED":
      return "neutral";
    case "PAUSED":
    case "SUSPENDED":
    case "RESCUE":
    case "VERIFY_RESIZE":
      return "warning";
    default:
      return "info";
  }
}

/** The word shown in the Status column: the task while there is one. */
export function statusLabel(instance: Instance): string {
  if (instance.task_state) {
    return instance.task_state.replace(/_/g, " ");
  }
  return instance.status.replace(/_/g, " ");
}

// Horizon's POWER_DISPLAY_CHOICES (project/instances/tables.py) for the
// two-word states; the rest (RUNNING, PAUSED, BLOCKED, CRASHED, SUSPENDED,
// FAILED, BUILDING) read as the capitalised word.
const POWER_LABELS: Record<string, string> = {
  "NO STATE": "No state",
  SHUTDOWN: "Shut down",
  SHUTOFF: "Shut off",
};

export function powerStateLabel(instance: Pick<Instance, "power_state">) {
  const state = instance.power_state;
  if (!state) return POWER_LABELS["NO STATE"]!;
  return POWER_LABELS[state] ?? state.charAt(0) + state.slice(1).toLowerCase();
}

export type InstanceActionId =
  | "console"
  | "log"
  | "edit"
  | "security-groups"
  | "metadata"
  | "attach-interface"
  | "detach-interface"
  | "associate-fip"
  | "disassociate-fip"
  | "snapshot"
  | "resize"
  | "confirm-resize"
  | "revert-resize"
  | "start"
  | "stop"
  | "soft-reboot"
  | "hard-reboot"
  | "pause"
  | "unpause"
  | "suspend"
  | "resume"
  | "shelve"
  | "unshelve"
  | "lock"
  | "unlock"
  | "rescue"
  | "unrescue"
  | "rebuild"
  | "delete";

export interface ActionRule {
  id: InstanceActionId;
  label: string;
  tone?: "danger";
  /** Which statuses allow the action; omitted means any status. */
  statuses?: string[];
  /** A predicate on top of the status check. */
  when?: (instance: Instance) => boolean;
  /** Shown instead of the action when it is unavailable. */
  reason?: string;
}

const ACTIVE_OR_SHUTOFF = ["ACTIVE", "SHUTOFF"];

// The order is Horizon's row menu order.
export const ACTION_RULES: ActionRule[] = [
  { id: "console", label: "Console", statuses: ["ACTIVE", "RESCUE"] },
  { id: "log", label: "View log" },
  { id: "edit", label: "Edit instance" },
  { id: "security-groups", label: "Edit security groups" },
  { id: "metadata", label: "Update metadata" },
  {
    id: "attach-interface",
    label: "Attach interface",
    statuses: ACTIVE_OR_SHUTOFF,
  },
  {
    id: "detach-interface",
    label: "Detach interface",
    statuses: ACTIVE_OR_SHUTOFF,
  },
  // Horizon's AssociateIP and DisassociateIP: the second only once the
  // instance has a floating address.
  { id: "associate-fip", label: "Associate floating IP" },
  {
    id: "disassociate-fip",
    label: "Disassociate floating IP",
    when: (i) => i.addresses.some((a) => a.type === "floating"),
  },
  {
    id: "snapshot",
    label: "Create snapshot",
    statuses: ["ACTIVE", "SHUTOFF", "PAUSED", "SUSPENDED"],
  },
  { id: "resize", label: "Resize instance", statuses: ACTIVE_OR_SHUTOFF },
  {
    id: "confirm-resize",
    label: "Confirm resize",
    statuses: ["VERIFY_RESIZE"],
  },
  { id: "revert-resize", label: "Revert resize", statuses: ["VERIFY_RESIZE"] },
  { id: "start", label: "Start instance", statuses: ["SHUTOFF", "CRASHED"] },
  { id: "stop", label: "Shut off instance", statuses: ["ACTIVE", "ERROR"] },
  { id: "soft-reboot", label: "Soft reboot", statuses: ACTIVE_OR_SHUTOFF },
  { id: "hard-reboot", label: "Hard reboot", statuses: ACTIVE_OR_SHUTOFF },
  { id: "pause", label: "Pause instance", statuses: ["ACTIVE"] },
  { id: "unpause", label: "Resume instance", statuses: ["PAUSED"] },
  { id: "suspend", label: "Suspend instance", statuses: ["ACTIVE"] },
  { id: "resume", label: "Resume instance", statuses: ["SUSPENDED"] },
  {
    id: "shelve",
    label: "Shelve instance",
    statuses: ["ACTIVE", "SHUTOFF", "PAUSED", "SUSPENDED"],
  },
  {
    id: "unshelve",
    label: "Unshelve instance",
    statuses: ["SHELVED", "SHELVED_OFFLOADED"],
  },
  { id: "lock", label: "Lock instance", when: (i) => !i.locked },
  { id: "unlock", label: "Unlock instance", when: (i) => i.locked },
  { id: "rescue", label: "Rescue instance", statuses: ACTIVE_OR_SHUTOFF },
  { id: "unrescue", label: "Unrescue instance", statuses: ["RESCUE"] },
  {
    id: "rebuild",
    label: "Rebuild instance",
    statuses: ACTIVE_OR_SHUTOFF,
    when: (i) => !i.boot_from_volume,
    reason: "Instances booted from a volume cannot be rebuilt",
  },
  { id: "delete", label: "Delete instance", tone: "danger" },
];

export interface AvailableAction {
  id: InstanceActionId;
  label: string;
  tone?: "danger";
  isDisabled: boolean;
  disabledReason?: string;
}

/** The actions to offer for an instance, in menu order, with disabled ones
 * kept only where the reason is worth showing. */
export function availableActions(instance: Instance): AvailableAction[] {
  const deleting = isDeleting(instance);
  const busy = isTransitional(instance);
  const result: AvailableAction[] = [];
  for (const rule of ACTION_RULES) {
    if (rule.statuses && !rule.statuses.includes(instance.status)) continue;
    if (rule.when && !rule.when(instance)) {
      if (rule.reason) {
        result.push({
          id: rule.id,
          label: rule.label,
          isDisabled: true,
          disabledReason: rule.reason,
        });
      }
      continue;
    }
    const passive = rule.id === "log" || rule.id === "console";
    let isDisabled = false;
    let disabledReason: string | undefined;
    if (deleting) {
      isDisabled = true;
      disabledReason = "The instance is being deleted";
    } else if (busy && !passive && rule.id !== "delete") {
      isDisabled = true;
      disabledReason = "Wait for the current task to finish";
    } else if (instance.locked && rule.id === "delete") {
      isDisabled = true;
      disabledReason = "Unlock the instance first";
    }
    const action: AvailableAction = {
      id: rule.id,
      label: rule.label,
      isDisabled,
    };
    if (rule.tone) action.tone = rule.tone;
    if (disabledReason) action.disabledReason = disabledReason;
    result.push(action);
  }
  return result;
}

/** The instance's addresses as "10.0.0.1, 203.0.113.5 (floating)". */
export function addressSummary(instance: Instance): string[] {
  return instance.addresses.map((address) =>
    address.type === "floating" ? `${address.addr} (floating)` : address.addr,
  );
}

/**
 * Split a batch selection into the rows an action applies to and the rows
 * it does not. Horizon's batch actions run only on rows whose `allowed()`
 * passes (horizon/tables/actions.py BatchAction) and the table disables the
 * button when none do; this uses the same rules as the row menu.
 */
export function batchTargets<T extends Instance>(
  rows: T[],
  id: InstanceActionId,
): { allowed: T[]; skipped: T[] } {
  const allowed: T[] = [];
  const skipped: T[] = [];
  for (const row of rows) {
    const action = availableActions(row).find((a) => a.id === id);
    if (action && !action.isDisabled) allowed.push(row);
    else skipped.push(row);
  }
  return { allowed, skipped };
}
