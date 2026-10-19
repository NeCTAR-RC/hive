import { describe, expect, it } from "vitest";
import type { Volume, VolumeSnapshot } from "../../lib/api/types";
import {
  attachmentLabel,
  availableSnapshotActions,
  availableVolumeActions,
  isTransitional,
  statusLabel,
  statusTone,
} from "./status";

function volume(overrides: Partial<Volume> = {}): Volume {
  return {
    id: "vol-1",
    name: "data",
    description: null,
    size_gb: 20,
    status: "available",
    volume_type: "standard",
    availability_zone: "melbourne-qh2",
    bootable: false,
    encrypted: false,
    multiattach: false,
    attachments: [],
    snapshot_id: null,
    source_volume_id: null,
    image: null,
    group_id: null,
    metadata: {},
    created_at: "2026-10-01T00:00:00Z",
    updated_at: null,
    has_snapshots: false,
    ...overrides,
  };
}

const enabled = <T extends { id: string; isDisabled: boolean }>(offers: T[]) =>
  offers.filter((o) => !o.isDisabled).map((o) => o.id);

describe("status presentation", () => {
  it("labels and tones statuses", () => {
    expect(statusLabel("in-use")).toBe("In use");
    expect(statusLabel("error_extending")).toBe("Error extending");
    expect(statusLabel("creating")).toBe("Creating");
    expect(statusTone("available")).toBe("success");
    expect(statusTone("in-use")).toBe("info");
    expect(statusTone("error_deleting")).toBe("danger");
    expect(statusTone("backing-up")).toBe("progress");
    expect(isTransitional({ status: "extending" })).toBe(true);
    expect(isTransitional({ status: "available" })).toBe(false);
  });

  it("words attachments", () => {
    expect(
      attachmentLabel({ device: "/dev/vdb", server_id: "i-1" }, "web-1"),
    ).toBe("/dev/vdb on web-1");
    expect(attachmentLabel({ device: null, server_id: "i-1" }, undefined)).toBe(
      "i-1",
    );
  });
});

describe("availableVolumeActions", () => {
  it("offers the Horizon set for an available volume", () => {
    const offers = availableVolumeActions(volume());
    expect(enabled(offers)).toEqual([
      "edit",
      "extend",
      "attachments",
      "snapshot",
      "backup",
      "upload-to-image",
      "delete",
    ]);
    const launch = offers.find((o) => o.id === "launch");
    expect(launch?.disabledReason).toMatch(/bootable/);
    expect(
      enabled(availableVolumeActions(volume({ bootable: true }))),
    ).toContain("launch");
  });

  it("greys out snapshot and backup once their quota is used", () => {
    const offers = availableVolumeActions(volume(), {
      maxTotalSnapshots: 0,
      totalSnapshotsUsed: 0,
      maxTotalBackups: -1,
      totalBackupsUsed: 5,
    });
    const snapshot = offers.find((o) => o.id === "snapshot");
    expect(snapshot?.isDisabled).toBe(true);
    expect(snapshot?.disabledReason).toBe("Snapshot quota exceeded");
    expect(offers.find((o) => o.id === "backup")?.isDisabled).toBe(false);
  });

  it("keeps a volume with snapshots from being deleted", () => {
    const offers = availableVolumeActions(volume({ has_snapshots: true }));
    const del = offers.find((o) => o.id === "delete");
    expect(del?.isDisabled).toBe(true);
    expect(del?.disabledReason).toMatch(/snapshots first/);
  });

  it("disables everything while creating", () => {
    const offers = availableVolumeActions(volume({ status: "creating" }));
    expect(enabled(offers)).toEqual([]);
    expect(offers[0]?.disabledReason).toMatch(/status is creating/);
  });
});

describe("availableSnapshotActions", () => {
  it("offers create volume and launch for available snapshots only", () => {
    const snapshot: VolumeSnapshot = {
      id: "snap-1",
      name: "s",
      description: null,
      size_gb: 20,
      status: "available",
      volume_id: "vol-1",
      volume_name: "data",
      progress: "100%",
      group_snapshot_id: null,
      metadata: {},
      created_at: null,
      updated_at: null,
    };
    expect(enabled(availableSnapshotActions(snapshot))).toEqual([
      "create-volume",
      "launch",
      "backup",
      "edit",
      "delete",
    ]);
    expect(
      enabled(availableSnapshotActions({ ...snapshot, status: "backing-up" })),
    ).toEqual([]);
    const orphan = availableSnapshotActions({ ...snapshot, volume_id: null });
    expect(enabled(orphan)).not.toContain("backup");
    expect(orphan.find((a) => a.id === "backup")?.disabledReason).toMatch(
      /no longer exists/,
    );
  });
});
