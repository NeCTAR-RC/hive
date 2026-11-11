import { describe, expect, it } from "vitest";
import type {
  Volume,
  VolumeLimits,
  VolumeOptions,
} from "../../../lib/api/types/volumes";
import { instances } from "../../../mocks/compute/handlers";
import {
  attachBlockReason,
  attachCandidates,
  attachOptions,
  backupSnapshots,
  canAttachMore,
  createQuotaReason,
  createSizeError,
  gigabytesAvailable,
  inheritsPlacement,
  retypeChoices,
  sizeFloor,
  sourceChoices,
  typeLabel,
  typesForZone,
  type VolumeSource,
} from "./rules";

const snapshot = {
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
};

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
  snapshots: [snapshot],
  volumes: [],
  limits: { maxTotalVolumeGigabytes: 100, totalGigabytesUsed: 30 },
  errors: {},
};

describe("typesForZone", () => {
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
});

describe("sizeFloor", () => {
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
});

describe("gigabytesAvailable", () => {
  it("reports the remaining quota", () => {
    expect(gigabytesAvailable(options.limits)).toBe(70);
    expect(gigabytesAvailable({ maxTotalVolumeGigabytes: -1 })).toBeNull();
    expect(gigabytesAvailable(undefined)).toBeNull();
  });
});

describe("createSizeError", () => {
  it.each([
    { size: 20, floor: 20, available: 70, error: null },
    { size: 70, floor: 1, available: 70, error: null },
    { size: 500, floor: 1, available: null, error: null },
    {
      size: 10,
      floor: 20,
      available: 70,
      error: "The volume size cannot be less than the source size (20 GB)",
    },
    {
      size: 71,
      floor: 1,
      available: 70,
      error:
        "A 71 GB volume cannot be created: 70 GB of your quota is available",
    },
  ])(
    "answers $error for $size GB with a $floor GB floor and $available GB left",
    ({ size, floor, available, error }) => {
      expect(createSizeError(size, floor, available)).toBe(error);
    },
  );

  it("reports the source floor before the quota", () => {
    expect(createSizeError(10, 20, 5)).toBe(
      "The volume size cannot be less than the source size (20 GB)",
    );
  });
});

describe("inheritsPlacement", () => {
  it.each<[VolumeSource, boolean]>([
    ["none", false],
    ["image", false],
    ["snapshot", true],
    ["volume", true],
  ])("a %s source fixes the zone and type: %s", (source, inherits) => {
    expect(inheritsPlacement(source)).toBe(inherits);
  });
});

describe("sourceChoices", () => {
  it("labels images with their size and marks instance snapshots", () => {
    const images = [
      { ...options.images[0]!, size: 2 * 1024 ** 3 },
      {
        ...options.images[0]!,
        id: "inst-snap",
        name: null,
        size: null,
        is_snapshot: true,
      },
    ];
    expect(sourceChoices({ ...options, images }, "image")).toEqual([
      { id: "img", label: "img (2 GB)" },
      { id: "inst-snap", label: "inst-snap (instance snapshot)" },
    ]);
  });

  it("labels snapshots and volumes with their size in GB", () => {
    expect(sourceChoices(options, "snapshot")).toEqual([
      { id: "snap", label: "s (20 GB)" },
    ]);
    const volumes: Volume[] = [
      {
        id: "vol",
        name: "",
        description: null,
        size_gb: 8,
        status: "available",
        volume_type: null,
        availability_zone: null,
        bootable: false,
        encrypted: false,
        multiattach: false,
        attachments: [],
        snapshot_id: null,
        source_volume_id: null,
        image: null,
        group_id: null,
        metadata: {},
        created_at: null,
        updated_at: null,
        has_snapshots: null,
        fault: null,
      },
    ];
    expect(sourceChoices({ ...options, volumes }, "volume")).toEqual([
      { id: "vol", label: "vol (8 GB)" },
    ]);
  });

  it("offers nothing without a source or before the options load", () => {
    expect(sourceChoices(options, "none")).toEqual([]);
    expect(sourceChoices(undefined, "image")).toEqual([]);
  });
});

describe("createQuotaReason", () => {
  it.each<{ limits: VolumeLimits | undefined; reason: string | null }>([
    { limits: undefined, reason: null },
    {
      limits: { maxTotalVolumes: 10, totalVolumesUsed: 9 },
      reason: null,
    },
    {
      limits: { maxTotalVolumes: 10, totalVolumesUsed: 10 },
      reason: "You are using all of your available volumes",
    },
    {
      limits: { maxTotalVolumeGigabytes: 100, totalGigabytesUsed: 100 },
      reason: "You are using all of your volume storage quota",
    },
    {
      limits: { maxTotalVolumes: -1, maxTotalVolumeGigabytes: -1 },
      reason: null,
    },
  ])("answers $reason for $limits", ({ limits, reason }) => {
    expect(createQuotaReason(limits)).toBe(reason);
  });
});

describe("canAttachMore", () => {
  const attachment = {
    id: "a",
    server_id: "i-web-1",
    device: "/dev/vdb",
    attached_at: null,
  };

  it("lets a free volume or a multi-attach volume take an attachment", () => {
    expect(canAttachMore({ attachments: [], multiattach: false })).toBe(true);
    expect(
      canAttachMore({ attachments: [attachment], multiattach: true }),
    ).toBe(true);
  });

  it("keeps an attached single-attach volume where it is", () => {
    expect(
      canAttachMore({ attachments: [attachment], multiattach: false }),
    ).toBe(false);
  });
});

describe("attachCandidates", () => {
  it("offers active and shut off instances, not errored ones", () => {
    expect(
      attachCandidates(instances, { attachments: [] }).map((i) => i.id),
    ).toEqual(["i-web-1", "i-db-1"]);
  });

  it("leaves out an instance the volume is attached to", () => {
    const attachments = [
      { id: "a", server_id: "i-web-1", device: null, attached_at: null },
    ];
    expect(
      attachCandidates(instances, { attachments }).map((i) => i.id),
    ).toEqual(["i-db-1"]);
  });
});

describe("attachOptions", () => {
  const web = {
    id: "web",
    name: "web",
    status: "ACTIVE",
    availability_zone: "melbourne-qh2",
  };
  const db = { ...web, id: "db", name: "db", availability_zone: "monash-02" };

  it("lists instances in another zone as disabled, saying where they are", () => {
    expect(
      attachOptions([web, db], { availability_zone: "melbourne-qh2" }),
    ).toEqual([
      { id: "web", label: "web (active)" },
      { id: "db", label: "db (in monash-02, another zone)", isDisabled: true },
    ]);
  });

  it("holds no zone against an instance when either side has none", () => {
    expect(
      attachOptions([web, { ...db, availability_zone: null }], {
        availability_zone: "monash-02",
      }).map((option) => option.isDisabled ?? false),
    ).toEqual([true, false]);
    expect(
      attachOptions([web, db], { availability_zone: null }).some(
        (option) => option.isDisabled,
      ),
    ).toBe(false);
  });
});

describe("backupSnapshots", () => {
  it("offers the volume's available snapshots only", () => {
    const snapshots = [
      snapshot,
      { ...snapshot, id: "busy", status: "creating" },
      { ...snapshot, id: "other", volume_id: "w" },
    ];
    expect(backupSnapshots(snapshots, "v").map((s) => s.id)).toEqual(["snap"]);
  });
});

describe("retypeChoices", () => {
  const ids = (volume: Parameters<typeof retypeChoices>[1]) =>
    retypeChoices(options, volume).map((o) => o.id);

  it("offers the other types that serve the volume's zone", () => {
    expect(
      ids({ volume_type: "standard", availability_zone: "melbourne-qh2" }),
    ).toEqual(["qh2-ssd"]);
    expect(
      ids({ volume_type: "standard", availability_zone: "monash-02" }),
    ).toEqual([]);
    expect(
      ids({ volume_type: "qh2-ssd", availability_zone: "melbourne-qh2" }),
    ).toEqual(["standard"]);
  });

  it("offers every other type for a volume without a zone", () => {
    expect(ids({ volume_type: "standard", availability_zone: null })).toEqual([
      "qh2-ssd",
    ]);
  });
});

describe("typeLabel", () => {
  it("adds the description when there is one", () => {
    expect(typeLabel({ name: "qh2-ssd", description: "Local SSD" })).toBe(
      "qh2-ssd (Local SSD)",
    );
    expect(typeLabel({ name: "standard", description: null })).toBe("standard");
  });
});

describe("attachBlockReason", () => {
  it("waits for a volume that is busy", () => {
    expect(
      attachBlockReason({
        status: "detaching",
        attachments: [],
        multiattach: false,
      }),
    ).toBe("The volume is detaching. You can attach it once it is available.");
  });

  it("asks for a detach first unless the volume is multi-attach", () => {
    const held = {
      status: "in-use",
      attachments: [
        { id: "a", server_id: "i-1", device: null, attached_at: null },
      ],
    };
    expect(attachBlockReason({ ...held, multiattach: false })).toBe(
      "Detach the volume before attaching it to another instance.",
    );
    expect(attachBlockReason({ ...held, multiattach: true })).toBeNull();
    expect(
      attachBlockReason({
        status: "available",
        attachments: [],
        multiattach: false,
      }),
    ).toBeNull();
  });
});
