import { describe, expect, it } from "vitest";
import { recordSetUpdateBody, splitRecords } from "./status";

describe("splitRecords", () => {
  it("takes one record per non-blank line", () => {
    expect(splitRecords(" 203.0.113.1 \n\n203.0.113.2\n")).toEqual([
      "203.0.113.1",
      "203.0.113.2",
    ]);
  });
});

describe("recordSetUpdateBody", () => {
  it("sends a blank TTL as null so the zone default applies", () => {
    const body = recordSetUpdateBody({
      records: "203.0.113.1",
      ttl: undefined,
      description: "",
    });
    expect(body).toEqual({
      records: ["203.0.113.1"],
      ttl: null,
      description: "",
    });
    expect(JSON.stringify(body)).toContain('"ttl":null');
  });

  it("sends a TTL the user entered", () => {
    expect(
      recordSetUpdateBody({ records: "a", ttl: 300, description: "x" }).ttl,
    ).toBe(300);
    expect(
      recordSetUpdateBody({ records: "a", ttl: 0, description: "x" }).ttl,
    ).toBe(0);
  });
});
