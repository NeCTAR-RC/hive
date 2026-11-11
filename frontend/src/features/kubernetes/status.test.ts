import { describe, expect, it } from "vitest";
import type { ActionOffer } from "../../lib/actions";
import type { Cluster, NodeGroup } from "../../lib/api/types/kubernetes";
import {
  availableClusterActions,
  availableNodeGroupActions,
  formatLabels,
  formatTaints,
  healthLabel,
  healthReason,
  healthTone,
  isTransitional,
  LABELS_PATTERN,
  statusLabel,
  statusTone,
  TAINTS_PATTERN,
} from "./status";

describe("cluster status", () => {
  it.each([
    {
      status: "CREATE_IN_PROGRESS",
      tone: "progress",
      label: "Create in progress",
      busy: true,
    },
    {
      status: "UPDATE_COMPLETE",
      tone: "success",
      label: "Update complete",
      busy: false,
    },
    {
      status: "DELETE_FAILED",
      tone: "danger",
      label: "Delete failed",
      busy: false,
    },
    {
      status: "DELETE_COMPLETE",
      tone: "neutral",
      label: "Delete complete",
      busy: false,
    },
    {
      status: "ROLLBACK_COMPLETE",
      tone: "success",
      label: "Rollback complete",
      busy: false,
    },
    { status: null, tone: "neutral", label: "Unknown", busy: false },
    { status: undefined, tone: "neutral", label: "Unknown", busy: false },
  ])("$status is $label ($tone)", ({ status, tone, label, busy }) => {
    expect(statusTone(status)).toBe(tone);
    expect(statusLabel(status)).toBe(label);
    expect(isTransitional(status)).toBe(busy);
  });
});

describe("cluster health", () => {
  it.each([
    { health: "HEALTHY", tone: "success", label: "Healthy" },
    { health: "UNHEALTHY", tone: "danger", label: "Unhealthy" },
    { health: "UNKNOWN", tone: "neutral", label: "Unknown" },
    { health: null, tone: "neutral", label: "Unknown" },
  ])("$health is $label ($tone)", ({ health, tone, label }) => {
    expect(healthTone(health)).toBe(tone);
    expect(healthLabel(health)).toBe(label);
  });

  it.each([
    { reason: null, expected: "" },
    { reason: "api unreachable", expected: "api unreachable" },
    {
      reason: { "node-0.Ready": "False", api: "ok" },
      expected: "node-0.Ready: False, api: ok",
    },
  ])("explains $reason", ({ reason, expected }) => {
    expect(healthReason({ health_status_reason: reason })).toBe(expected);
  });
});

describe("node labels and taints", () => {
  it("writes labels and taints as magnum takes them", () => {
    expect(formatLabels({ role: "gpu", zone: "a" })).toBe("role=gpu,zone=a");
    expect(formatLabels({})).toBe("");
    expect(
      formatTaints([
        { key: "gpu", value: "true", effect: "NoSchedule" },
        { key: "spot", value: "", effect: "NoExecute" },
        { key: "dedicated", value: null, effect: "PreferNoSchedule" },
      ]),
    ).toBe("gpu=true:NoSchedule,spot:NoExecute,dedicated:PreferNoSchedule");
  });

  it.each([
    { text: "role=gpu", valid: true },
    { text: "role=gpu, zone=a", valid: true },
    { text: "role=", valid: true },
    { text: "role", valid: false },
    { text: "role=gpu,", valid: false },
    { text: "a b=c", valid: false },
  ])("labels $text valid: $valid", ({ text, valid }) => {
    expect(LABELS_PATTERN.test(text)).toBe(valid);
  });

  it.each([
    { text: "gpu=true:NoSchedule", valid: true },
    { text: "spot:NoExecute, gpu:PreferNoSchedule", valid: true },
    { text: "gpu=true", valid: false },
    { text: "gpu:Sometimes", valid: false },
  ])("taints $text valid: $valid", ({ text, valid }) => {
    expect(TAINTS_PATTERN.test(text)).toBe(valid);
  });
});

/** The offers as `id: reason` pairs, with "" for an enabled action. */
const reasons = (offers: ActionOffer<string>[]) =>
  Object.fromEntries(offers.map((o) => [o.id, o.disabledReason ?? ""]));

const cluster = (overrides: Partial<Cluster> = {}): Cluster => ({
  id: "c1",
  name: "k8s",
  status: "CREATE_COMPLETE",
  status_reason: null,
  health_status: "HEALTHY",
  health_status_reason: null,
  master_count: 1,
  node_count: 2,
  coe_version: null,
  cluster_template_id: null,
  template_name: null,
  keypair: null,
  api_address: "https://203.0.113.10:6443",
  master_addresses: [],
  node_addresses: [],
  master_flavor_id: null,
  flavor_id: null,
  create_timeout: null,
  labels: {},
  availability_zone: null,
  network_driver: null,
  kubernetes_version: null,
  upgrade_targets: [],
  stack_id: null,
  created_at: null,
  updated_at: null,
  actions: ["config", "certificate", "sign", "upgrade", "nodegroups", "delete"],
  ...overrides,
});

const group = (overrides: Partial<NodeGroup> = {}): NodeGroup => ({
  id: "g1",
  name: "workers",
  role: "worker",
  is_default: false,
  status: "CREATE_COMPLETE",
  status_reason: null,
  flavor_id: null,
  image_id: null,
  node_count: 2,
  min_node_count: 1,
  max_node_count: 3,
  node_addresses: [],
  labels: {},
  auto_scaling: true,
  node_labels: {},
  node_taints: [],
  created_at: null,
  updated_at: null,
  ...overrides,
});

const WAIT = "Wait for the cluster to finish its current operation";

describe("cluster actions", () => {
  it("offers everything on a completed cluster", () => {
    expect(reasons(availableClusterActions(cluster()))).toEqual({
      config: "",
      nodegroups: "",
      upgrade: "",
      certificate: "",
      sign: "",
      delete: "",
    });
  });

  it("disables what a cluster still being created cannot do", () => {
    const creating = cluster({
      status: "CREATE_IN_PROGRESS",
      api_address: null,
      actions: ["config", "certificate", "sign", "delete"],
    });
    expect(reasons(availableClusterActions(creating))).toEqual({
      config: "The cluster has no API address yet",
      nodegroups: "",
      upgrade: "The cluster must be in a completed state",
      certificate: "The cluster has no API address yet",
      sign: "The cluster has no API address yet",
      delete: "",
    });
  });

  it("waits to delete while another operation runs", () => {
    const updating = cluster({
      status: "UPDATE_IN_PROGRESS",
      actions: ["config", "certificate", "sign"],
    });
    expect(reasons(availableClusterActions(updating)).delete).toBe(
      "Wait for the current operation to finish",
    );
  });
});

describe("node group actions", () => {
  it("offers everything on a worker group while the cluster can change", () => {
    expect(reasons(availableNodeGroupActions(group(), true))).toEqual({
      resize: "",
      autoscaling: "",
      labels: "",
      delete: "",
    });
  });

  it("names the group's own reason before the cluster's state", () => {
    const master = group({
      role: "master",
      is_default: true,
      auto_scaling: false,
    });
    expect(reasons(availableNodeGroupActions(master, false))).toEqual({
      resize: WAIT,
      autoscaling: "Autoscaling is not enabled on this node group",
      labels: "Control plane node groups cannot carry labels or taints",
      delete: "The default node group cannot be deleted",
    });
  });

  it("waits for the cluster on an otherwise allowed action", () => {
    expect(reasons(availableNodeGroupActions(group(), false))).toEqual({
      resize: WAIT,
      autoscaling: WAIT,
      labels: WAIT,
      delete: WAIT,
    });
  });
});
