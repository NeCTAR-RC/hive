import { describe, expect, it } from "vitest";
import { profile } from "../../mocks/core/fixtures";
import { profileUpdateBody } from "../../mocks/nectar/schemas";
import { detailsRequest, detailsSchema, detailsValues } from "./details";

describe("detailsValues", () => {
  it("fills the form from the profile, a missing number as empty", () => {
    expect(detailsValues(profile)).toEqual({
      affiliation: "staff",
      phone_number: "",
      mobile_number: "0400 000 000",
    });
  });

  it("starts empty for a profile whose fields are null", () => {
    const empty = {
      ...profile,
      affiliation: null,
      phone_number: null,
      mobile_number: null,
    };
    expect(detailsValues(empty)).toEqual({
      affiliation: "",
      phone_number: "",
      mobile_number: "",
    });
  });
});

describe("detailsRequest", () => {
  it.each([
    [
      "both numbers",
      {
        affiliation: "staff",
        phone_number: "03 9000 0000",
        mobile_number: "0400 000 000",
      },
      {
        affiliation: "staff",
        phone_number: "03 9000 0000",
        mobile_number: "0400 000 000",
      },
    ],
    [
      "cleared numbers as null",
      { affiliation: "student", phone_number: "", mobile_number: "" },
      { affiliation: "student", phone_number: null, mobile_number: null },
    ],
  ])("sends %s", (_, values, expected) => {
    const body = detailsRequest(values);
    expect(body).toEqual(expected);
    expect(profileUpdateBody.parse(body)).toEqual(body);
  });

  it("sends the trimmed numbers the schema hands it", () => {
    const values = detailsSchema.parse({
      affiliation: "staff",
      phone_number: "  ",
      mobile_number: " 0400 000 000 ",
    });
    expect(detailsRequest(values)).toEqual({
      affiliation: "staff",
      phone_number: null,
      mobile_number: "0400 000 000",
    });
  });
});

describe("detailsSchema", () => {
  it.each([
    ["no affiliation", { affiliation: "" }, "Choose your affiliation"],
    [
      "a number over 64 characters",
      { phone_number: "1".repeat(65) },
      "Use 64 characters or fewer",
    ],
  ])("refuses %s", (_, overrides, message) => {
    const result = detailsSchema.safeParse({
      affiliation: "staff",
      phone_number: "",
      mobile_number: "",
      ...overrides,
    });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      message,
    ]);
  });
});
