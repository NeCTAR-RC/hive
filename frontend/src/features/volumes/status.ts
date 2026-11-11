// Volume, snapshot and backup status presentation and the row action
// rules, ported from Horizon's project/volumes, snapshots and backups
// tables.py so the menus offer what Horizon offers.
import type {
  Volume,
  VolumeBackup,
  VolumeLimits,
  VolumeSnapshot,
} from "../../lib/api/types/volumes";
import { offerActions, type ActionTable } from "../../lib/actions";
import { hasRoom, quotaPair } from "../../lib/quota";
import { defineStatus } from "../../lib/status";

const TRANSITIONAL = [
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
];

// Horizon's STATUS_DISPLAY_CHOICES read as the status in sentence case, so
// no label needs its own words.
const readers = defineStatus({
  transitional: TRANSITIONAL,
  success: ["available"],
  info: ["in-use"],
  warning: ["awaiting-transfer"],
  danger: (value) => value.startsWith("error"),
});

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
  return readers.isTransitional(item.status);
}

export const statusTone = readers.tone;
export const statusLabel = readers.label;

/** The status as the Status column shows it, for the action reasons. */
const byStatus = {
  statusOf: (item: { status: string }) => item.status,
  statusLabel: (item: { status: string }) => statusLabel(item.status),
};

export type VolumeActionId =
  | "edit"
  | "extend"
  | "launch"
  | "attachments"
  | "snapshot"
  | "backup"
  | "retype"
  | "upload-to-image"
  | "transfer"
  | "cancel-transfer"
  | "metadata"
  | "delete";

/**
 * The volume row menu in Horizon's order, with Delete moved last. With the
 * project's limits, Create snapshot and Create backup grey out once their
 * quota is used, as Horizon's CreateSnapshot action does.
 */
const VOLUME_ACTIONS: ActionTable<
  VolumeActionId,
  Volume,
  VolumeLimits | undefined
> = {
  ...byStatus,
  rules: [
    { id: "edit", label: "Edit volume", statuses: AVAILABLE_OR_IN_USE },
    { id: "extend", label: "Extend volume", statuses: AVAILABLE_OR_IN_USE },
    {
      id: "launch",
      label: "Launch as instance",
      statuses: ["available"],
      checks: [(v) => !v.bootable && "Only bootable volumes can be launched"],
    },
    {
      id: "attachments",
      label: "Manage attachments",
      statuses: AVAILABLE_OR_IN_USE,
    },
    {
      id: "snapshot",
      label: "Create snapshot",
      statuses: AVAILABLE_OR_IN_USE,
      checks: [
        (_, limits) =>
          !hasRoom(
            quotaPair(limits, "maxTotalSnapshots", "totalSnapshotsUsed"),
          ) && "Snapshot quota exceeded",
      ],
    },
    {
      id: "backup",
      label: "Create backup",
      statuses: AVAILABLE_OR_IN_USE,
      checks: [
        (_, limits) =>
          !hasRoom(quotaPair(limits, "maxTotalBackups", "totalBackupsUsed")) &&
          "Backup quota exceeded",
      ],
    },
    {
      id: "retype",
      label: "Change volume type",
      statuses: AVAILABLE_OR_IN_USE,
    },
    {
      id: "upload-to-image",
      label: "Upload to image",
      statuses: AVAILABLE_OR_IN_USE,
    },
    { id: "transfer", label: "Create transfer", statuses: ["available"] },
    {
      id: "cancel-transfer",
      label: "Cancel transfer",
      tone: "danger",
      statuses: ["awaiting-transfer"],
    },
    {
      id: "metadata",
      label: "Update metadata",
      statuses: AVAILABLE_OR_IN_USE,
    },
    {
      id: "delete",
      label: "Delete volume",
      tone: "danger",
      statuses: [...VOLUME_DELETABLE],
      checks: [
        (v) =>
          (v.has_snapshots || Boolean(v.group_id)) &&
          "Delete the volume's snapshots first",
      ],
    },
  ],
};

export function availableVolumeActions(volume: Volume, limits?: VolumeLimits) {
  return offerActions(VOLUME_ACTIONS, volume, limits);
}

export type SnapshotActionId =
  "create-volume" | "launch" | "backup" | "edit" | "metadata" | "delete";

const SNAPSHOT_ACTIONS: ActionTable<SnapshotActionId, VolumeSnapshot> = {
  ...byStatus,
  rules: [
    { id: "create-volume", label: "Create volume", statuses: ["available"] },
    { id: "launch", label: "Launch as instance", statuses: ["available"] },
    {
      id: "backup",
      label: "Create backup",
      statuses: ["available"],
      // Cinder backs a snapshot up through its volume; an orphaned
      // snapshot has none to name.
      checks: [(s) => !s.volume_id && "The snapshot's volume no longer exists"],
    },
    { id: "edit", label: "Edit snapshot", statuses: ["available"] },
    { id: "metadata", label: "Update metadata", statuses: ["available"] },
    {
      id: "delete",
      label: "Delete snapshot",
      tone: "danger",
      checks: [
        (s) =>
          (s.status === "backing-up" || Boolean(s.group_snapshot_id)) &&
          "The snapshot is being backed up or belongs to a group",
      ],
    },
  ],
};

export function availableSnapshotActions(snapshot: VolumeSnapshot) {
  return offerActions(SNAPSHOT_ACTIONS, snapshot);
}

export type BackupActionId = "restore" | "delete";

const BACKUP_ACTIONS: ActionTable<BackupActionId, VolumeBackup> = {
  ...byStatus,
  rules: [
    { id: "restore", label: "Restore backup", statuses: ["available"] },
    {
      id: "delete",
      label: "Delete backup",
      tone: "danger",
      statuses: [...BACKUP_DELETABLE],
    },
  ],
};

export function availableBackupActions(backup: VolumeBackup) {
  return offerActions(BACKUP_ACTIONS, backup);
}

/** "/dev/vdb on web-1" style wording for the Attached To column. */
export function attachmentLabel(
  attachment: { device: string | null; server_id: string | null },
  instanceName: string | undefined,
) {
  const target = instanceName ?? attachment.server_id ?? "an instance";
  return attachment.device ? `${attachment.device} on ${target}` : target;
}
