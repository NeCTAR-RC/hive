import { describe, expect, it } from "vitest";
import { fipChoiceTarget, preselectedFipChoice } from "./fipChoice";

const fip = (id: string) => ({ id });
const pool = (id: string) => ({ id });

describe("preselectedFipChoice", () => {
  it.each([
    [
      "the first free floating IP",
      [fip("a"), fip("b")],
      [pool("ext")],
      "fip:a",
    ],
    ["the sole pool without a free floating IP", [], [pool("ext")], "pool:ext"],
    ["nothing among several pools", [], [pool("ext"), pool("int")], ""],
    ["nothing when both lists are empty", [], [], ""],
  ])("chooses %s", (_, free, pools, expected) => {
    expect(preselectedFipChoice(free, pools)).toBe(expected);
  });
});

describe("fipChoiceTarget", () => {
  it("associates a chosen floating IP", () => {
    expect(fipChoiceTarget("fip:a")).toEqual({ floatingIpId: "a" });
  });

  it("allocates from a chosen pool", () => {
    expect(fipChoiceTarget("pool:ext")).toEqual({ poolId: "ext" });
  });
});
