import { describe, expect, it } from "vitest";
import type { Instance } from "../../../lib/api/types";
import {
  addressSummary,
  availableActions,
  isTransitional,
  statusLabel,
  statusTone,
} from "./status";

function instance(overrides: Partial<Instance> = {}): Instance {
  return {
    id: "i-1",
    name: "web-1",
    description: null,
    status: "ACTIVE",
    power_state: "RUNNING",
    task_state: null,
    vm_state: "active",
    availability_zone: "melbourne-qh2",
    created: "2026-10-01T00:00:00Z",
    updated: "2026-10-01T00:00:00Z",
    locked: false,
    host_id: null,
    key_name: null,
    progress: 0,
    user_id: "u1",
    project_id: "p1",
    flavor: null,
    image: { id: "img", name: "Ubuntu" },
    boot_from_volume: false,
    addresses: [
      {
        network: "classic",
        addr: "203.0.113.5",
        version: 4,
        type: "fixed",
        mac: null,
      },
      {
        network: "classic",
        addr: "203.0.113.9",
        version: 4,
        type: "floating",
        mac: null,
      },
    ],
    security_groups: ["default"],
    volumes_attached: [],
    metadata: {},
    fault: null,
    server_group_ids: [],
    ...overrides,
  };
}

const ids = (i: Instance) =>
  availableActions(i)
    .filter((a) => !a.isDisabled)
    .map((a) => a.id);

describe("status presentation", () => {
  it("shows the task while there is one", () => {
    expect(statusLabel(instance())).toBe("ACTIVE");
    expect(statusLabel(instance({ task_state: "powering-off" }))).toBe(
      "powering-off",
    );
    expect(statusTone(instance({ task_state: "powering-off" }))).toBe(
      "progress",
    );
    expect(isTransitional(instance({ status: "BUILD" }))).toBe(true);
    expect(statusTone(instance({ status: "ERROR" }))).toBe("danger");
    expect(statusTone(instance({ status: "SHUTOFF" }))).toBe("neutral");
  });

  it("marks floating addresses", () => {
    expect(addressSummary(instance())).toEqual([
      "203.0.113.5",
      "203.0.113.9 (floating)",
    ]);
  });
});

describe("availableActions", () => {
  it("offers the Horizon set for an active instance", () => {
    const offered = ids(instance());
    expect(offered).toContain("console");
    expect(offered).toContain("stop");
    expect(offered).toContain("resize");
    expect(offered).toContain("snapshot");
    expect(offered).not.toContain("start");
    expect(offered).not.toContain("unpause");
    expect(offered).toContain("delete");
  });

  it("offers start, not stop, for a shut off instance", () => {
    const offered = ids(instance({ status: "SHUTOFF" }));
    expect(offered).toContain("start");
    expect(offered).not.toContain("stop");
    expect(offered).not.toContain("console");
  });

  it("disables everything but delete while a task runs", () => {
    const actions = availableActions(instance({ task_state: "rebooting" }));
    const stop = actions.find((a) => a.id === "stop");
    expect(stop?.isDisabled).toBe(true);
    expect(stop?.disabledReason).toMatch(/current task/);
    expect(actions.find((a) => a.id === "delete")?.isDisabled).toBe(false);
    expect(actions.find((a) => a.id === "log")?.isDisabled).toBe(false);
  });

  it("keeps a locked instance from being deleted", () => {
    const actions = availableActions(instance({ locked: true }));
    expect(actions.find((a) => a.id === "delete")?.isDisabled).toBe(true);
    expect(actions.find((a) => a.id === "unlock")).toBeDefined();
    expect(actions.find((a) => a.id === "lock")).toBeUndefined();
  });

  it("explains why boot-from-volume instances cannot be rebuilt", () => {
    const actions = availableActions(instance({ boot_from_volume: true }));
    const rebuild = actions.find((a) => a.id === "rebuild");
    expect(rebuild?.isDisabled).toBe(true);
    expect(rebuild?.disabledReason).toMatch(/volume/);
  });

  it("offers confirm and revert only while verifying a resize", () => {
    expect(ids(instance({ status: "VERIFY_RESIZE" }))).toEqual(
      expect.arrayContaining(["confirm-resize", "revert-resize"]),
    );
    expect(ids(instance())).not.toContain("confirm-resize");
  });
});
