// Volume, snapshot and backup status presentation and the row action
// rules, ported from Horizon's project/volumes, snapshots and backups
// tables.py so the menus offer what Horizon offers.
import type { StatusTone } from "../../components/StatusPill/StatusPill";
import type {
  Volume,
  VolumeBackup,
  VolumeLimits,
  VolumeSnapshot,
} from "../../lib/api/types";

const TRANSITIONAL = new Set([
  "creating",
  "deleting",
  "attaching",
  "detaching",
  "extending",
  "backing-up",
  "restoring-backup",
  "restoring",
  "downloading",
  "uploading",
  "retyping",
  "reserved",
  "maintenance",
]);

// Horizon's STATUS_DISPLAY_CHOICES where the words differ from the raw
// status; everything else is the status with its separators spaced out.
const LABELS: Record<string, string> = {
  "in-use": "In use",
  "backing-up": "Backing up",
  "restoring-backup": "Restoring backup",
  "awaiting-transfer": "Awaiting transfer",
  error_deleting: "Error deleting",
  error_extending: "Error extending",
  error_restoring: "Error restoring",
  error_managing: "Error managing",
};

// Horizon volumes/tables.py DELETABLE_STATES and backups/tables.py.
const VOLUME_DELETABLE = new Set([
  "available",
  "error",
  "error_extending",
  "error_deleting",
  "error_managing",
]);
const BACKUP_DELETABLE = new Set(["available", "error"]);
const AVAILABLE_OR_IN_USE = ["available", "in-use"];

export function isTransitional(item: { status: string }) {
  return TRANSITIONAL.has(item.status);
}

export function statusTone(status: string): StatusTone {
  if (TRANSITIONAL.has(status)) return "progress";
  if (status === "available") return "success";
  if (status === "in-use") return "info";
  if (status.startsWith("error")) return "danger";
  return "neutral";
}

export function statusLabel(status: string): string {
  const known = LABELS[status];
  if (known) return known;
  const spaced = status.replace(/[_-]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export interface ActionOffer<Id extends string> {
  id: Id;
  label: string;
  tone?: "danger";
  isDisabled: boolean;
  disabledReason?: string;
}

interface Rule<Id extends string, T> {
  id: Id;
  label: string;
  tone?: "danger";
  statuses?: string[];
  when?: (item: T) => boolean;
  reason?: string;
}

function offer<Id extends string, T extends { status: string }>(
  rules: Rule<Id, T>[],
  item: T,
): ActionOffer<Id>[] {
  return rules.map((rule) => {
    const statusOk = !rule.statuses || rule.statuses.includes(item.status);
    const whenOk = !rule.when || rule.when(item);
    const isDisabled = !statusOk || !whenOk;
    const reason = !statusOk
      ? `Not available while the status is ${statusLabel(item.status).toLowerCase()}`
      : rule.reason;
    return {
      id: rule.id,
      label: rule.label,
      ...(rule.tone ? { tone: rule.tone } : {}),
      isDisabled,
      ...(isDisabled && reason ? { disabledReason: reason } : {}),
    };
  });
}

export type VolumeActionId =
  | "edit"
  | "extend"
  | "launch"
  | "attachments"
  | "snapshot"
  | "backup"
  | "upload-to-image"
  | "delete";

// The order is Horizon's row menu order (minus retype, transfer and
// metadata, which are not in Hive's M2 scope).
const VOLUME_RULES: Rule<VolumeActionId, Volume>[] = [
  { id: "edit", label: "Edit volume", statuses: AVAILABLE_OR_IN_USE },
  { id: "extend", label: "Extend volume", statuses: AVAILABLE_OR_IN_USE },
  {
    id: "launch",
    label: "Launch as instance",
    statuses: ["available"],
    when: (v) => v.bootable,
    reason: "Only bootable volumes can be launched",
  },
  {
    id: "attachments",
    label: "Manage attachments",
    statuses: AVAILABLE_OR_IN_USE,
  },
  { id: "snapshot", label: "Create snapshot", statuses: AVAILABLE_OR_IN_USE },
  { id: "backup", label: "Create backup", statuses: AVAILABLE_OR_IN_USE },
  {
    id: "upload-to-image",
    label: "Upload to image",
    statuses: AVAILABLE_OR_IN_USE,
  },
  {
    id: "delete",
    label: "Delete volume",
    tone: "danger",
    statuses: [...VOLUME_DELETABLE],
    when: (v) => !v.has_snapshots && !v.group_id,
    reason: "Delete the volume's snapshots first",
  },
];

/** Whether a "max/used" pair of Cinder limits has room left. */
function quotaLeft(
  limits: VolumeLimits | undefined,
  maxKey: string,
  usedKey: string,
) {
  const max = limits?.[maxKey];
  if (max === undefined || max < 0) return true;
  return (limits?.[usedKey] ?? 0) < max;
}

/**
 * The row menu for a volume. With the project's limits, Create snapshot
 * and Create backup grey out once their quota is used, as Horizon's
 * CreateSnapshot action does ("Quota exceeded").
 */
export function availableVolumeActions(volume: Volume, limits?: VolumeLimits) {
  return offer(VOLUME_RULES, volume).map((action) => {
    if (
      action.id === "snapshot" &&
      !action.isDisabled &&
      !quotaLeft(limits, "maxTotalSnapshots", "totalSnapshotsUsed")
    ) {
      return {
        ...action,
        isDisabled: true,
        disabledReason: "Snapshot quota exceeded",
      };
    }
    if (
      action.id === "backup" &&
      !action.isDisabled &&
      !quotaLeft(limits, "maxTotalBackups", "totalBackupsUsed")
    ) {
      return {
        ...action,
        isDisabled: true,
        disabledReason: "Backup quota exceeded",
      };
    }
    return action;
  });
}

export type SnapshotActionId =
  "create-volume" | "launch" | "backup" | "edit" | "delete";

const SNAPSHOT_RULES: Rule<SnapshotActionId, VolumeSnapshot>[] = [
  { id: "create-volume", label: "Create volume", statuses: ["available"] },
  { id: "launch", label: "Launch as instance", statuses: ["available"] },
  {
    id: "backup",
    label: "Create backup",
    statuses: ["available"],
    // A backup is of a volume; an orphaned snapshot has none to name.
    when: (s) => Boolean(s.volume_id),
    reason: "The snapshot's volume no longer exists",
  },
  { id: "edit", label: "Edit snapshot", statuses: ["available"] },
  {
    id: "delete",
    label: "Delete snapshot",
    tone: "danger",
    when: (s) => s.status !== "backing-up" && !s.group_snapshot_id,
    reason: "The snapshot is being backed up or belongs to a group",
  },
];

export function availableSnapshotActions(snapshot: VolumeSnapshot) {
  return offer(SNAPSHOT_RULES, snapshot);
}

export type BackupActionId = "restore" | "delete";

const BACKUP_RULES: Rule<BackupActionId, VolumeBackup>[] = [
  { id: "restore", label: "Restore backup", statuses: ["available"] },
  {
    id: "delete",
    label: "Delete backup",
    tone: "danger",
    statuses: [...BACKUP_DELETABLE],
  },
];

export function availableBackupActions(backup: VolumeBackup) {
  return offer(BACKUP_RULES, backup);
}

/** "/dev/vdb on web-1" style wording for the Attached To column. */
export function attachmentLabel(
  attachment: { device: string | null; server_id: string | null },
  instanceName: string | undefined,
) {
  const target = instanceName ?? attachment.server_id ?? "an instance";
  return attachment.device ? `${attachment.device} on ${target}` : target;
}
