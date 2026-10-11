import { describe, expect, it } from "vitest";
import type { VolumeOptions } from "../../../lib/api/types";
import { gigabytesAvailable, sizeFloor, typesForZone } from "./rules";

const options: VolumeOptions = {
  availability_zones: [],
  volume_types: [
    {
      id: "a",
      name: "standard",
      description: null,
      is_public: true,
      zones: null,
    },
    {
      id: "b",
      name: "qh2-ssd",
      description: null,
      is_public: true,
      zones: ["melbourne-qh2"],
    },
  ],
  has_zoned_types: true,
  images: [
    {
      id: "img",
      name: "img",
      size: 2 * 1024 ** 3 + 1,
      min_disk: 5,
      disk_format: "qcow2",
      is_snapshot: false,
    },
  ],
  snapshots: [
    {
      id: "snap",
      name: "s",
      description: null,
      size_gb: 20,
      status: "available",
      volume_id: "v",
      volume_name: "v",
      progress: null,
      group_snapshot_id: null,
      metadata: {},
      created_at: null,
      updated_at: null,
    },
  ],
  volumes: [],
  limits: { maxTotalVolumeGigabytes: 100, totalGigabytesUsed: 30 },
  errors: {},
};

describe("volume create rules", () => {
  it("filters types by zone only when some type names a zone", () => {
    expect(typesForZone(options, "monash-02").map((t) => t.name)).toEqual([
      "standard",
    ]);
    expect(typesForZone(options, "melbourne-qh2").map((t) => t.name)).toEqual([
      "standard",
      "qh2-ssd",
    ]);
    expect(
      typesForZone({ ...options, has_zoned_types: false }, "monash-02").length,
    ).toBe(2);
  });

  it("floors the size at the source size", () => {
    expect(sizeFloor(options, "none", "")).toBe(1);
    expect(sizeFloor(options, "image", "img")).toBe(5);
    expect(
      sizeFloor(
        { ...options, images: [{ ...options.images[0]!, min_disk: 0 }] },
        "image",
        "img",
      ),
    ).toBe(3);
    expect(sizeFloor(options, "snapshot", "snap")).toBe(20);
    expect(sizeFloor(options, "snapshot", "missing")).toBe(1);
  });

  it("reports the remaining quota", () => {
    expect(gigabytesAvailable(options.limits)).toBe(70);
    expect(gigabytesAvailable({ maxTotalVolumeGigabytes: -1 })).toBeNull();
    expect(gigabytesAvailable(undefined)).toBeNull();
  });
});
