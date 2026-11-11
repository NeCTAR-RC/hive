import { describe, expect, it } from "vitest";
import { launchOptions } from "../../../mocks/compute/handlers";
import {
  chosenNetworks,
  defaultNetworkIds,
  findSourceItem,
  flavorTooSmall,
  isSourceOffered,
  parseSource,
  sourceItems,
  userDataTooLarge,
  volumeSizeFloor,
  volumeSizeNote,
  volumeTypesForZone,
  volumeZoneNote,
  type SourceOptions,
  emptySourceText,
  flavorQuotaProblem,
  instanceQuotaProblem,
} from "./launch";

describe("parseSource", () => {
  it.each([
    { value: "image:img-1", expected: { type: "image", id: "img-1" } },
    { value: "snapshot:snap-1", expected: { type: "snapshot", id: "snap-1" } },
    { value: "volume:vol-1", expected: { type: "volume", id: "vol-1" } },
    {
      value: "volume_snapshot:vs-1",
      expected: { type: "volume_snapshot", id: "vs-1" },
    },
    { value: undefined, expected: null },
    { value: "", expected: null },
    { value: "image", expected: null },
    { value: "image:", expected: null },
    { value: "share:sh-1", expected: null },
  ])("reads '$value' as $expected", ({ value, expected }) => {
    expect(parseSource(value)).toEqual(expected);
  });
});

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

describe("chosenNetworks", () => {
  const networks = [
    { id: "classic", name: "classic", is_classic: true },
    { id: "a", name: "alpha", is_classic: false },
  ];

  it("names the chosen networks in the chosen order", () => {
    expect(chosenNetworks(networks, ["a", "classic"])).toEqual([
      { id: "a", name: "alpha", isClassic: false },
      { id: "classic", name: "classic", isClassic: true },
    ]);
  });

  it("keeps a network the options do not list, by its id", () => {
    expect(chosenNetworks(null, ["gone"])).toEqual([
      { id: "gone", name: "gone", isClassic: false },
    ]);
  });
});

/** Images, snapshots and volumes as the mock launch options offer them. */
const options: SourceOptions = {
  ...launchOptions(),
  volumes: [
    {
      id: "vol-qh2",
      name: "data-qh2",
      size_gb: 20,
      availability_zone: "melbourne-qh2",
      status: "available",
      bootable: true,
    },
    {
      id: "vol-monash",
      name: "data-monash",
      size_gb: 10,
      availability_zone: "monash-01",
      status: "available",
      bootable: true,
    },
    {
      id: "vol-anywhere",
      name: "scratch",
      size_gb: 5,
      availability_zone: null,
      status: "available",
      bootable: true,
    },
  ],
  volume_snapshots: [
    {
      id: "vs-1",
      name: "nightly",
      size_gb: 20,
      status: "available",
      volume_id: null,
    },
  ],
};

const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe("sourceItems", () => {
  it.each([
    {
      name: "images by name, community ones hidden",
      type: "image",
      zone: "",
      search: "",
      expected: ["img-mine", "img-rocky", "img-ubuntu"],
    },
    {
      name: "community images once searched",
      type: "image",
      zone: "",
      search: "COMMUNITY",
      expected: ["img-community"],
    },
    {
      name: "instance snapshots",
      type: "snapshot",
      zone: "",
      search: "",
      expected: ["snap-1"],
    },
    {
      name: "volumes in the chosen zone or with none",
      type: "volume",
      zone: "monash-01",
      search: "",
      expected: ["vol-monash", "vol-anywhere"],
    },
    {
      name: "every volume before a zone is chosen",
      type: "volume",
      zone: "",
      search: "",
      expected: ["vol-qh2", "vol-monash", "vol-anywhere"],
    },
    {
      name: "volumes matching the search",
      type: "volume",
      zone: "",
      search: " data ",
      expected: ["vol-qh2", "vol-monash"],
    },
    {
      name: "volume snapshots",
      type: "volume_snapshot",
      zone: "",
      search: "",
      expected: ["vs-1"],
    },
  ] as const)("lists $name", ({ type, zone, search, expected }) => {
    expect(ids(sourceItems(options, type, zone, search, ""))).toEqual(expected);
  });

  it("describes each source", () => {
    const [volume] = sourceItems(options, "volume", "melbourne-qh2", "qh2", "");
    expect(volume).toMatchObject({
      name: "data-qh2",
      meta: "20 GB, melbourne-qh2",
    });
  });

  it("keeps the chosen source listed whatever the search shows", () => {
    expect(
      ids(sourceItems(options, "image", "", "rocky", "img-ubuntu")),
    ).toEqual(["img-rocky", "img-ubuntu"]);
    // A community image chosen from a search stays once the search is gone.
    expect(ids(sourceItems(options, "image", "", "", "img-community"))).toEqual(
      ["img-community", "img-mine", "img-rocky", "img-ubuntu"],
    );
  });

  it("still leaves out a chosen volume outside the zone", () => {
    expect(
      ids(sourceItems(options, "volume", "monash-01", "", "vol-qh2")),
    ).toEqual(["vol-monash", "vol-anywhere"]);
  });
});

describe("findSourceItem", () => {
  it("names the chosen source of the type, in any zone", () => {
    expect(findSourceItem(options, "volume", "vol-qh2")).toMatchObject({
      name: "data-qh2",
      meta: "20 GB, melbourne-qh2",
    });
    expect(findSourceItem(options, "image", "img-community")?.name).toBe(
      "community-bioinformatics",
    );
  });

  it("finds nothing unchosen, of another type or unlisted", () => {
    expect(findSourceItem(options, "image", "")).toBeUndefined();
    expect(findSourceItem(options, "volume", "img-ubuntu")).toBeUndefined();
    expect(findSourceItem(options, "image", "img-gone")).toBeUndefined();
  });
});

describe("isSourceOffered", () => {
  it.each([
    { type: "image", zone: "", id: "img-ubuntu", offered: true },
    { type: "image", zone: "", id: "img-community", offered: true },
    { type: "volume", zone: "", id: "img-ubuntu", offered: false },
    { type: "snapshot", zone: "", id: "img-ubuntu", offered: false },
    { type: "volume", zone: "monash-01", id: "vol-qh2", offered: false },
    { type: "volume", zone: "melbourne-qh2", id: "vol-qh2", offered: true },
    { type: "volume_snapshot", zone: "", id: "vs-1", offered: true },
  ] as const)(
    "$id as a $type in '$zone': $offered",
    ({ type, zone, id, offered }) => {
      expect(isSourceOffered(options, type, zone, id)).toBe(offered);
    },
  );
});

describe("userDataTooLarge", () => {
  // Nova takes at most 65535 base64 characters: 49149 bytes of script.
  it.each([
    { name: "an empty script", script: "", tooLarge: false },
    { name: "49,000 ASCII bytes", script: "a".repeat(49_000), tooLarge: false },
    { name: "49,149 ASCII bytes", script: "a".repeat(49_149), tooLarge: false },
    { name: "49,150 ASCII bytes", script: "a".repeat(49_150), tooLarge: true },
    {
      // 24,575 two-byte characters are 49,150 bytes, far under 64K characters.
      name: "24,575 two-byte characters",
      script: "\u00e9".repeat(24_575),
      tooLarge: true,
    },
    {
      name: "16,383 three-byte characters",
      script: "\u20ac".repeat(16_383),
      tooLarge: false,
    },
  ])("$name: $tooLarge", ({ script, tooLarge }) => {
    expect(userDataTooLarge(script)).toBe(tooLarge);
  });
});

describe("flavorTooSmall", () => {
  const image = { min_disk: 20, min_ram: 2048 };

  it.each([
    {
      name: "a flavour that fits",
      flavor: { disk_gb: 30, ram_mb: 4096 },
      reason: null,
    },
    {
      name: "a disk under the minimum",
      flavor: { disk_gb: 10, ram_mb: 4096 },
      reason: "Disk is smaller than the image's minimum (20 GB)",
    },
    {
      name: "RAM under the minimum",
      flavor: { disk_gb: 30, ram_mb: 1024 },
      reason: "RAM is below the image's minimum (2 GB)",
    },
    {
      name: "a volume-backed flavour with enough RAM",
      flavor: { disk_gb: 0, ram_mb: 4096 },
      reason: null,
    },
    {
      name: "a flavour of unknown size",
      flavor: { disk_gb: null, ram_mb: null },
      reason: null,
    },
  ])("judges $name: $reason", ({ flavor, reason }) => {
    expect(flavorTooSmall(flavor, image, false)).toBe(reason);
  });

  it("checks only RAM when a new volume carries the root disk", () => {
    expect(flavorTooSmall({ disk_gb: 10, ram_mb: 4096 }, image, true)).toBe(
      null,
    );
    expect(flavorTooSmall({ disk_gb: 10, ram_mb: 1024 }, image, true)).toBe(
      "RAM is below the image's minimum (2 GB)",
    );
  });

  it("checks nothing when no image is chosen", () => {
    expect(
      flavorTooSmall({ disk_gb: 1, ram_mb: 1 }, undefined, false),
    ).toBeNull();
  });

  it("checks nothing against an image without minimums", () => {
    const bare = { min_disk: null, min_ram: null };
    expect(flavorTooSmall({ disk_gb: 1, ram_mb: 1 }, bare, false)).toBeNull();
  });
});

describe("volumeZoneNote", () => {
  it("names the zone of a volume source", () => {
    expect(volumeZoneNote(options, "volume", "vol-qh2")).toBe(
      "The volume data-qh2 is in melbourne-qh2, and a volume can only boot an instance in its own zone.",
    );
  });

  it("says nothing for other sources or a volume without a zone", () => {
    expect(volumeZoneNote(options, "image", "img-ubuntu")).toBeNull();
    expect(volumeZoneNote(options, "volume", "vol-anywhere")).toBeNull();
    expect(volumeZoneNote(options, "volume", "")).toBeNull();
  });
});

describe("launch quota", () => {
  const limits = {
    maxTotalInstances: 10,
    totalInstancesUsed: 9,
    maxTotalCores: 32,
    totalCoresUsed: 30,
    maxTotalRAMSize: 65536,
    totalRAMUsed: 61440,
  };

  it("names the instances left", () => {
    expect(instanceQuotaProblem(limits, 1)).toBeNull();
    expect(instanceQuotaProblem(limits, 2)).toBe(
      "Your project can launch 1 more instance (9 of 10 in use). Reduce the count or free up quota.",
    );
    expect(
      instanceQuotaProblem({ ...limits, totalInstancesUsed: 10 }, 1),
    ).toMatch(/no room for another instance/);
  });

  it("checks vCPUs, then RAM, for the whole count", () => {
    expect(flavorQuotaProblem(limits, { vcpus: 2, ram_mb: 4096 }, 1)).toBe(
      null,
    );
    expect(flavorQuotaProblem(limits, { vcpus: 4, ram_mb: 1024 }, 1)).toBe(
      "This flavour needs 4 vCPUs; your project has 2 left (30 of 32 in use).",
    );
    expect(flavorQuotaProblem(limits, { vcpus: 1, ram_mb: 4096 }, 2)).toBe(
      "2 instances of this flavour need 8 GB of RAM; your project has 4 GB left (60 GB of 64 GB in use).",
    );
  });

  it("allows anything under an unlimited or unknown quota", () => {
    expect(instanceQuotaProblem(undefined, 100)).toBeNull();
    expect(
      flavorQuotaProblem(
        { maxTotalCores: -1, totalCoresUsed: 99 },
        { vcpus: 64, ram_mb: 1 },
        10,
      ),
    ).toBeNull();
  });
});

describe("volumeSizeFloor", () => {
  it("is the image size rounded up, or its minimum disk", () => {
    expect(volumeSizeFloor({ size: 650_000_000, min_disk: 0 }, undefined)).toBe(
      1,
    );
    expect(
      volumeSizeFloor({ size: 2_100_000_000, min_disk: 0 }, undefined),
    ).toBe(2);
    expect(
      volumeSizeFloor({ size: 650_000_000, min_disk: 10 }, undefined),
    ).toBe(10);
    expect(volumeSizeFloor(undefined, undefined)).toBe(1);
  });

  it("rises to the flavour's root disk", () => {
    const image = { size: 650_000_000, min_disk: 10 };
    expect(volumeSizeFloor(image, { disk_gb: 30 })).toBe(30);
    expect(volumeSizeFloor(image, { disk_gb: 5 })).toBe(10);
    expect(volumeSizeFloor(image, { disk_gb: 0 })).toBe(10);
    expect(volumeSizeFloor(image, { disk_gb: null })).toBe(10);
  });
});

describe("volumeSizeNote", () => {
  const image = { size: 650_000_000, min_disk: 10 };

  it("states the floor, and both reasons when the flavour raises it", () => {
    expect(volumeSizeNote(image, undefined)).toBe(
      "At least 10 GB for this source.",
    );
    expect(volumeSizeNote(image, { name: "m3.small", disk_gb: 30 })).toBe(
      "At least 30 GB: the source needs 10 GB and the m3.small flavour's root disk is 30 GB.",
    );
    expect(volumeSizeNote(image, { name: "big", disk_gb: 0 })).toBe(
      "At least 10 GB for this source.",
    );
  });
});

describe("volumeTypesForZone", () => {
  const types = launchOptions().volume_types ?? [];
  const names = (list: { name: string }[]) => list.map((t) => t.name);

  it("offers the types serving the zone when types name zones", () => {
    const zoned = { volume_types: types, has_zoned_types: true };
    expect(names(volumeTypesForZone(zoned, "melbourne-qh2"))).toEqual([
      "standard",
      "qh2-ssd",
    ]);
    expect(names(volumeTypesForZone(zoned, "monash-01"))).toEqual(["standard"]);
  });

  it("offers every type when none names a zone", () => {
    expect(
      volumeTypesForZone({ volume_types: types, has_zoned_types: false }, ""),
    ).toHaveLength(types.length);
    expect(
      volumeTypesForZone({ volume_types: null, has_zoned_types: false }, ""),
    ).toEqual([]);
  });
});

describe("emptySourceText", () => {
  it("names the search, the zone, or the missing sources", () => {
    expect(emptySourceText("volume", "monash-01", "web")).toBe(
      "Nothing matches your search.",
    );
    expect(emptySourceText("volume", "monash-01", "")).toMatch(
      /^No bootable volumes in monash-01\. .*own zone/,
    );
    expect(emptySourceText("volume", "", "")).toMatch(/marked bootable/);
    expect(emptySourceText("volume_snapshot", "", "")).toBe(
      "This project has no volume snapshots.",
    );
  });
});
