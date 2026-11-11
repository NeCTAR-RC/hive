// Manila status wording (manila-ui shares/tables.py STATUS_CHOICES) and
// the row action rules of shares, share snapshots, share groups and share
// group snapshots.
import type { StatusTone } from "../../components/StatusPill/StatusPill";
import {
  offerActions,
  type ActionCheck,
  type ActionTable,
} from "../../lib/actions";
import type {
  SecurityServiceRequest,
  Share,
  ShareGroup,
  ShareGroupSnapshot,
  ShareSnapshot,
} from "../../lib/api/types/shares";
import { defineStatus } from "../../lib/status";

const readers = defineStatus({
  transitional: [
    "creating",
    "deleting",
    "reverting",
    "migrating",
    "migrating_to",
    "extending",
    "shrinking",
  ],
  success: ["available", "in-use"],
  danger: (status) => status.includes("error"),
  labels: { "in-use": "In-use" },
});

/** Manila's status, in any case, as its tone. */
export function statusTone(status: string | null | undefined): StatusTone {
  return readers.tone(status?.toLowerCase());
}

export const statusLabel = readers.label;

export function ruleStateTone(state: string | null | undefined): StatusTone {
  switch (state) {
    case "active":
      return "success";
    case "error":
      return "danger";
    case "queued_to_apply":
    case "applying":
    case "queued_to_deny":
    case "denying":
      return "progress";
    default:
      return "neutral";
  }
}

export const ACCESS_TYPES = [
  { id: "ip", label: "IP address or network" },
  { id: "user", label: "User" },
  { id: "cert", label: "Certificate" },
  { id: "cephx", label: "CephX user" },
];

export const ACCESS_LEVELS = [
  { id: "rw", label: "Read and write" },
  { id: "ro", label: "Read only" },
];

export const SECURITY_SERVICE_TYPES = [
  { id: "active_directory", label: "Active Directory" },
  { id: "ldap", label: "LDAP" },
  { id: "kerberos", label: "Kerberos" },
] satisfies { id: SecurityServiceRequest["type"]; label: string }[];

/**
 * A check on the actions the backend allows the item now (its `actions`,
 * worked out from manila-ui's allowed() rules): when `action` is not among
 * them, the action is disabled with `reason`.
 */
function backendAllows<T extends { actions: string[] }>(
  action: string,
  reason: string | ((item: T) => string),
): ActionCheck<T, void> {
  return (item) =>
    !item.actions.includes(action) &&
    (typeof reason === "string" ? reason : reason(item));
}

export type ShareActionId =
  "edit" | "resize" | "revert" | "snapshot" | "rules" | "metadata" | "delete";

/** The share menu in manila-ui's order (shares/tables.py row actions). */
const SHARE_ACTIONS: ActionTable<ShareActionId, Share> = {
  rules: [
    {
      id: "edit",
      label: "Edit share",
      checks: [
        backendAllows("edit", "The share can be edited once it is available"),
      ],
    },
    {
      id: "resize",
      label: "Resize share",
      checks: [
        backendAllows(
          "resize",
          "The share can be resized once it is available",
        ),
      ],
    },
    {
      id: "revert",
      label: "Revert to snapshot",
      checks: [
        (share) =>
          !share.revert_to_snapshot_support &&
          "This share type does not support reverting to a snapshot",
        backendAllows(
          "revert",
          "The share can be reverted once it is available",
        ),
      ],
    },
    {
      id: "snapshot",
      label: "Create snapshot",
      checks: [
        backendAllows(
          "snapshot",
          "Snapshots are not available for this share right now",
        ),
      ],
    },
    { id: "rules", label: "Manage rules" },
    {
      id: "metadata",
      label: "Edit metadata",
      checks: [
        backendAllows(
          "metadata",
          "Metadata can be edited once the share is available",
        ),
      ],
    },
    {
      id: "delete",
      label: "Delete share",
      tone: "danger",
      checks: [
        backendAllows("delete", (share: Share) =>
          share.has_snapshot
            ? "Delete the share's snapshots first"
            : "The share cannot be deleted while it is busy",
        ),
      ],
    },
  ],
};

/** The share's menu, every action with its availability. */
export function availableShareActions(share: Share) {
  return offerActions(SHARE_ACTIONS, share);
}

export type ShareSnapshotActionId =
  "edit" | "create-share" | "rules" | "delete";

/** The share snapshot menu (share_snapshots/tables.py row actions). */
const SHARE_SNAPSHOT_ACTIONS: ActionTable<
  ShareSnapshotActionId,
  ShareSnapshot
> = {
  rules: [
    { id: "edit", label: "Edit snapshot" },
    {
      id: "create-share",
      label: "Create share from snapshot",
      checks: [backendAllows("create_share", "The snapshot must be available")],
    },
    {
      id: "rules",
      label: "Manage snapshot rules",
      checks: [
        backendAllows("rules", "The share does not support mounting snapshots"),
      ],
    },
    {
      id: "delete",
      label: "Delete snapshot",
      tone: "danger",
      checks: [
        backendAllows(
          "delete",
          "The snapshot cannot be deleted while it is busy",
        ),
      ],
    },
  ],
};

/** The share snapshot's menu, every action with its availability. */
export function availableShareSnapshotActions(snapshot: ShareSnapshot) {
  return offerActions(SHARE_SNAPSHOT_ACTIONS, snapshot);
}

export type ShareGroupActionId = "snapshot" | "edit" | "delete";

/** The share group menu (share_groups/tables.py row actions). */
const SHARE_GROUP_ACTIONS: ActionTable<ShareGroupActionId, ShareGroup> = {
  rules: [
    {
      id: "snapshot",
      label: "Create share group snapshot",
      checks: [backendAllows("snapshot", "The share group must be available")],
    },
    {
      id: "edit",
      label: "Edit share group",
      checks: [backendAllows("edit", "The share group is busy")],
    },
    {
      id: "delete",
      label: "Delete share group",
      tone: "danger",
      checks: [backendAllows("delete", "The share group is busy")],
    },
  ],
};

/** The share group's menu, every action with its availability. */
export function availableShareGroupActions(group: ShareGroup) {
  return offerActions(SHARE_GROUP_ACTIONS, group);
}

export type ShareGroupSnapshotActionId = "create-group" | "edit" | "delete";

/** The share group snapshot menu (share_group_snapshots/tables.py). */
const SHARE_GROUP_SNAPSHOT_ACTIONS: ActionTable<
  ShareGroupSnapshotActionId,
  ShareGroupSnapshot
> = {
  rules: [
    {
      id: "create-group",
      label: "Create share group from snapshot",
      checks: [backendAllows("create_group", "The snapshot must be available")],
    },
    {
      id: "edit",
      label: "Edit share group snapshot",
      checks: [backendAllows("edit", "The snapshot is busy")],
    },
    {
      id: "delete",
      label: "Delete share group snapshot",
      tone: "danger",
      checks: [backendAllows("delete", "The snapshot is busy")],
    },
  ],
};

/** The share group snapshot's menu, every action with its availability. */
export function availableShareGroupSnapshotActions(
  snapshot: ShareGroupSnapshot,
) {
  return offerActions(SHARE_GROUP_SNAPSHOT_ACTIONS, snapshot);
}

/**
 * The snapshot of share `shareId` that a revert accepts: its newest by
 * creation time, as the backend checks it (`hive.nectar.shares`
 * `newest_snapshot`, after manila-ui forms.py), not the last one listed.
 */
export function newestSnapshot<
  T extends Pick<ShareSnapshot, "share_id" | "created_at">,
>(snapshots: readonly T[], shareId: string): T | undefined {
  let newest: T | undefined;
  for (const snapshot of snapshots) {
    if (snapshot.share_id !== shareId) continue;
    if (!newest || (snapshot.created_at ?? "") > (newest.created_at ?? "")) {
      newest = snapshot;
    }
  }
  return newest;
}
