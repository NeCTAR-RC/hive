import { describe, expect, it } from "vitest";
import type { Share, ShareDetail, ShareOptions } from "../../lib/api/types";
import { newestSnapshot } from "./shareForms";
import { defaultAccessType, shareDeleteConfirmText } from "./status";

const share = { id: "share-1", name: "data" } as Share;

// Manila lists newest first: the last entry is the oldest.
const options = {
  snapshots: [
    { id: "snap-new", name: "tuesday", size: 1, share_id: "share-1" },
    { id: "snap-old", name: "monday", size: 1, share_id: "share-1" },
  ],
  newest_snapshot_ids: { "share-1": "snap-new" },
} as unknown as ShareOptions;

describe("newestSnapshot", () => {
  it("defaults the revert to the snapshot the backend names", () => {
    expect(newestSnapshot(share, options)).toEqual({
      id: "snap-new",
      label: "tuesday",
    });
  });

  it("prefers the share detail's newest_snapshot_id", () => {
    const detail = {
      ...share,
      newest_snapshot_id: "snap-old",
    } as unknown as ShareDetail;
    expect(newestSnapshot(detail, options)?.id).toBe("snap-old");
  });

  it("offers nothing when the newest snapshot is not available", () => {
    const busy = {
      ...options,
      newest_snapshot_ids: { "share-1": "snap-creating" },
    } as ShareOptions;
    expect(newestSnapshot(share, busy)).toBeNull();
    expect(newestSnapshot(share, undefined)).toBeNull();
  });
});

describe("share helpers", () => {
  it("defaults access rules to cephx for CephFS and ip otherwise", () => {
    expect(defaultAccessType("CEPHFS")).toBe("cephx");
    expect(defaultAccessType("cephfs")).toBe("cephx");
    expect(defaultAccessType("NFS")).toBe("ip");
    expect(defaultAccessType(null)).toBe("ip");
  });

  it("asks for the same typed confirmation on every delete", () => {
    expect(shareDeleteConfirmText([{ id: "s1", name: "data" }])).toBe("data");
    expect(shareDeleteConfirmText([{ id: "s1", name: null }])).toBe("s1");
    expect(
      shareDeleteConfirmText([
        { id: "s1", name: "a" },
        { id: "s2", name: "b" },
      ]),
    ).toBe("delete 2 shares");
  });
});
