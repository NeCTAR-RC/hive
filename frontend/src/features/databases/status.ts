// Trove status wording (trove-dashboard databases/tables.py STATUS_CHOICES
// and STATUS_DISPLAY_CHOICES, plus the Nectar UPGRADE state) and the row
// action rules of instances, backups and guest logs.
import type { StatusTone } from "../../components/StatusPill/StatusPill";
import {
  offerActions,
  type ActionCheck,
  type ActionTable,
} from "../../lib/actions";
import type {
  DbBackup,
  DbFlavor,
  DbInstance,
  DbLog,
} from "../../lib/api/types/databases";
import { formatMb } from "../../lib/format";
import { isCidr, isIpAddress } from "../../lib/net";
import { defineStatus } from "../../lib/status";

export function statusTone(
  kind: "ok" | "error" | "transitional" | "warning" | "unknown",
): StatusTone {
  switch (kind) {
    case "ok":
      return "success";
    case "error":
      return "danger";
    case "transitional":
      return "progress";
    case "warning":
      return "warning";
    default:
      return "neutral";
  }
}

// The backend classifies each status (`statusTone` above), so only the
// words live here; a status without words shows as Trove sent it.
const readers = defineStatus({
  labels: {
    ACTIVE: "Active",
    HEALTHY: "Healthy",
    BLOCKED: "Blocked",
    BUILD: "Building",
    FAILED: "Failed",
    REBOOT: "Rebooting",
    RESIZE: "Resizing",
    BACKUP: "Backing up",
    SHUTDOWN: "Shutdown",
    SHUTOFF: "Shut off",
    ERROR: "Error",
    RESTART_REQUIRED: "Restart required",
    UPGRADE: "Upgrading",
    COMPLETED: "Completed",
    RESTORED: "Restored",
    DELETE_FAILED: "Delete failed",
    BUILDING: "Building",
    NEW: "New",
    SAVING: "Saving",
    // guest log statuses (trove/guestagent/guest_log.py LogStatus)
    Restart_Required: "Restart required",
    Restart_Completed: "Restart completed",
  },
  unlisted: "as-is",
});

export const statusLabel = readers.label;

export type DbInstanceActionId =
  | "backup"
  | "update"
  | "resize_volume"
  | "resize"
  | "upgrade"
  | "attach"
  | "detach"
  | "root"
  | "restart"
  | "delete";

/**
 * A check that the backend lists `action` among the ones the instance's
 * status allows now (`instance_actions`), with the reason when it does not.
 */
function needs(action: string, reason: string): ActionCheck<DbInstance, void> {
  return (instance) => !instance.actions.includes(action) && reason;
}

const MUST_BE_ACTIVE = "The instance must be active";

/**
 * The database instance menu, from trove-dashboard's tables.py. The backend
 * reads the status and lists the actions Trove allows now in `actions`;
 * attaching and detaching a configuration group also depend on whether one
 * is attached, so both are listed and the one that does not apply says why.
 */
const DB_INSTANCE_ACTIONS: ActionTable<DbInstanceActionId, DbInstance> = {
  rules: [
    {
      id: "backup",
      label: "Create backup",
      checks: [
        needs("backup", "Backups can be taken once the instance is active"),
      ],
    },
    {
      id: "update",
      label: "Update instance",
      checks: [
        needs("update", "The instance can be updated once it is active"),
      ],
    },
    {
      id: "resize_volume",
      label: "Resize volume",
      checks: [
        needs(
          "resize_volume",
          "The volume can be resized once the instance is active",
        ),
      ],
    },
    {
      id: "resize",
      label: "Resize instance",
      checks: [
        needs(
          "resize",
          "The instance can be resized once it is active or shut off",
        ),
      ],
    },
    {
      id: "upgrade",
      label: "Upgrade instance",
      checks: [
        needs(
          "upgrade",
          "The instance can be upgraded once it is active or shut off",
        ),
      ],
    },
    {
      id: "attach",
      label: "Attach configuration group",
      checks: [
        (i) =>
          Boolean(i.configuration) &&
          "Detach the current configuration group first",
        needs("attach_configuration", MUST_BE_ACTIVE),
      ],
    },
    {
      id: "detach",
      label: "Detach configuration group",
      checks: [
        (i) => !i.configuration && "No configuration group is attached",
        needs("detach_configuration", MUST_BE_ACTIVE),
      ],
    },
    {
      id: "root",
      label: "Manage root access",
      checks: [
        needs("root", "Root access can be managed once the instance is active"),
      ],
    },
    {
      id: "restart",
      label: "Restart instance",
      checks: [needs("restart", "The instance cannot be restarted right now")],
    },
    { id: "delete", label: "Delete instance", tone: "danger" },
  ],
};

export function availableDbInstanceActions(instance: DbInstance) {
  return offerActions(DB_INSTANCE_ACTIONS, instance);
}

export type DbBackupActionId = "restore" | "delete";

/** The backup menu: only a completed backup restores to a new instance. */
const DB_BACKUP_ACTIONS: ActionTable<DbBackupActionId, DbBackup> = {
  rules: [
    {
      id: "restore",
      label: "Restore to a new instance",
      checks: [
        (b) => !b.can_restore && "Only completed backups can be restored",
      ],
    },
    { id: "delete", label: "Delete backup", tone: "danger" },
  ],
};

export function availableDbBackupActions(backup: DbBackup) {
  return offerActions(DB_BACKUP_ACTIONS, backup);
}

/**
 * The backups an incremental backup of `instanceId` can build on: its own
 * completed ones. Trove refuses a parent from another instance (the
 * backend answers 400), so no other backup is offered.
 */
export function parentBackups(
  backups: readonly DbBackup[],
  instanceId: string,
): DbBackup[] {
  return backups.filter(
    (b) => b.status === "COMPLETED" && b.instance_id === instanceId,
  );
}

/**
 * `parentId` when it is still a parent `instanceId` can build on, else ""
 * (a full backup): a parent chosen for one instance never goes out with
 * another.
 */
export function validParentId(
  backups: readonly DbBackup[],
  instanceId: string,
  parentId: string,
): string {
  if (!parentId) return "";
  return parentBackups(backups, instanceId).some((b) => b.id === parentId)
    ? parentId
    : "";
}

export type DbLogActionId =
  "view" | "publish" | "enable" | "disable" | "discard";

/**
 * The guest log menu, from trove-dashboard's logs/tables.py: a log shows
 * once something is published. Enable and disable follow the log's state
 * (the backend's `actions`): system logs are always on, and a user log
 * is switched on or off, whichever it is not.
 */
const DB_LOG_ACTIONS: ActionTable<DbLogActionId, DbLog> = {
  rules: [
    {
      id: "view",
      label: "View log",
      checks: [(l) => !l.actions.includes("view") && "Publish the log first"],
    },
    { id: "publish", label: "Publish log" },
    {
      id: "enable",
      label: "Enable log",
      checks: [
        (l) =>
          !l.actions.includes("enable") &&
          (l.type === "SYS"
            ? "System logs are always on"
            : "The log is already on"),
      ],
    },
    {
      id: "disable",
      label: "Disable log",
      checks: [
        (l) =>
          !l.actions.includes("disable") &&
          (l.type === "SYS"
            ? "System logs cannot be disabled"
            : "The log is already off"),
      ],
    },
    { id: "discard", label: "Discard log", tone: "danger" },
  ],
};

export function availableDbLogActions(log: DbLog) {
  return offerActions(DB_LOG_ACTIONS, log);
}

export function flavorLabel(flavor: DbFlavor): string {
  const parts = [
    flavor.vcpus ? `${flavor.vcpus} vCPU` : null,
    flavor.ram ? formatMb(flavor.ram) : null,
  ].filter(Boolean);
  return parts.length
    ? `${flavor.name} (${parts.join(", ")})`
    : (flavor.name ?? "");
}

/**
 * A datastore with its version, as "mysql 8.0"; empty when Trove sent no
 * datastore, so `KeyValueList` shows its dash.
 */
export function datastoreLabel(record: {
  datastore: string | null;
  datastore_version: string | null;
}): string {
  if (!record.datastore) return "";
  return record.datastore_version
    ? `${record.datastore} ${record.datastore_version}`
    : record.datastore;
}

export const CIDR_WARNING =
  "Allowing 0.0.0.0/0 may expose the database instance to the whole Internet. Restrict access to the networks that need it.";

export function hasOpenCidr(cidrs: string[]): boolean {
  return cidrs.some((c) => c.trim() === "0.0.0.0/0" || c.trim() === "::/0");
}

/**
 * Why the allowed CIDRs cannot be sent, or null when they can: Nectar
 * requires at least one (trove-dashboard `4d5dd91`), and each must be a
 * network with its prefix. A bare address is told to add one.
 */
export function cidrsError(cidrs: string[]): string | null {
  if (cidrs.length === 0)
    return "Enter at least one CIDR, such as 203.0.113.0/24";
  const bad = cidrs.find((cidr) => !isCidr(cidr));
  if (bad === undefined) return null;
  if (isIpAddress(bad, 4)) return `Add a prefix to ${bad}, such as ${bad}/32`;
  if (isIpAddress(bad, 6)) return `Add a prefix to ${bad}, such as ${bad}/128`;
  return `"${bad}" is not a CIDR, such as 203.0.113.0/24`;
}

export function splitCidrs(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((c) => c.trim())
    .filter(Boolean);
}

export const CONNECTION_EXAMPLES: Record<string, (host: string) => string> = {
  mysql: (host) => `mysql -h ${host} -P 3306 -u <user> -p`,
  mariadb: (host) => `mysql -h ${host} -P 3306 -u <user> -p`,
  postgresql: (host) => `psql -h ${host} -p 5432 -U <user> <database>`,
};
