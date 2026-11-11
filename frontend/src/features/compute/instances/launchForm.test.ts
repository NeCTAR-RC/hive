import { describe, expect, it } from "vitest";
import { launchOptions } from "../../../mocks/compute/handlers";
import { launchBody } from "../../../mocks/compute/schemas";
import {
  ANY_ZONE,
  DEFAULT_VOLUME_TYPE,
  effectiveZone,
  launchFormSchema,
  launchRequest,
  launchSchema,
  newVolumeSummary,
  NONE,
  offeredVolumeType,
  volumeSizeAtFloor,
  type LaunchForm,
} from "./launchForm";

const options = launchOptions();
/** The mock reservation res-1's flavour. */
const reservationFlavor = "r-f1";
const zone = options.availability_zones![0]!.name;
const flavor = options.flavors![0]!.id;
const classic = options.networks![0]!.id;
const keyPair = options.key_pairs![0]!.name;
const serverGroup = options.server_groups![0]!.id;

/** The wizard's values for a bare launch from an image, as a user leaves them. */
const bare: LaunchForm = {
  name: "web-2",
  description: "",
  availability_zone: zone,
  count: 1,
  source_type: "image",
  source_id: "img-ubuntu",
  create_volume: false,
  volume_type: DEFAULT_VOLUME_TYPE,
  delete_volume_on_termination: false,
  flavor_class: "",
  flavor_id: flavor,
  networks: [classic],
  ports: [],
  security_groups: [],
  key_name: "",
  user_data: "",
  server_group_id: "",
  config_drive: false,
  metadata: [],
};

/** The request a bare launch from an image sends. */
const bareRequest = {
  name: "web-2",
  count: 1,
  source: { type: "image", id: "img-ubuntu" },
  flavor_id: flavor,
  availability_zone: zone,
  networks: [classic],
  ports: [],
  security_groups: [],
  key_name: null,
  user_data: null,
  metadata: {},
  description: null,
  server_group_id: null,
  delete_volume_on_termination: false,
  config_drive: false,
};

describe("launchRequest", () => {
  it.each([
    {
      name: "an image",
      values: { source_type: "image", source_id: "img-ubuntu" },
      expected: { source: { type: "image", id: "img-ubuntu" } },
    },
    {
      name: "an instance snapshot",
      values: { source_type: "snapshot", source_id: "snap-1" },
      expected: { source: { type: "snapshot", id: "snap-1" } },
    },
    {
      name: "a volume deleted with the instance",
      values: {
        source_type: "volume",
        source_id: "vol-2",
        delete_volume_on_termination: true,
      },
      expected: {
        source: { type: "volume", id: "vol-2" },
        delete_volume_on_termination: true,
      },
    },
    {
      name: "a volume snapshot kept after the instance",
      values: { source_type: "volume_snapshot", source_id: "vs-1" },
      expected: { source: { type: "volume_snapshot", id: "vs-1" } },
    },
  ] as const)("boots from $name", ({ values, expected }) => {
    const request = launchRequest({ ...bare, ...values }, options);
    expect(request).toEqual({ ...bareRequest, ...expected });
    expect(launchBody.safeParse(request).success).toBe(true);
  });

  it("sends every optional part the user filled in", () => {
    const request = launchRequest(
      {
        ...bare,
        description: "Public web server",
        count: 3,
        networks: [classic, "net-private"],
        ports: ["port-spare"],
        security_groups: ["default", "web"],
        key_name: keyPair,
        user_data: "#cloud-config\npackages: [nginx]\n",
        server_group_id: serverGroup,
        metadata: [
          { key: "role", value: "web" },
          { key: "owner", value: "" },
        ],
      },
      options,
    );
    expect(request).toEqual({
      name: "web-2",
      count: 3,
      source: { type: "image", id: "img-ubuntu" },
      flavor_id: flavor,
      availability_zone: zone,
      networks: [classic, "net-private"],
      ports: ["port-spare"],
      security_groups: ["default", "web"],
      key_name: keyPair,
      user_data: "#cloud-config\npackages: [nginx]\n",
      metadata: { role: "web", owner: "" },
      description: "Public web server",
      server_group_id: serverGroup,
      delete_volume_on_termination: false,
      config_drive: false,
    });
    expect(launchBody.safeParse(request).success).toBe(true);
  });

  it("leaves the zone to Nova for any zone", () => {
    expect(
      launchRequest({ ...bare, availability_zone: ANY_ZONE }, options),
    ).toEqual({
      ...bareRequest,
      availability_zone: null,
    });
  });

  it("boots an image from a new volume of the chosen size", () => {
    const request = launchRequest(
      {
        ...bare,
        create_volume: true,
        volume_size_gb: 40,
        delete_volume_on_termination: true,
        config_drive: true,
      },
      options,
    );
    expect(request).toEqual({
      ...bareRequest,
      create_volume: true,
      volume_size_gb: 40,
      volume_type: null,
      delete_volume_on_termination: true,
      config_drive: true,
    });
    expect(launchBody.safeParse(request).success).toBe(true);
  });

  it("sends the new volume's type unless it is the default", () => {
    const request = launchRequest(
      {
        ...bare,
        create_volume: true,
        volume_size_gb: 40,
        volume_type: "qh2-ssd",
      },
      options,
    );
    expect(request).toMatchObject({
      create_volume: true,
      volume_type: "qh2-ssd",
    });
    expect(launchBody.safeParse(request).success).toBe(true);
  });

  it("sends no zone for a reservation flavour", () => {
    expect(
      launchRequest({ ...bare, flavor_id: reservationFlavor }, options),
    ).toEqual({
      ...bareRequest,
      flavor_id: reservationFlavor,
      availability_zone: null,
    });
  });

  it("sends no new volume for a volume source, nor a stray delete choice", () => {
    expect(
      launchRequest(
        {
          ...bare,
          create_volume: true,
          volume_size_gb: 40,
          delete_volume_on_termination: true,
          source_type: "volume",
          source_id: "vol-boot",
        },
        options,
      ),
    ).toEqual({
      ...bareRequest,
      source: { type: "volume", id: "vol-boot" },
      delete_volume_on_termination: true,
    });
    expect(
      launchRequest({ ...bare, delete_volume_on_termination: true }, options),
    ).toEqual(bareRequest);
  });

  it("sends no key pair or server group when the user chose none", () => {
    const request = launchRequest(
      {
        ...bare,
        key_name: NONE,
        server_group_id: NONE,
      },
      options,
    );
    expect(request).toEqual(bareRequest);
  });

  it("boots from ports alone when no network is chosen", () => {
    const request = launchRequest(
      {
        ...bare,
        networks: [],
        ports: ["port-spare"],
      },
      options,
    );
    expect(request).toEqual({
      ...bareRequest,
      networks: [],
      ports: ["port-spare"],
    });
    expect(launchBody.safeParse(request).success).toBe(true);
  });
});

/** The first error message a schema raises for a path, if any. */
function issueAt(
  schema: typeof launchFormSchema,
  values: LaunchForm,
  path: string,
): string | undefined {
  const result = schema.safeParse(values);
  return result.error?.issues.find((issue) => issue.path.join(".") === path)
    ?.message;
}

describe("launchFormSchema", () => {
  it("accepts a bare launch", () => {
    expect(launchFormSchema.safeParse(bare).success).toBe(true);
  });

  it("asks for a network or a port", () => {
    expect(
      issueAt(launchFormSchema, { ...bare, networks: [] }, "networks"),
    ).toBe("Choose at least one network or port");
  });

  it("keeps an existing port to a single instance", () => {
    const values = { ...bare, count: 2, ports: ["port-spare"] };
    expect(issueAt(launchFormSchema, values, "ports")).toMatch(
      /one instance only/,
    );
    expect(
      issueAt(launchFormSchema, { ...values, count: 1 }, "ports"),
    ).toBeUndefined();
  });

  it("rejects user data over Nova's limit", () => {
    const values = { ...bare, user_data: "a".repeat(49_150) };
    expect(issueAt(launchFormSchema, values, "user_data")).toBe(
      "Scripts are limited to 48 KB",
    );
  });
});

describe("launchSchema", () => {
  it.each([
    {
      name: "an offered image",
      values: { source_type: "image", source_id: "img-ubuntu" },
      message: undefined,
    },
    {
      name: "an image chosen as a volume",
      values: { source_type: "volume", source_id: "img-ubuntu" },
      message: "Choose one of the listed sources",
    },
    {
      name: "a volume in another zone",
      values: {
        source_type: "volume",
        source_id: "vol-2",
        availability_zone: "monash-01",
      },
      message: "Choose one of the listed sources",
    },
  ] as const)("checks $name against the options", ({ values, message }) => {
    expect(
      issueAt(launchSchema(options), { ...bare, ...values }, "source_id"),
    ).toBe(message);
  });

  it("keeps a new boot volume at least as large as the image and the flavour's root disk", () => {
    // The mocked Ubuntu image has a 10 GB minimum disk; m3.small has a
    // 30 GB root disk, t3.xsmall a 10 GB one.
    const at = (flavorId: string, size: number | undefined) =>
      issueAt(
        launchSchema(options),
        {
          ...bare,
          create_volume: true,
          flavor_id: flavorId,
          volume_size_gb: size,
        },
        "volume_size_gb",
      );
    expect(at("f-tiny", undefined)).toBe("Enter the volume size");
    expect(at("f-tiny", 9)).toBe("At least 10 GB");
    expect(at("f-tiny", 10)).toBeUndefined();
    expect(at("f-small", 29)).toBe("At least 30 GB");
    expect(at("f-small", 30)).toBeUndefined();
  });

  it("needs a zone for a new boot volume", () => {
    const values = {
      ...bare,
      availability_zone: ANY_ZONE,
      create_volume: true,
      volume_size_gb: 30,
    };
    expect(issueAt(launchSchema(options), values, "create_volume")).toBe(
      "Choose an availability zone on the Details step to boot from a new volume",
    );
    expect(
      issueAt(launchSchema(options), values, "availability_zone"),
    ).toBeUndefined();
  });

  it("refuses a new boot volume with a reservation flavour, which sends no zone", () => {
    const values = {
      ...bare,
      flavor_id: reservationFlavor,
      create_volume: true,
      volume_size_gb: 30,
    };
    expect(issueAt(launchSchema(options), values, "create_volume")).toMatch(
      /^A reservation flavour sets the availability zone/,
    );
  });

  it("names the zone problem alone when a zoned volume type is chosen too", () => {
    const values = {
      ...bare,
      flavor_id: reservationFlavor,
      create_volume: true,
      volume_size_gb: 30,
      volume_type: "qh2-ssd",
    };
    const paths = launchSchema(options)
      .safeParse(values)
      .error?.issues.map((issue) => issue.path.join("."));
    expect(paths).toEqual(["create_volume"]);
  });

  it("takes only a volume type the zone offers", () => {
    const values = { ...bare, create_volume: true, volume_size_gb: 30 };
    const at = (zoneName: string, volumeType: string) =>
      issueAt(
        launchSchema(options),
        { ...values, availability_zone: zoneName, volume_type: volumeType },
        "volume_type",
      );
    expect(at("melbourne-qh2", "qh2-ssd")).toBeUndefined();
    expect(at("melbourne-qh2", DEFAULT_VOLUME_TYPE)).toBeUndefined();
    expect(at("monash-01", "qh2-ssd")).toBe(
      "Choose one of the listed volume types",
    );
  });

  it("stops a count over the instance quota at the count", () => {
    // The mocked project uses 3 of 10 instances.
    expect(
      issueAt(launchSchema(options), { ...bare, count: 8 }, "count"),
    ).toMatch(/can launch 7 more instances \(3 of 10 in use\)/);
    expect(
      issueAt(launchSchema(options), { ...bare, count: 7 }, "count"),
    ).toBeUndefined();
  });

  it("stops a flavour over the vCPU quota at the flavour", () => {
    // 7 x m3.medium is 28 vCPUs; the project uses 8 of 32.
    const values = { ...bare, flavor_id: "f-medium", count: 7 };
    expect(issueAt(launchSchema(options), values, "flavor_id")).toMatch(
      /7 instances of this flavour need 28 vCPUs; your project has 24 left/,
    );
  });

  it("lists a reservation flavour's sources in every zone", () => {
    const values = {
      ...bare,
      source_type: "volume",
      source_id: "vol-2",
      availability_zone: "monash-01",
      flavor_id: reservationFlavor,
    } as const;
    expect(issueAt(launchSchema(options), values, "source_id")).toBeUndefined();
  });

  it("checks no source before the options load", () => {
    const values: LaunchForm = {
      ...bare,
      source_type: "volume",
      source_id: "img-ubuntu",
    };
    expect(
      issueAt(launchSchema(undefined), values, "source_id"),
    ).toBeUndefined();
  });
});

describe("effectiveZone", () => {
  it("is the chosen zone, none for any zone or a reservation flavour", () => {
    expect(effectiveZone(options, bare)).toBe(zone);
    expect(
      effectiveZone(options, { ...bare, availability_zone: ANY_ZONE }),
    ).toBe("");
    expect(
      effectiveZone(options, { ...bare, flavor_id: reservationFlavor }),
    ).toBe("");
    expect(effectiveZone(undefined, bare)).toBe(zone);
  });
});

describe("offeredVolumeType", () => {
  it("keeps a type the zone offers and drops one it does not", () => {
    expect(offeredVolumeType(options, "melbourne-qh2", "qh2-ssd")).toBe(
      "qh2-ssd",
    );
    expect(offeredVolumeType(options, "monash-01", "qh2-ssd")).toBe(
      DEFAULT_VOLUME_TYPE,
    );
    expect(offeredVolumeType(options, "monash-01", "standard")).toBe(
      "standard",
    );
    expect(offeredVolumeType(options, "", DEFAULT_VOLUME_TYPE)).toBe(
      DEFAULT_VOLUME_TYPE,
    );
  });
});

describe("volumeSizeAtFloor", () => {
  it("raises a missing or smaller size to the floor and keeps a larger one", () => {
    expect(volumeSizeAtFloor(undefined, 10)).toBe(10);
    expect(volumeSizeAtFloor(5, 10)).toBe(10);
    expect(volumeSizeAtFloor(10, 10)).toBeUndefined();
    expect(volumeSizeAtFloor(40, 10)).toBeUndefined();
  });
});

describe("newVolumeSummary", () => {
  const volume = {
    create_volume: true,
    source_type: "image",
    volume_size_gb: 40,
    volume_type: DEFAULT_VOLUME_TYPE,
    delete_volume_on_termination: false,
  } as const;

  it("names the size, a chosen type and the delete choice", () => {
    expect(newVolumeSummary(volume)).toBe("New 40 GB volume");
    expect(
      newVolumeSummary({
        ...volume,
        volume_type: "qh2-ssd",
        delete_volume_on_termination: true,
      }),
    ).toBe("New 40 GB volume (qh2-ssd), deleted with the instance");
  });

  it("says nothing without a new volume from an image or snapshot", () => {
    expect(newVolumeSummary({ ...volume, create_volume: false })).toBe("");
    expect(newVolumeSummary({ ...volume, source_type: "volume" })).toBe("");
    expect(newVolumeSummary({})).toBe("");
  });
});
