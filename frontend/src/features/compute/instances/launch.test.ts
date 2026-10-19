import { describe, expect, it } from "vitest";
import type {
  Flavor,
  Image,
  LaunchOptions,
  Reservation,
} from "../../../lib/api/types";
import {
  defaultNetworkIds,
  findSourceItem,
  flavorDisplayName,
  flavorGroupId,
  flavorGroups,
  flavorQuotaProblem,
  GIB,
  reservationForFlavor,
  volumeSizeFloor,
} from "./launch";

const classic = { id: "classic", is_classic: true };
const alpha = { id: "a", is_classic: false };
const bravo = { id: "b", is_classic: false };

describe("defaultNetworkIds", () => {
  it("preselects the classic network wherever it sits", () => {
    expect(defaultNetworkIds([alpha, classic, bravo])).toEqual(["classic"]);
  });

  it("preselects a network only when it is the sole choice", () => {
    expect(defaultNetworkIds([alpha])).toEqual(["a"]);
    expect(defaultNetworkIds([alpha, bravo])).toEqual([]);
  });

  it("selects nothing when no network is offered", () => {
    expect(defaultNetworkIds([])).toEqual([]);
    expect(defaultNetworkIds(null)).toEqual([]);
    expect(defaultNetworkIds(undefined)).toEqual([]);
  });
});

describe("flavorQuotaProblem", () => {
  const flavor = { vcpus: 4, ram_mb: 16384 };
  const limits = {
    maxTotalCores: 10,
    totalCoresUsed: 2,
    maxTotalRAMSize: 65536,
    totalRAMUsed: 0,
  };

  it("accepts a flavour that fits the remaining quota", () => {
    expect(flavorQuotaProblem(flavor, limits, 2)).toBeNull();
  });

  it("multiplies by the instance count", () => {
    expect(flavorQuotaProblem(flavor, limits, 3)).toMatch(/vCPUs/);
    expect(
      flavorQuotaProblem(flavor, { ...limits, maxTotalCores: 100 }, 5),
    ).toMatch(/RAM/);
  });

  it("treats a cleared count as one and unlimited quota as no limit", () => {
    expect(flavorQuotaProblem(flavor, limits, Number.NaN)).toBeNull();
    expect(
      flavorQuotaProblem(
        flavor,
        { maxTotalCores: -1, maxTotalRAMSize: -1 },
        50,
      ),
    ).toBeNull();
    expect(flavorQuotaProblem(flavor, null, 50)).toBeNull();
  });
});

describe("volumeSizeFloor", () => {
  it("rounds the image up to whole gigabytes, or takes its min_disk", () => {
    expect(volumeSizeFloor({ size: 1.5 * GIB, min_disk: 1 }, undefined)).toBe(
      2,
    );
    expect(
      volumeSizeFloor({ size: 650 * 1024 ** 2, min_disk: 10 }, undefined),
    ).toBe(10);
  });

  it("never drops below the flavour's root disk, or below 1 GB", () => {
    expect(volumeSizeFloor({ size: GIB, min_disk: 0 }, { disk_gb: 30 })).toBe(
      30,
    );
    expect(
      volumeSizeFloor({ size: 5 * GIB, min_disk: 0 }, { disk_gb: 0 }),
    ).toBe(5);
    expect(volumeSizeFloor(undefined, undefined)).toBe(1);
    expect(volumeSizeFloor({ size: null, min_disk: null }, null as never)).toBe(
      1,
    );
  });
});

function flavor(overrides: Partial<Flavor> & { id: string }): Flavor {
  return {
    name: overrides.id,
    vcpus: 1,
    ram_mb: 1024,
    disk_gb: 10,
    ephemeral_gb: 0,
    swap_mb: 0,
    is_public: true,
    flavor_class: null,
    su_rate: null,
    is_preemptible: false,
    is_reservation: false,
    reservation_id: null,
    extra_specs: {},
    ...overrides,
  };
}

describe("flavour groups", () => {
  const reserved = flavor({
    id: "res-1",
    name: "reservation:res-1",
    flavor_class: "standard-v3",
    is_reservation: true,
    reservation_id: "res-1",
  });
  const balanced = flavor({ id: "m3", flavor_class: "standard-v3" });
  const plain = flavor({ id: "c1" });

  it("groups a reservation flavour as reserved whatever class it carries", () => {
    expect(flavorGroupId(reserved)).toBe("reserved");
    expect(flavorGroupId(balanced)).toBe("standard-v3");
    expect(flavorGroupId(plain)).toBe("other");
  });

  it("offers Reserved first, the described classes, then Other", () => {
    const classes = [
      {
        id: "standard-v3",
        title: "Balanced (m3)",
        description: "Suited to most workloads.",
        count: 1,
      },
      { id: "gone", title: "gone", description: null, count: 0 },
    ];
    const groups = flavorGroups(classes, [plain, reserved, balanced]);
    expect(groups.map((g) => [g.id, g.count])).toEqual([
      ["reserved", 1],
      ["standard-v3", 1],
      ["other", 1],
    ]);
    expect(groups[0]?.title).toBe("Reserved");
    expect(groups[1]?.description).toBe("Suited to most workloads.");
  });

  it("falls back to raw class names without the backend's list", () => {
    const zed = flavor({ id: "z", flavor_class: "zzz" });
    const groups = flavorGroups(null, [zed, balanced, balanced]);
    expect(groups.map((g) => [g.id, g.title, g.count])).toEqual([
      ["standard-v3", "standard-v3", 2],
      ["zzz", "zzz", 1],
    ]);
    expect(flavorGroups(null, [])).toEqual([]);
  });

  it("finds the warre reservation behind a reservation flavour", () => {
    const reservations = [
      { id: "w-1", compute_flavor: "res-1" },
      { id: "w-2", compute_flavor: null },
    ] as Reservation[];
    expect(reservationForFlavor(reserved, reservations)?.id).toBe("w-1");
    expect(reservationForFlavor(balanced, reservations)).toBeUndefined();
    expect(reservationForFlavor(reserved, undefined)).toBeUndefined();
  });
});

describe("findSourceItem", () => {
  const image = {
    id: "img-1",
    name: "Ubuntu 24.04",
    visibility: "public",
    size: 2 * GIB,
    min_disk: 10,
    min_ram: 0,
    is_snapshot: false,
  } as unknown as Image;
  const data = {
    images: [image],
    snapshots: [{ ...image, id: "snap-1", name: "snap", is_snapshot: true }],
    volumes: [
      {
        id: "vol-1",
        name: "data",
        size_gb: 20,
        availability_zone: "melbourne-qh2",
      },
    ],
    volume_snapshots: [{ id: "vs-1", name: "vs", size_gb: 5 }],
  } as unknown as LaunchOptions;

  it("names each kind of source with its details", () => {
    expect(findSourceItem(data, "image", "img-1")).toEqual({
      id: "img-1",
      name: "Ubuntu 24.04",
      meta: "public, 2 GB, min disk 10 GB",
    });
    expect(findSourceItem(data, "snapshot", "snap-1")?.meta).toMatch(
      /^snapshot/,
    );
    expect(findSourceItem(data, "volume", "vol-1")).toEqual({
      id: "vol-1",
      name: "data",
      meta: "20 GB, melbourne-qh2",
    });
    expect(findSourceItem(data, "volume_snapshot", "vs-1")?.meta).toBe("5 GB");
  });

  it("returns nothing for an empty or unknown choice", () => {
    expect(findSourceItem(data, "image", "")).toBeUndefined();
    expect(findSourceItem(data, "image", "nope")).toBeUndefined();
    expect(findSourceItem(data, undefined, "img-1")).toBeUndefined();
  });
});

describe("flavorDisplayName", () => {
  const reservations = [
    {
      id: "w-1",
      compute_flavor: "res-1",
      end: "2026-10-21T23:59:00+00:00",
      flavor: { name: "ardc.g3.xlarge" },
    },
  ] as unknown as Reservation[];
  const reserved = flavor({
    id: "res-1",
    name: "reservation:res-1",
    is_reservation: true,
    reservation_id: "res-1",
  });

  it("names a reservation flavour after its warre reservation", () => {
    expect(flavorDisplayName(reserved, reservations, () => "21 Oct 2026")).toBe(
      "ardc.g3.xlarge reservation (until 21 Oct 2026)",
    );
  });

  it("falls back to the nova name without the list or for other flavours", () => {
    expect(flavorDisplayName(reserved, undefined, () => "x")).toBe(
      "reservation:res-1",
    );
    expect(
      flavorDisplayName(flavor({ id: "m3" }), reservations, () => "x"),
    ).toBe("m3");
  });
});
