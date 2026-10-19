import { describe, expect, it } from "vitest";
import { defaultNetworkIds, flavorQuotaProblem } from "./launch";

const classic = { id: "classic", is_classic: true };
const alpha = { id: "a", is_classic: false };
const bravo = { id: "b", is_classic: false };

describe("defaultNetworkIds", () => {
  it("preselects the classic network wherever it sits", () => {
    expect(defaultNetworkIds([alpha, classic, bravo])).toEqual(["classic"]);
  });

  it("preselects a network only when it is the sole choice", () => {
    expect(defaultNetworkIds([alpha])).toEqual(["a"]);
    expect(defaultNetworkIds([alpha, bravo])).toEqual([]);
  });

  it("selects nothing when no network is offered", () => {
    expect(defaultNetworkIds([])).toEqual([]);
    expect(defaultNetworkIds(null)).toEqual([]);
    expect(defaultNetworkIds(undefined)).toEqual([]);
  });
});

describe("flavorQuotaProblem", () => {
  const flavor = { vcpus: 4, ram_mb: 16384 };
  const limits = {
    maxTotalCores: 10,
    totalCoresUsed: 2,
    maxTotalRAMSize: 65536,
    totalRAMUsed: 0,
  };

  it("accepts a flavour that fits the remaining quota", () => {
    expect(flavorQuotaProblem(flavor, limits, 2)).toBeNull();
  });

  it("multiplies by the instance count", () => {
    expect(flavorQuotaProblem(flavor, limits, 3)).toMatch(/vCPUs/);
    expect(
      flavorQuotaProblem(flavor, { ...limits, maxTotalCores: 100 }, 5),
    ).toMatch(/RAM/);
  });

  it("treats a cleared count as one and unlimited quota as no limit", () => {
    expect(flavorQuotaProblem(flavor, limits, Number.NaN)).toBeNull();
    expect(
      flavorQuotaProblem(
        flavor,
        { maxTotalCores: -1, maxTotalRAMSize: -1 },
        50,
      ),
    ).toBeNull();
    expect(flavorQuotaProblem(flavor, null, 50)).toBeNull();
  });
});
