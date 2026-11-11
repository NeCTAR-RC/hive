import { describe, expect, it } from "vitest";
import { shareGroupCreateBody } from "../../../mocks/shares/schemas";
import { createShareGroupBody, type CreateShareGroupValues } from "./request";

/** The create form as it opens, with a name typed. */
const blank: CreateShareGroupValues = {
  name: "sequencing",
  description: "",
  snapshot_id: "",
  share_group_type_id: "",
  share_types: [],
  availability_zone: "",
};

describe("createShareGroupBody", () => {
  it.each([
    {
      variant:
        "sends an empty group's type and no share types when none is ticked",
      values: { ...blank, share_group_type_id: "sgt-1" },
      body: { name: "sequencing", share_group_type_id: "sgt-1" },
    },
    {
      variant: "sends the share types ticked with the group type",
      values: {
        ...blank,
        share_group_type_id: "sgt-1",
        share_types: ["st-1", "st-2"],
      },
      body: {
        name: "sequencing",
        share_group_type_id: "sgt-1",
        share_types: ["st-1", "st-2"],
      },
    },
    {
      variant: "sends a snapshot source and no type, even when one was chosen",
      values: {
        ...blank,
        snapshot_id: "sgs-1",
        share_group_type_id: "sgt-1",
        share_types: ["st-1"],
      },
      body: { name: "sequencing", snapshot_id: "sgs-1" },
    },
    {
      variant: "sends the description and zone when filled in",
      values: {
        ...blank,
        description: "Run outputs",
        share_group_type_id: "sgt-1",
        availability_zone: "QRIScloud",
      },
      body: {
        name: "sequencing",
        description: "Run outputs",
        share_group_type_id: "sgt-1",
        availability_zone: "QRIScloud",
      },
    },
  ])("$variant", ({ values, body }) => {
    expect(createShareGroupBody(values)).toEqual(body);
    expect(shareGroupCreateBody.safeParse(body).success).toBe(true);
  });
});
