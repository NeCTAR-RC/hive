import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { VolumeOptions } from "../../../../lib/api/types/volumes";
import {
  acceptTransferSchema,
  attachVolumeSchema,
  createBackupSchema,
  createTransferSchema,
  createVolumeSchema,
  extendVolumeSchema,
  retypeVolumeSchema,
  type CreateVolumeValues,
} from "./schema";

/** The first message on each field a parse rejects, keyed by field. */
function issues(result: z.ZodSafeParseResult<unknown>) {
  const byField: Record<string, string> = {};
  for (const issue of result.error?.issues ?? []) {
    byField[issue.path.join(".")] ??= issue.message;
  }
  return byField;
}

const blank: CreateVolumeValues = {
  name: "",
  description: "",
  source: "none",
  source_id: "",
  size: 1,
  availability_zone: "melbourne-qh2",
  volume_type: "",
};

/** One 20 GB snapshot to start from, and 30 GB of quota left. */
const options: VolumeOptions = {
  availability_zones: [],
  volume_types: [],
  has_zoned_types: false,
  images: [],
  snapshots: [
    {
      id: "snap-1",
      name: "s",
      description: null,
      size_gb: 20,
      status: "available",
      volume_id: "vol-1",
      volume_name: "data",
      progress: null,
      group_snapshot_id: null,
      metadata: {},
      created_at: null,
      updated_at: null,
    },
  ],
  volumes: [],
  limits: { maxTotalVolumeGigabytes: 100, totalGigabytesUsed: 70 },
  errors: {},
};

describe("createVolumeSchema", () => {
  it.each<{ variant: string; values: CreateVolumeValues; errors: object }>([
    { variant: "an empty volume in a zone", values: blank, errors: {} },
    {
      variant: "an empty volume without a zone",
      values: { ...blank, availability_zone: "" },
      errors: { availability_zone: "An availability zone is required" },
    },
    {
      variant: "an image source without a zone",
      values: {
        ...blank,
        source: "image",
        source_id: "img-1",
        availability_zone: "",
      },
      errors: { availability_zone: "An availability zone is required" },
    },
    {
      variant: "a snapshot source without a zone",
      values: {
        ...blank,
        source: "snapshot",
        source_id: "snap-1",
        size: 20,
        availability_zone: "",
      },
      errors: {},
    },
    {
      variant: "a source kind with no source chosen",
      values: { ...blank, source: "volume" },
      errors: { source_id: "Choose a source" },
    },
    {
      variant: "a size below the source's",
      values: { ...blank, source: "snapshot", source_id: "snap-1", size: 10 },
      errors: {
        size: "The volume size cannot be less than the source size (20 GB)",
      },
    },
    {
      variant: "a size beyond the quota left",
      values: { ...blank, size: 31 },
      errors: {
        size: "A 31 GB volume cannot be created: 30 GB of your quota is available",
      },
    },
  ])("checks $variant", ({ values, errors }) => {
    expect(issues(createVolumeSchema(options).safeParse(values))).toEqual(
      errors,
    );
  });
});

describe("extendVolumeSchema", () => {
  it.each([
    { newSize: 11, available: 5, errors: {} },
    { newSize: 15, available: 5, errors: {} },
    { newSize: 500, available: null, errors: {} },
    {
      newSize: 10,
      available: 5,
      errors: { new_size: "New size must be greater than 10 GB" },
    },
    {
      newSize: 16,
      available: 5,
      errors: {
        new_size:
          "The volume can be extended to at most 15 GB with your remaining quota",
      },
    },
  ])(
    "checks $newSize GB for a 10 GB volume with $available GB left",
    ({ newSize, available, errors }) => {
      expect(
        issues(
          extendVolumeSchema(10, available).safeParse({ new_size: newSize }),
        ),
      ).toEqual(errors);
    },
  );
});

describe("attachVolumeSchema", () => {
  it.each([
    { device: "", errors: {} },
    { device: "/dev/vdc", errors: {} },
    { device: "vdc", errors: { device: "Device names start with /dev/" } },
  ])("checks the device name '$device'", ({ device, errors }) => {
    expect(
      issues(attachVolumeSchema.safeParse({ instance_id: "i-1", device })),
    ).toEqual(errors);
  });
});

describe("createBackupSchema", () => {
  it("rejects a container name with a slash", () => {
    const values = {
      name: "weekly",
      description: "",
      container: "a/b",
      snapshot_id: "",
      incremental: false,
    };
    expect(issues(createBackupSchema.safeParse(values))).toEqual({
      container: "A container name cannot contain a slash",
    });
  });
});

describe("transfer and retype schemas", () => {
  it("needs a transfer name that is more than spaces", () => {
    expect(issues(createTransferSchema.safeParse({ name: "   " }))).toEqual({
      name: "Enter a transfer name",
    });
    expect(createTransferSchema.parse({ name: " to-lab " })).toEqual({
      name: "to-lab",
    });
  });

  it("trims a pasted transfer id and key and holds Cinder's lengths", () => {
    expect(
      acceptTransferSchema.parse({ transfer_id: " tr-1\n", auth_key: " k1 " }),
    ).toEqual({ transfer_id: "tr-1", auth_key: "k1" });
    expect(
      issues(
        acceptTransferSchema.safeParse({
          transfer_id: "x".repeat(37),
          auth_key: "",
        }),
      ),
    ).toEqual({
      transfer_id: "A transfer ID has at most 36 characters",
      auth_key: "Enter the authorisation key",
    });
  });

  it("needs a new volume type", () => {
    expect(
      issues(
        retypeVolumeSchema.safeParse({
          volume_type: "",
          migration_policy: "never",
        }),
      ),
    ).toEqual({ volume_type: "Choose a volume type" });
  });
});
