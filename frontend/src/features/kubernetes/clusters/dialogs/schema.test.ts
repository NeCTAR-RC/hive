import { describe, expect, it } from "vitest";
import { labelsField, taintsField } from "./schema";

describe("labelsField", () => {
  it.each([
    ["", true],
    ["  ", true],
    [" tier=gpu,pool=a ", true],
    ["tier", false],
  ])("reads %j as valid: %s", (text, valid) => {
    expect(labelsField.safeParse(text).success).toBe(valid);
  });

  it("trims the value it keeps", () => {
    expect(labelsField.parse(" tier=gpu ")).toBe("tier=gpu");
  });
});

describe("taintsField", () => {
  it.each([
    ["", true],
    ["gpu=true:NoSchedule", true],
    ["gpu=true", false],
  ])("reads %j as valid: %s", (text, valid) => {
    expect(taintsField.safeParse(text).success).toBe(valid);
  });
});
