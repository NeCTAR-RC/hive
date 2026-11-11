// Instance status presentation and the action availability rules, ported
// from Horizon's project/instances/tables.py so the row menu offers what
// Horizon offers.
import type { Instance } from "../../../lib/api/types/compute";
import type { StatusTone } from "../../../components/StatusPill/StatusPill";
import {
  offerActions,
  type ActionCheck,
  type ActionOffer,
  type ActionTable,
} from "../../../lib/actions";
import { defineStatus, enumLabel, humanise } from "../../../lib/status";

const readers = defineStatus({
  transitional: [
    "BUILD",
    "REBUILD",
    "RESIZE",
    "REVERT_RESIZE",
    "REBOOT",
    "HARD_REBOOT",
    "MIGRATING",
    "PASSWORD",
    "DELETED",
  ],
  success: ["ACTIVE"],
  warning: ["PAUSED", "SUSPENDED", "RESCUE", "VERIFY_RESIZE"],
  danger: ["ERROR"],
  neutral: ["SHUTOFF", "SHELVED", "SHELVED_OFFLOADED"],
  otherwise: "info",
});

/** Busy while Nova runs a task on it or its status is a transitional one. */
export function isTransitional(
  instance: Pick<Instance, "status" | "task_state">,
) {
  return (
    Boolean(instance.task_state) || readers.isTransitional(instance.status)
  );
}

export function isDeleting(instance: Pick<Instance, "task_state">) {
  return instance.task_state === "deleting";
}

export function statusTone(
  instance: Pick<Instance, "status" | "task_state">,
): StatusTone {
  return isTransitional(instance) ? "progress" : readers.tone(instance.status);
}

/**
 * The words in the Status column, in Nova's own case as Horizon shows
 * them: the task while there is one.
 */
export function statusLabel(instance: Instance): string {
  return enumLabel(instance.task_state || instance.status);
}

/**
 * Horizon's wording for the two-word power states (`POWER_DISPLAY_CHOICES`
 * in project/instances/tables.py); `humanise` would run them together
 * ("Shutoff"). The one-word states read as the capitalised word.
 */
const POWER_LABELS: Readonly<Record<string, string>> = {
  "NO STATE": "No state",
  SHUTDOWN: "Shut down",
  SHUTOFF: "Shut off",
};

export function powerStateLabel(instance: Pick<Instance, "power_state">) {
  const state = instance.power_state || "NO STATE";
  return POWER_LABELS[state] ?? humanise(state);
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
  | "attach-volume"
  | "detach-volume"
  | "snapshot"
  | "resize"
  | "confirm-resize"
  | "revert-resize"
  | "rebuild"
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
  | "rescue"
  | "unrescue"
  | "lock"
  | "unlock"
  | "delete";

/** What the instance rules read beyond the instance itself. */
export interface InstanceActionContext {
  /**
   * The instances with a port a floating IP can reach (behind a router
   * with a gateway to a floating network), once known.
   */
  floatingTargets?: ReadonlySet<string> | undefined;
}

const ACTIVE_OR_SHUTOFF = ["ACTIVE", "SHUTOFF"];

/** Actions a running task leaves available: watching it, or deleting. */
const ALLOWED_WHILE_BUSY = new Set<InstanceActionId>([
  "console",
  "log",
  "delete",
]);

type InstanceCheck = ActionCheck<Instance, InstanceActionContext>;

/**
 * Nova refuses most actions on a locked instance to anyone but an admin
 * (its `check_instance_lock` guard), so they say how to proceed. It
 * runs after the status, which unlocking would not change.
 */
const unlockFirst: InstanceCheck = (instance) =>
  instance.locked && "Unlock the instance first";

/**
 * The row menu, grouped into sections, from Horizon's
 * project/instances/tables.py. A deleting instance offers nothing; a task
 * in progress leaves only the console, the log and delete.
 */
const INSTANCE_ACTIONS: ActionTable<
  InstanceActionId,
  Instance,
  InstanceActionContext
> = {
  statusOf: (instance) => instance.status,
  statusLabel,
  guard: (instance, id) => {
    if (isDeleting(instance)) return "The instance is being deleted";
    if (isTransitional(instance) && !ALLOWED_WHILE_BUSY.has(id)) {
      return "Wait for the current task to finish";
    }
    return null;
  },
  rules: [
    {
      id: "console",
      label: "Console (opens in a new tab)",
      group: "View",
      statuses: ["ACTIVE", "RESCUE"],
    },
    { id: "log", label: "View log", group: "View" },
    { id: "edit", label: "Edit instance", group: "Edit" },
    { id: "security-groups", label: "Edit security groups", group: "Edit" },
    {
      id: "metadata",
      label: "Update metadata",
      group: "Edit",
      checks: [unlockFirst],
    },
    {
      id: "attach-interface",
      label: "Attach interface",
      group: "Network",
      statuses: ACTIVE_OR_SHUTOFF,
      checks: [unlockFirst],
    },
    {
      id: "detach-interface",
      label: "Detach interface",
      group: "Network",
      statuses: ACTIVE_OR_SHUTOFF,
      checks: [unlockFirst],
    },
    // Horizon's AssociateIP and DisassociateIP: the first needs a port a
    // floating IP can reach, the second a floating address.
    {
      id: "associate-fip",
      label: "Associate floating IP",
      group: "Network",
      checks: [
        (i, context) =>
          context.floatingTargets !== undefined &&
          !context.floatingTargets.has(i.id) &&
          "No port behind a router; floating IPs do not work on the classic network",
      ],
    },
    {
      id: "disassociate-fip",
      label: "Disassociate floating IP",
      group: "Network",
      checks: [
        (i) =>
          !i.addresses.some((a) => a.type === "floating") &&
          "The instance has no floating IP",
      ],
    },
    // Horizon's AttachVolume and DetachVolume, in VOLUME_ATTACH_READY_STATES.
    {
      id: "attach-volume",
      label: "Attach volume",
      group: "Storage",
      statuses: ACTIVE_OR_SHUTOFF,
      checks: [unlockFirst],
    },
    {
      id: "detach-volume",
      label: "Detach volume",
      group: "Storage",
      statuses: ACTIVE_OR_SHUTOFF,
      checks: [
        unlockFirst,
        (i) => i.volumes_attached.length === 0 && "No volumes are attached",
      ],
    },
    {
      id: "snapshot",
      label: "Create snapshot",
      group: "Storage",
      statuses: ["ACTIVE", "SHUTOFF", "PAUSED", "SUSPENDED"],
    },
    {
      id: "resize",
      label: "Resize instance",
      group: "Resize",
      statuses: ACTIVE_OR_SHUTOFF,
      checks: [unlockFirst],
    },
    {
      id: "confirm-resize",
      label: "Confirm resize",
      group: "Resize",
      statuses: ["VERIFY_RESIZE"],
    },
    {
      id: "revert-resize",
      label: "Revert resize",
      group: "Resize",
      statuses: ["VERIFY_RESIZE"],
      checks: [unlockFirst],
    },
    {
      id: "rebuild",
      label: "Rebuild instance",
      group: "Resize",
      statuses: ACTIVE_OR_SHUTOFF,
      checks: [
        unlockFirst,
        (i) =>
          i.boot_from_volume &&
          "Instances booted from a volume cannot be rebuilt",
      ],
    },
    {
      id: "start",
      label: "Start instance",
      group: "Power",
      statuses: ["SHUTOFF", "CRASHED"],
      checks: [unlockFirst],
    },
    {
      id: "stop",
      label: "Shut off instance",
      group: "Power",
      statuses: ["ACTIVE", "ERROR"],
      checks: [unlockFirst],
    },
    {
      id: "soft-reboot",
      label: "Soft reboot",
      group: "Power",
      statuses: ACTIVE_OR_SHUTOFF,
      checks: [unlockFirst],
    },
    {
      id: "hard-reboot",
      label: "Hard reboot",
      group: "Power",
      statuses: ACTIVE_OR_SHUTOFF,
      checks: [unlockFirst],
    },
    {
      id: "pause",
      label: "Pause instance",
      group: "Power",
      statuses: ["ACTIVE"],
      checks: [unlockFirst],
    },
    {
      id: "unpause",
      label: "Unpause instance",
      group: "Power",
      statuses: ["PAUSED"],
      checks: [unlockFirst],
    },
    {
      id: "suspend",
      label: "Suspend instance",
      group: "Power",
      statuses: ["ACTIVE"],
      checks: [unlockFirst],
    },
    {
      id: "resume",
      label: "Resume instance",
      group: "Power",
      statuses: ["SUSPENDED"],
      checks: [unlockFirst],
    },
    {
      id: "shelve",
      label: "Shelve instance",
      group: "Power",
      statuses: ["ACTIVE", "SHUTOFF", "PAUSED", "SUSPENDED"],
      checks: [unlockFirst],
    },
    {
      id: "unshelve",
      label: "Unshelve instance",
      group: "Power",
      statuses: ["SHELVED", "SHELVED_OFFLOADED"],
      checks: [unlockFirst],
    },
    {
      id: "rescue",
      label: "Rescue instance",
      group: "Rescue",
      statuses: ACTIVE_OR_SHUTOFF,
      checks: [unlockFirst],
    },
    {
      id: "unrescue",
      label: "Unrescue instance",
      group: "Rescue",
      statuses: ["RESCUE"],
      checks: [unlockFirst],
    },
    {
      id: "lock",
      label: "Lock instance",
      group: "Lock",
      checks: [(i) => i.locked && "The instance is already locked"],
    },
    {
      id: "unlock",
      label: "Unlock instance",
      group: "Lock",
      checks: [(i) => !i.locked && "The instance is not locked"],
    },
    {
      id: "delete",
      label: "Delete instance",
      tone: "danger",
      group: "Delete",
      checks: [unlockFirst],
    },
  ],
};

/**
 * The instance's row menu, every action with its availability. Without a
 * context the rules that read one (the floating IP targets) allow the
 * action, and its dialog explains what is missing.
 */
export function availableActions(
  instance: Instance,
  context: InstanceActionContext = {},
): ActionOffer<InstanceActionId>[] {
  return offerActions(INSTANCE_ACTIONS, instance, context);
}

export interface StatusFilter {
  id: string;
  label: string;
  /** The statuses the filter shows; empty shows every instance. */
  statuses: string[];
}

/**
 * The list's status filter. A filter can cover several Nova statuses:
 * "Shelved" covers an instance both before and after it is offloaded.
 */
export const STATUS_FILTERS: StatusFilter[] = [
  { id: "", label: "All statuses", statuses: [] },
  { id: "ACTIVE", label: "Active", statuses: ["ACTIVE"] },
  { id: "SHUTOFF", label: "Shut off", statuses: ["SHUTOFF"] },
  { id: "ERROR", label: "Error", statuses: ["ERROR"] },
  { id: "BUILD", label: "Building", statuses: ["BUILD"] },
  { id: "PAUSED", label: "Paused", statuses: ["PAUSED"] },
  { id: "SUSPENDED", label: "Suspended", statuses: ["SUSPENDED"] },
  {
    id: "SHELVED",
    label: "Shelved",
    statuses: ["SHELVED", "SHELVED_OFFLOADED"],
  },
  { id: "VERIFY_RESIZE", label: "Verify resize", statuses: ["VERIFY_RESIZE"] },
];

/**
 * Whether an instance passes the status filter with this id. An id that is
 * not a listed filter (an old link, say) matches that exact status.
 */
export function matchesStatusFilter(
  instance: Pick<Instance, "status">,
  filterId: string,
): boolean {
  const filter = STATUS_FILTERS.find((f) => f.id === filterId);
  if (!filter) return instance.status === filterId;
  return (
    filter.statuses.length === 0 || filter.statuses.includes(instance.status)
  );
}

/** One of an instance's addresses, as the list shows it. */
export interface ListedAddress {
  addr: string;
  floating: boolean;
}

/**
 * The instance's addresses, fixed ones first and then the floating ones
 * users connect to, as Horizon's IP column lists them.
 */
export function listedAddresses(instance: Instance): ListedAddress[] {
  const listed = instance.addresses.flatMap((address) =>
    address.addr
      ? [{ addr: address.addr, floating: address.type === "floating" }]
      : [],
  );
  return [
    ...listed.filter((address) => !address.floating),
    ...listed.filter((address) => address.floating),
  ];
}
