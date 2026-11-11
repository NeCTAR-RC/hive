import { describe, expect, it } from "vitest";
import { allows } from "../../../lib/actions";
import type { Instance } from "../../../lib/api/types/compute";
import { splitEligible } from "../../../lib/bulk";
import {
  availableActions,
  isTransitional,
  listedAddresses,
  matchesStatusFilter,
  powerStateLabel,
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

  it("lists fixed addresses first, then the floating ones", () => {
    const [fixed, floating] = instance().addresses;
    expect(
      listedAddresses(instance({ addresses: [floating!, fixed!] })),
    ).toEqual([
      { addr: "203.0.113.5", floating: false },
      { addr: "203.0.113.9", floating: true },
    ]);
  });
});

describe("powerStateLabel", () => {
  it("uses Horizon's wording for every Nova power state", () => {
    expect(powerStateLabel({ power_state: "SHUTOFF" })).toBe("Shut off");
    expect(powerStateLabel({ power_state: "SHUTDOWN" })).toBe("Shut down");
    expect(powerStateLabel({ power_state: "RUNNING" })).toBe("Running");
    expect(powerStateLabel({ power_state: "BUILDING" })).toBe("Building");
    expect(powerStateLabel({ power_state: "NO STATE" })).toBe("No state");
    expect(powerStateLabel({ power_state: "" })).toBe("No state");
  });
});

describe("statusTone", () => {
  it("reads a status alone, without the rest of the instance", () => {
    expect(statusTone({ status: "SHUTOFF", task_state: null })).toBe("neutral");
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

  it("lists every action and says why one is unavailable", () => {
    const actions = availableActions(instance({ status: "SHUTOFF" }));
    expect(actions).toHaveLength(31);
    const stop = actions.find((a) => a.id === "stop");
    expect(stop?.isDisabled).toBe(true);
    expect(stop?.disabledReason).toBe(
      "Not available while the status is SHUTOFF",
    );
  });

  it("disables everything while the instance is deleted", () => {
    const actions = availableActions(
      instance({ task_state: "deleting", status: "ACTIVE" }),
    );
    expect(actions.every((a) => a.isDisabled)).toBe(true);
    expect(actions[0]?.disabledReason).toBe("The instance is being deleted");
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
    expect(actions.find((a) => a.id === "delete")?.disabledReason).toBe(
      "Unlock the instance first",
    );
    expect(actions.find((a) => a.id === "unlock")?.isDisabled).toBe(false);
    expect(actions.find((a) => a.id === "lock")?.disabledReason).toBe(
      "The instance is already locked",
    );
  });

  it("disables what Nova refuses on a locked instance", () => {
    const locked = instance({ locked: true, volumes_attached: ["v1"] });
    const reasons = new Map(
      availableActions(locked).map((a) => [a.id, a.disabledReason]),
    );
    for (const id of [
      "stop",
      "soft-reboot",
      "hard-reboot",
      "pause",
      "suspend",
      "shelve",
      "rescue",
      "resize",
      "rebuild",
      "metadata",
      "attach-interface",
      "detach-interface",
      "attach-volume",
      "detach-volume",
      "delete",
    ] as const) {
      expect(reasons.get(id), id).toBe("Unlock the instance first");
    }
    for (const id of [
      "console",
      "log",
      "edit",
      "security-groups",
      "snapshot",
      "associate-fip",
      "unlock",
    ] as const) {
      expect(reasons.get(id), id).toBeUndefined();
    }
  });

  it("gives the state reason before the lock", () => {
    const stop = availableActions(
      instance({ locked: true, status: "SHUTOFF" }),
    ).find((a) => a.id === "stop");
    expect(stop?.disabledReason).toBe(
      "Not available while the status is SHUTOFF",
    );
  });

  it("tells the two resumes apart", () => {
    const labels = availableActions(instance()).map((a) => a.label);
    expect(labels).toContain("Unpause instance");
    expect(labels).toContain("Resume instance");
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("offers detach volume only with a volume attached", () => {
    const detach = (i: Instance) =>
      availableActions(i).find((a) => a.id === "detach-volume");
    expect(detach(instance())?.disabledReason).toBe("No volumes are attached");
    expect(detach(instance({ volumes_attached: ["v1"] }))?.isDisabled).toBe(
      false,
    );
  });

  it("offers a floating IP only to an instance with a reachable port", () => {
    const associate = (targets?: ReadonlySet<string>) =>
      availableActions(instance(), { floatingTargets: targets }).find(
        (a) => a.id === "associate-fip",
      );
    expect(associate(new Set(["other"]))?.disabledReason).toMatch(
      /classic network/,
    );
    expect(associate(new Set(["i-1"]))?.isDisabled).toBe(false);
    // Not known yet: the dialog explains a missing port.
    expect(associate(undefined)?.isDisabled).toBe(false);
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

describe("batch eligibility", () => {
  const active = instance({ id: "a", name: "active" });
  const shutoff = instance({
    id: "s",
    name: "shutoff",
    status: "SHUTOFF",
    power_state: "SHUTDOWN",
  });
  const locked = instance({ id: "l", name: "locked", locked: true });
  const busy = instance({ id: "b", name: "busy", task_state: "rebooting" });
  const names = (rows: Instance[]) => rows.map((row) => row.name);

  it.each([
    {
      action: "start",
      eligible: ["shutoff"],
      skipped: ["active", "locked", "busy"],
    },
    {
      action: "stop",
      eligible: ["active"],
      skipped: ["shutoff", "locked", "busy"],
    },
    {
      action: "soft-reboot",
      eligible: ["active", "shutoff"],
      skipped: ["locked", "busy"],
    },
    {
      action: "delete",
      eligible: ["active", "shutoff", "busy"],
      skipped: ["locked"],
    },
  ] as const)("$action runs on $eligible", ({ action, eligible, skipped }) => {
    const targets = splitEligible([active, shutoff, locked, busy], (row) =>
      allows(availableActions(row), action),
    );
    expect(names(targets.eligible)).toEqual(eligible);
    expect(names(targets.skipped)).toEqual(skipped);
  });
});

describe("matchesStatusFilter", () => {
  it.each([
    { filter: "", status: "ERROR", matches: true },
    { filter: "ACTIVE", status: "ACTIVE", matches: true },
    { filter: "ACTIVE", status: "SHUTOFF", matches: false },
    { filter: "SHELVED", status: "SHELVED", matches: true },
    { filter: "SHELVED", status: "SHELVED_OFFLOADED", matches: true },
    { filter: "SHELVED", status: "SHUTOFF", matches: false },
    // An id from an old link that is not a listed filter: exact status.
    { filter: "SHELVED_OFFLOADED", status: "SHELVED_OFFLOADED", matches: true },
    { filter: "SHELVED_OFFLOADED", status: "SHELVED", matches: false },
  ])("$filter on $status: $matches", ({ filter, status, matches }) => {
    expect(matchesStatusFilter({ status }, filter)).toBe(matches);
  });
});
