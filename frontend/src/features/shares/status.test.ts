import { describe, expect, it } from "vitest";
import type { ActionOffer } from "../../lib/actions";
import type {
  Share,
  ShareGroup,
  ShareGroupSnapshot,
  ShareSnapshot,
} from "../../lib/api/types/shares";
import {
  availableShareActions,
  availableShareGroupActions,
  availableShareGroupSnapshotActions,
  availableShareSnapshotActions,
  newestSnapshot,
  ruleStateTone,
  statusLabel,
  statusTone,
} from "./status";

describe("share status", () => {
  it.each([
    { status: "available", tone: "success", label: "Available" },
    { status: "in-use", tone: "success", label: "In-use" },
    { status: "creating", tone: "progress", label: "Creating" },
    { status: "migrating_to", tone: "progress", label: "Migrating to" },
    { status: "EXTENDING", tone: "progress", label: "Extending" },
    { status: "error_deleting", tone: "danger", label: "Error deleting" },
    { status: "inactive", tone: "neutral", label: "Inactive" },
    { status: null, tone: "neutral", label: "Unknown" },
  ])("$status is $label ($tone)", ({ status, tone, label }) => {
    expect(statusTone(status)).toBe(tone);
    expect(statusLabel(status)).toBe(label);
  });

  it.each([
    { state: "active", tone: "success" },
    { state: "error", tone: "danger" },
    { state: "queued_to_apply", tone: "progress" },
    { state: "applying", tone: "progress" },
    { state: "queued_to_deny", tone: "progress" },
    { state: "denying", tone: "progress" },
    { state: null, tone: "neutral" },
  ])("access rule $state is $tone", ({ state, tone }) => {
    expect(ruleStateTone(state)).toBe(tone);
  });
});

/** The reason each offer is disabled, or null when it can run. */
function reasons<Id extends string>(offers: ActionOffer<Id>[]) {
  return Object.fromEntries(
    offers.map((offer) => [offer.id, offer.disabledReason ?? null]),
  );
}

const SHARE: Share = {
  id: "s-1",
  name: "datasets",
  description: null,
  size: 10,
  status: "available",
  protocol: "CEPHFS",
  is_public: false,
  share_type: "cephfs",
  share_type_id: "t-1",
  availability_zone: null,
  share_group_id: null,
  snapshot_id: null,
  metadata: {},
  created_at: null,
  snapshot_support: true,
  revert_to_snapshot_support: true,
  mount_snapshot_support: false,
  has_snapshot: false,
  is_transitional: false,
  actions: ["edit", "resize", "revert", "snapshot", "metadata", "delete"],
};

describe("share actions", () => {
  it("lists every action and allows what the backend allows", () => {
    expect(reasons(availableShareActions(SHARE))).toEqual({
      edit: null,
      resize: null,
      revert: null,
      snapshot: null,
      rules: null,
      metadata: null,
      delete: null,
    });
  });

  it("disables the rest with their reasons while the share is busy", () => {
    const busy = { ...SHARE, status: "extending", actions: [] };
    expect(reasons(availableShareActions(busy))).toEqual({
      edit: "The share can be edited once it is available",
      resize: "The share can be resized once it is available",
      revert: "The share can be reverted once it is available",
      snapshot: "Snapshots are not available for this share right now",
      rules: null,
      metadata: "Metadata can be edited once the share is available",
      delete: "The share cannot be deleted while it is busy",
    });
  });

  it("names the missing revert support and the snapshots in the way", () => {
    const share = {
      ...SHARE,
      revert_to_snapshot_support: false,
      has_snapshot: true,
      actions: ["edit"],
    };
    expect(reasons(availableShareActions(share))).toMatchObject({
      revert: "This share type does not support reverting to a snapshot",
      delete: "Delete the share's snapshots first",
    });
  });
});

describe("share snapshot actions", () => {
  const snapshot: ShareSnapshot = {
    id: "ss-1",
    name: "datasets-snap",
    description: null,
    size: 10,
    status: "available",
    share_id: "s-1",
    share_name: "datasets",
    share_proto: "CEPHFS",
    share_size: 10,
    created_at: null,
    is_transitional: false,
    actions: ["create_share", "delete"],
  };

  it("needs the backend's leave for each action but edit", () => {
    expect(reasons(availableShareSnapshotActions(snapshot))).toEqual({
      edit: null,
      "create-share": null,
      rules: "The share does not support mounting snapshots",
      delete: null,
    });
    expect(
      reasons(availableShareSnapshotActions({ ...snapshot, actions: [] })),
    ).toMatchObject({
      "create-share": "The snapshot must be available",
      delete: "The snapshot cannot be deleted while it is busy",
    });
  });
});

describe("share group actions", () => {
  const group: ShareGroup = {
    id: "g-1",
    name: "group-a",
    description: null,
    status: "available",
    availability_zone: null,
    share_group_type_id: null,
    share_types: [],
    source_share_group_snapshot_id: null,
    consistent_snapshot_support: null,
    created_at: null,
    is_transitional: false,
    actions: ["snapshot", "edit", "delete"],
  };

  it("offers snapshot, edit and delete while the group is available", () => {
    expect(reasons(availableShareGroupActions(group))).toEqual({
      snapshot: null,
      edit: null,
      delete: null,
    });
  });

  it("disables them while the group is busy", () => {
    expect(
      reasons(availableShareGroupActions({ ...group, actions: [] })),
    ).toEqual({
      snapshot: "The share group must be available",
      edit: "The share group is busy",
      delete: "The share group is busy",
    });
  });
});

describe("share group snapshot actions", () => {
  const snapshot: ShareGroupSnapshot = {
    id: "gs-1",
    name: "group-a-snap",
    description: null,
    status: "creating",
    share_group_id: "g-1",
    share_group_name: "group-a",
    created_at: null,
    members: [],
    is_transitional: true,
    actions: [],
  };

  it("disables every action while the snapshot is busy", () => {
    expect(reasons(availableShareGroupSnapshotActions(snapshot))).toEqual({
      "create-group": "The snapshot must be available",
      edit: "The snapshot is busy",
      delete: "The snapshot is busy",
    });
  });
});

describe("newestSnapshot", () => {
  const snapshots = [
    { id: "b", share_id: "s-1", created_at: "2026-10-02T00:00:00" },
    { id: "c", share_id: "s-1", created_at: "2026-10-03T00:00:00" },
    { id: "a", share_id: "s-1", created_at: "2026-10-01T00:00:00" },
    { id: "z", share_id: "s-2", created_at: "2026-10-09T00:00:00" },
  ];

  it("takes the share's newest by creation time, not list order", () => {
    expect(newestSnapshot(snapshots, "s-1")?.id).toBe("c");
  });

  it("finds none for a share without snapshots", () => {
    expect(newestSnapshot(snapshots, "s-3")).toBeUndefined();
  });
});
