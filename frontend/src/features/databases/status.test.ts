import { describe, expect, it } from "vitest";
import type { DbBackup } from "../../lib/api/types";
import {
  hasOpenCidr,
  parameterKind,
  parameterValue,
  parentBackups,
  quotaLimit,
  splitCidrs,
  statusLabel,
  statusTone,
  validParentId,
} from "./status";

function backup(
  id: string,
  instanceId: string,
  status = "COMPLETED",
): DbBackup {
  return {
    id,
    name: id,
    description: null,
    status,
    status_kind: "ok",
    datastore: "mysql",
    datastore_version: "8.0",
    instance_id: instanceId,
    instance_name: null,
    parent_id: null,
    incremental: false,
    size: null,
    location: null,
    created: null,
    updated: null,
    is_transitional: false,
    can_restore: true,
  };
}

describe("database status", () => {
  it("maps each status kind to a tone", () => {
    expect(statusTone("ok")).toBe("success");
    expect(statusTone("error")).toBe("danger");
    expect(statusTone("transitional")).toBe("progress");
    expect(statusTone("warning")).toBe("warning");
    expect(statusTone("unknown")).toBe("neutral");
  });

  it("labels Trove and guest log statuses", () => {
    expect(statusLabel("ACTIVE")).toBe("Active");
    expect(statusLabel("BUILD")).toBe("Building");
    expect(statusLabel("RESTART_REQUIRED")).toBe("Restart required");
    expect(statusLabel("UPGRADE")).toBe("Upgrading");
    expect(statusLabel("Restart_Completed")).toBe("Restart completed");
    expect(statusLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(statusLabel(null)).toBe("Unknown");
  });
});

describe("allowed CIDRs", () => {
  it("splits on whitespace and commas", () => {
    expect(splitCidrs("10.0.0.0/8, 192.168.0.0/16\n\n172.16.0.0/12")).toEqual([
      "10.0.0.0/8",
      "192.168.0.0/16",
      "172.16.0.0/12",
    ]);
    expect(splitCidrs("  ")).toEqual([]);
  });

  it("spots a network open to everyone", () => {
    expect(hasOpenCidr(["10.0.0.0/8", "0.0.0.0/0"])).toBe(true);
    expect(hasOpenCidr(["::/0"])).toBe(true);
    expect(hasOpenCidr(["10.0.0.0/8"])).toBe(false);
  });
});

describe("quota limits", () => {
  it("shows a missing or negative limit as unlimited", () => {
    expect(quotaLimit(-1)).toBe("Unlimited");
    expect(quotaLimit(null)).toBe("Unlimited");
    expect(quotaLimit(undefined)).toBe("Unlimited");
    expect(quotaLimit(0)).toBe("0");
    expect(quotaLimit(4096, (mb) => `${mb} MB`)).toBe("4096 MB");
  });
});

describe("backup parents", () => {
  const backups = [
    backup("a1", "inst-a"),
    backup("a2", "inst-a", "BUILDING"),
    backup("b1", "inst-b"),
  ];

  it("offers only completed backups of the chosen instance", () => {
    expect(parentBackups(backups, "inst-a").map((b) => b.id)).toEqual(["a1"]);
    expect(parentBackups(backups, "inst-b").map((b) => b.id)).toEqual(["b1"]);
  });

  it("clears a parent once another instance is chosen", () => {
    expect(validParentId(backups, "inst-a", "a1")).toBe("a1");
    expect(validParentId(backups, "inst-b", "a1")).toBe("");
    expect(validParentId(backups, "inst-a", "a2")).toBe("");
    expect(validParentId(backups, "inst-a", "")).toBe("");
  });
});

describe("configuration parameters", () => {
  it("picks the input from the spec type", () => {
    expect(parameterKind("boolean")).toBe("boolean");
    expect(parameterKind("integer")).toBe("integer");
    expect(parameterKind("long")).toBe("integer");
    expect(parameterKind("float")).toBe("float");
    expect(parameterKind("string")).toBe("string");
    expect(parameterKind(null)).toBe("string");
  });

  it("sends each kind as the string the backend coerces", () => {
    const values = { text: " utf8mb4 ", number: 42, flag: true };
    expect(parameterValue("boolean", values)).toBe("true");
    expect(parameterValue("boolean", { ...values, flag: false })).toBe("false");
    expect(parameterValue("integer", values)).toBe("42");
    expect(parameterValue("float", { ...values, number: 0.5 })).toBe("0.5");
    expect(parameterValue("string", values)).toBe("utf8mb4");
  });
});
