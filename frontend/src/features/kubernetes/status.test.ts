import { describe, expect, it } from "vitest";
import type {
  ClusterOptions,
  ClusterTemplate,
  TemplateCombination,
} from "../../lib/api/types";
import {
  driversFor,
  formatLabels,
  formatTaints,
  healthLabel,
  healthTone,
  isTransitional,
  LABELS_PATTERN,
  statusLabel,
  statusTone,
  TAINTS_PATTERN,
  templateFor,
  zonesFor,
} from "./status";

describe("cluster status", () => {
  it("maps Heat-style states to tones", () => {
    expect(statusTone("CREATE_IN_PROGRESS")).toBe("progress");
    expect(statusTone("UPDATE_FAILED")).toBe("danger");
    expect(statusTone("CREATE_COMPLETE")).toBe("success");
    expect(statusTone("DELETE_COMPLETE")).toBe("neutral");
    expect(statusTone(null)).toBe("neutral");
    expect(isTransitional("DELETE_IN_PROGRESS")).toBe(true);
    expect(isTransitional("CREATE_COMPLETE")).toBe(false);
  });

  it("labels states as magnum-ui shows them", () => {
    expect(statusLabel("CREATE_COMPLETE")).toBe("Create complete");
    expect(statusLabel("UPDATE_IN_PROGRESS")).toBe("Update in progress");
    expect(statusLabel("ROLLBACK_FAILED")).toBe("Rollback failed");
    expect(statusLabel(undefined)).toBe("Unknown");
  });

  it("maps health", () => {
    expect(healthTone("HEALTHY")).toBe("success");
    expect(healthTone("UNHEALTHY")).toBe("danger");
    expect(healthTone("UNKNOWN")).toBe("neutral");
    expect(healthLabel("UNHEALTHY")).toBe("Unhealthy");
    expect(healthLabel(null)).toBe("Unknown");
  });
});

describe("node labels and taints", () => {
  it("accepts comma separated key=value labels", () => {
    expect(LABELS_PATTERN.test("role=gpu")).toBe(true);
    expect(LABELS_PATTERN.test("role=gpu, tier=")).toBe(true);
    expect(LABELS_PATTERN.test("role")).toBe(false);
    expect(LABELS_PATTERN.test("role=gpu,")).toBe(false);
    expect(LABELS_PATTERN.test("a=b=c")).toBe(false);
    expect(LABELS_PATTERN.test("role=g pu")).toBe(false);
  });

  it("accepts key[=value]:Effect taints", () => {
    expect(TAINTS_PATTERN.test("gpu=true:NoSchedule")).toBe(true);
    expect(
      TAINTS_PATTERN.test("dedicated:NoExecute, x=y:PreferNoSchedule"),
    ).toBe(true);
    expect(TAINTS_PATTERN.test("gpu=true")).toBe(false);
    expect(TAINTS_PATTERN.test("gpu:Sometimes")).toBe(false);
  });

  it("formats what it parses", () => {
    const taints = formatTaints([
      { key: "gpu", value: "true", effect: "NoSchedule" },
      { key: "dedicated", value: "", effect: "NoExecute" },
    ]);
    expect(taints).toBe("gpu=true:NoSchedule,dedicated:NoExecute");
    expect(TAINTS_PATTERN.test(taints)).toBe(true);
    const labels = formatLabels({ role: "gpu", tier: "web" });
    expect(labels).toBe("role=gpu,tier=web");
    expect(LABELS_PATTERN.test(labels)).toBe(true);
  });
});

describe("create cluster cascade", () => {
  const combination = (
    version: string,
    zone: string,
    driver: string,
    id: string,
  ): TemplateCombination => ({
    kubernetes_version: version,
    availability_zone: zone,
    network_driver: driver,
    template_id: id,
  });
  const template = (id: string) => ({ id, name: id }) as ClusterTemplate;
  const options = {
    combinations: [
      combination("v1.30", "melbourne", "calico", "t1"),
      combination("v1.30", "melbourne", "flannel", "t2"),
      combination("v1.30", "auckland", "calico", "t3"),
      combination("v1.31", "melbourne", "calico", "t4"),
    ],
    templates: [template("t1"), template("t2"), template("t3"), template("t4")],
  } as ClusterOptions;

  it("narrows zones by version and drivers by version and zone", () => {
    expect(zonesFor(options, "v1.30")).toEqual(["auckland", "melbourne"]);
    expect(zonesFor(options, "v1.31")).toEqual(["melbourne"]);
    expect(driversFor(options, "v1.30", "melbourne")).toEqual([
      "calico",
      "flannel",
    ]);
    expect(driversFor(options, "v1.30", "auckland")).toEqual(["calico"]);
    expect(zonesFor(undefined, "v1.30")).toEqual([]);
  });

  it("names exactly one template for a full choice", () => {
    expect(templateFor(options, "v1.30", "melbourne", "flannel")?.id).toBe(
      "t2",
    );
    expect(templateFor(options, "v1.31", "melbourne", "calico")?.id).toBe("t4");
    expect(templateFor(options, "v1.31", "auckland", "calico")).toBeUndefined();
    expect(templateFor(undefined, "v1.30", "melbourne", "calico")).toBe(
      undefined,
    );
  });
});
