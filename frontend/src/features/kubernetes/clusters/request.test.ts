import { describe, expect, it } from "vitest";
import { clusterCreateBody } from "../../../mocks/kubernetes/schemas";
import {
  clusterCreateRequest,
  clusterSchema,
  type ClusterFormValues,
} from "./request";

const values: ClusterFormValues = {
  name: "analysis",
  kubernetes_version: "1.33.4",
  availability_zone: "ardctest-artm",
  network_driver: "calico",
  master_count: "3",
  master_flavor_id: "m3.medium",
  node_count: 2,
  flavor_id: "m3.small",
  keypair: "",
  autoscaling: false,
  etcd_volume: false,
  etcd_volume_type: "",
};

const FLAVORS = [
  { name: "m3.small", vcpus: 2, ram_mb: 4096, disk_gb: 30 },
  { name: "m3.medium", vcpus: 4, ram_mb: 8192, disk_gb: 30 },
];
const schema = clusterSchema({ flavors: FLAVORS, limits: undefined });

describe("clusterCreateRequest", () => {
  it.each([
    [
      "without an etcd volume",
      values,
      {
        name: "analysis",
        cluster_template_id: "t-133",
        master_count: 3,
        master_flavor_id: "m3.medium",
        node_count: 2,
        flavor_id: "m3.small",
      },
    ],
    [
      "with an etcd volume of the default type",
      { ...values, etcd_volume: true, etcd_volume_size: 20 },
      {
        name: "analysis",
        cluster_template_id: "t-133",
        master_count: 3,
        master_flavor_id: "m3.medium",
        node_count: 2,
        flavor_id: "m3.small",
        etcd_volume_size: 20,
      },
    ],
    [
      "with an etcd volume of a named type",
      {
        ...values,
        etcd_volume: true,
        etcd_volume_size: 20,
        etcd_volume_type: "standard",
      },
      {
        name: "analysis",
        cluster_template_id: "t-133",
        master_count: 3,
        master_flavor_id: "m3.medium",
        node_count: 2,
        flavor_id: "m3.small",
        etcd_volume_size: 20,
        etcd_volume_type: "standard",
      },
    ],
    [
      "with a key pair and autoscaling",
      {
        ...values,
        keypair: "laptop",
        autoscaling: true,
        min_node_count: 1,
        max_node_count: 5,
      },
      {
        name: "analysis",
        cluster_template_id: "t-133",
        master_count: 3,
        master_flavor_id: "m3.medium",
        node_count: 2,
        flavor_id: "m3.small",
        keypair: "laptop",
        autoscaling: true,
        min_node_count: 1,
        max_node_count: 5,
      },
    ],
    [
      "without the bounds once autoscaling is switched off",
      { ...values, autoscaling: false, min_node_count: 1, max_node_count: 5 },
      {
        name: "analysis",
        cluster_template_id: "t-133",
        master_count: 3,
        master_flavor_id: "m3.medium",
        node_count: 2,
        flavor_id: "m3.small",
      },
    ],
    [
      "without the etcd volume once it is switched off",
      {
        ...values,
        etcd_volume: false,
        etcd_volume_size: 20,
        etcd_volume_type: "standard",
      },
      {
        name: "analysis",
        cluster_template_id: "t-133",
        master_count: 3,
        master_flavor_id: "m3.medium",
        node_count: 2,
        flavor_id: "m3.small",
      },
    ],
  ])("builds the body %s", (_case, input, expected) => {
    const body = clusterCreateRequest(input, "t-133");
    expect(body).toEqual(expected);
    expect(clusterCreateBody.safeParse(body).success).toBe(true);
  });
});

describe("clusterSchema", () => {
  it("asks for the etcd volume size once the volume is switched on", () => {
    const result = schema.safeParse({ ...values, etcd_volume: true });
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ["etcd_volume_size"],
    ]);
  });

  it.each([
    ["analysis-01.k8s_b", true],
    ["1cluster", false],
    ["my cluster", false],
  ])("reads the name %j as valid: %s", (name, valid) => {
    expect(schema.safeParse({ ...values, name }).success).toBe(valid);
  });

  /** The messages the schema gives for `changes`, by field. */
  const messages = (changes: Partial<ClusterFormValues>, target = schema) =>
    target
      .safeParse({ ...values, ...changes })
      .error?.issues.map((i) => `${i.path.join(".")}: ${i.message}`) ?? [];

  it("asks for autoscaling bounds that hold the worker count", () => {
    expect(messages({ autoscaling: true })).toEqual([
      "min_node_count: Enter the fewest workers",
      "max_node_count: Enter the most workers",
    ]);
    expect(
      messages({ autoscaling: true, min_node_count: 3, max_node_count: 2 }),
    ).toEqual(["max_node_count: At least the fewest workers"]);
    expect(
      messages({ autoscaling: true, min_node_count: 3, max_node_count: 5 }),
    ).toEqual(["node_count: Between 3 and 5 while autoscaling"]);
    expect(
      messages({ autoscaling: true, min_node_count: 1, max_node_count: 5 }),
    ).toEqual([]);
  });

  it("holds the cluster to the compute quota, under the worker count", () => {
    const limited = clusterSchema({
      flavors: FLAVORS,
      limits: { maxTotalInstances: 10, totalInstancesUsed: 3 },
    });
    expect(messages({ node_count: 500 }, limited)).toEqual([
      "node_count: The cluster needs 503 instances; the project has 7 left",
    ]);
    expect(messages({ node_count: 4 }, limited)).toEqual([]);
  });
});
