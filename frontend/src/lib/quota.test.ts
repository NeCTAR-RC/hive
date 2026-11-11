import { describe, expect, it } from "vitest";
import { hasRoom, quotaLeft, quotaPair } from "./quota";

describe("quotaPair", () => {
  const limits = {
    maxTotalCores: 8,
    totalCoresUsed: 6,
    maxTotalInstances: -1,
    totalInstancesUsed: 3,
    maxTotalRAMSize: null,
  };

  it("reads the used and limit figures", () => {
    expect(quotaPair(limits, "maxTotalCores", "totalCoresUsed")).toEqual({
      used: 6,
      max: 8,
    });
  });

  it("reads a negative, null or missing limit as unlimited", () => {
    expect(
      quotaPair(limits, "maxTotalInstances", "totalInstancesUsed"),
    ).toEqual({ used: 3, max: null });
    expect(quotaPair(limits, "maxTotalRAMSize", "totalRAMUsed").max).toBeNull();
    expect(quotaPair(limits, "maxServerGroups", "x").max).toBeNull();
  });

  it("counts a missing used figure, or missing limits, as none used", () => {
    expect(quotaPair(limits, "maxTotalCores", "totalUnknownUsed").used).toBe(0);
    expect(quotaPair(undefined, "a", "b")).toEqual({ used: 0, max: null });
  });
});

describe("hasRoom", () => {
  it("has room below the limit and always when unlimited", () => {
    expect(hasRoom({ used: 2, max: 3 })).toBe(true);
    expect(hasRoom({ used: 3, max: 3 })).toBe(false);
    expect(hasRoom({ used: 99, max: null })).toBe(true);
  });
});

describe("quotaLeft", () => {
  it("is the limit less what is used, never below none", () => {
    expect(quotaLeft({ used: 10, max: 100 })).toBe(90);
    expect(quotaLeft({ used: 12, max: 10 })).toBe(0);
  });

  it("is null for an unlimited quota", () => {
    expect(quotaLeft({ used: 10, max: null })).toBeNull();
  });
});
