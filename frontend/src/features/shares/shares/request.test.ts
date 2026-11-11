import { describe, expect, it } from "vitest";
import { shareCreateBody } from "../../../mocks/shares/schemas";
import {
  createShareBody,
  formatMetadata,
  shareSizeError,
  storageLeft,
  type CreateShareValues,
} from "./request";

/** The create form as it opens, with a name typed and the pickers chosen. */
const blank: CreateShareValues = {
  name: "genomics",
  description: "",
  protocol: "CEPHFS",
  size: 10,
  share_type: "cephfsnative1",
  availability_zone: "",
  share_group_id: "",
  snapshot_id: "",
  metadata: "",
  is_public: false,
};

describe("createShareBody", () => {
  it.each([
    {
      variant: "leaves out every optional field left empty",
      values: blank,
      body: {
        name: "genomics",
        protocol: "CEPHFS",
        size: 10,
        share_type: "cephfsnative1",
        is_public: false,
      },
    },
    {
      variant: "sends every optional field that was filled in",
      values: {
        ...blank,
        description: "Sequencing runs",
        availability_zone: "QRIScloud",
        share_group_id: "sg-1",
        snapshot_id: "snap-1",
        metadata: "team=genomics\ntier=gold",
        is_public: true,
      },
      body: {
        name: "genomics",
        protocol: "CEPHFS",
        size: 10,
        share_type: "cephfsnative1",
        is_public: true,
        description: "Sequencing runs",
        availability_zone: "QRIScloud",
        share_group_id: "sg-1",
        snapshot_id: "snap-1",
        metadata: "team=genomics\ntier=gold",
      },
    },
    {
      variant: "leaves out metadata that is only blank space",
      values: { ...blank, metadata: " \n " },
      body: {
        name: "genomics",
        protocol: "CEPHFS",
        size: 10,
        share_type: "cephfsnative1",
        is_public: false,
      },
    },
  ])("$variant", ({ values, body }) => {
    expect(createShareBody(values)).toEqual(body);
    expect(shareCreateBody.safeParse(body).success).toBe(true);
  });
});

describe("formatMetadata", () => {
  it("writes metadata one key=value per line", () => {
    expect(formatMetadata({ team: "genomics", tier: "gold" })).toBe(
      "team=genomics\ntier=gold",
    );
  });

  it("writes no metadata as an empty field", () => {
    expect(formatMetadata({})).toBe("");
  });
});

describe("storageLeft", () => {
  it("is the share storage limit less what is used", () => {
    expect(
      storageLeft({ maxTotalShareGigabytes: 100, totalShareGigabytesUsed: 10 }),
    ).toBe(90);
  });

  it("is never below none", () => {
    expect(
      storageLeft({ maxTotalShareGigabytes: 10, totalShareGigabytesUsed: 12 }),
    ).toBe(0);
  });

  it("is null for an unlimited quota", () => {
    expect(storageLeft({ maxTotalShareGigabytes: -1 })).toBeNull();
    expect(storageLeft(undefined)).toBeNull();
  });
});

describe("shareSizeError", () => {
  it("refuses a size above what is left", () => {
    expect(shareSizeError(200, 90)).toBe(
      "A 200 GiB share cannot be created: 90 GiB of your quota is left",
    );
  });

  it("allows a size that fits, or any size without a limit", () => {
    expect(shareSizeError(90, 90)).toBeNull();
    expect(shareSizeError(5000, null)).toBeNull();
  });
});
