import { describe, expect, it } from "vitest";
import { clusterNeeds, clusterQuotaProblem, quotaLeftText } from "./quota";

const FLAVORS = [
  { name: "m3.small", vcpus: 2, ram_mb: 4096, disk_gb: 30 },
  { name: "m3.medium", vcpus: 4, ram_mb: 8192, disk_gb: 30 },
];

const SIZE = {
  master_count: "3",
  master_flavor_id: "m3.small",
  node_count: 2,
  flavor_id: "m3.medium",
};

const LIMITS = {
  maxTotalInstances: 10,
  totalInstancesUsed: 3,
  maxTotalCores: 32,
  totalCoresUsed: 8,
  maxTotalRAMSize: 65536,
  totalRAMUsed: 16384,
};

describe("clusterNeeds", () => {
  it("adds the control plane and the workers, each by its flavour", () => {
    expect(clusterNeeds(SIZE, FLAVORS)).toEqual({
      instances: 5,
      vcpus: 3 * 2 + 2 * 4,
      ramMb: 3 * 4096 + 2 * 8192,
    });
  });

  it("is unknown until both flavours are chosen", () => {
    expect(clusterNeeds({ ...SIZE, flavor_id: "" }, FLAVORS)).toBeNull();
  });
});

describe("clusterQuotaProblem", () => {
  const problem = (changes: Partial<typeof SIZE>, limits = LIMITS) =>
    clusterQuotaProblem(clusterNeeds({ ...SIZE, ...changes }, FLAVORS), limits);

  it("passes a cluster the quota holds", () => {
    expect(problem({})).toBeNull();
  });

  it("names the first resource that runs out", () => {
    expect(problem({ node_count: 500 })).toBe(
      "The cluster needs 503 instances; the project has 7 left",
    );
    expect(problem({ master_flavor_id: "m3.medium", node_count: 4 })).toBe(
      "The cluster needs 28 vCPUs; the project has 24 left",
    );
    expect(
      problem({ node_count: 4 }, { ...LIMITS, maxTotalCores: -1 }),
    ).toBeNull();
    expect(
      problem(
        { node_count: 4 },
        { ...LIMITS, maxTotalCores: -1, maxTotalRAMSize: 57344 },
      ),
    ).toBe("The cluster needs 44 GB of RAM; the project has 40 GB left");
  });

  it("says nothing while the limits or flavours are unknown", () => {
    expect(clusterQuotaProblem(null, LIMITS)).toBeNull();
    expect(
      clusterQuotaProblem({ instances: 99, vcpus: 0, ramMb: 0 }, undefined),
    ).toBeNull();
  });
});

describe("quotaLeftText", () => {
  it("lists what is left of each limited resource", () => {
    expect(quotaLeftText(LIMITS)).toBe(
      "The project has 7 instances, 24 vCPUs and 48 GB of RAM left.",
    );
    expect(
      quotaLeftText({ ...LIMITS, maxTotalCores: -1, maxTotalRAMSize: -1 }),
    ).toBe("The project has 7 instances left.");
    expect(quotaLeftText({})).toBeUndefined();
    expect(quotaLeftText(undefined)).toBeUndefined();
  });
});
