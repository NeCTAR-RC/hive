import { describe, expect, it } from "vitest";
import type { Outage } from "../../lib/api/types/home";
import { outages } from "../../mocks/core/fixtures";
import { outageAlerts, outageMeta, outageTone } from "./outages";

function firstOutage(): Outage {
  const [first] = outages.items;
  if (!first) throw new Error("The mock outage feed is empty.");
  return first;
}

const storage = firstOutage();

function outage(overrides: Partial<Outage>): Outage {
  return { ...storage, ...overrides };
}

describe("outageTone", () => {
  it.each([
    ["severity 4", { severity: 4 }, "danger"],
    ["severity 3", { severity: 3 }, "danger"],
    ["severity 2", { severity: 2 }, "warning"],
    ["severity 1", { severity: 1 }, null],
    ["an ended outage", { severity: 3, end: "2026-10-09T04:00:00Z" }, null],
    ["a cancelled outage", { severity: 3, cancelled: true }, null],
  ] as const)("gives %s the tone %s", (_, overrides, expected) => {
    expect(outageTone(outage(overrides))).toBe(expected);
  });
});

describe("outageAlerts", () => {
  it("keeps the alerting outages with their tone, in order", () => {
    const major = outage({ id: 2, severity: 3 });
    const minor = outage({ id: 3, severity: 1 });
    const cancelled = outage({ id: 4, severity: 2, cancelled: true });
    expect(outageAlerts([storage, minor, major, cancelled])).toEqual([
      { outage: storage, tone: "warning" },
      { outage: major, tone: "danger" },
    ]);
  });

  it("raises nothing for an empty feed", () => {
    expect(outageAlerts([])).toEqual([]);
  });
});

describe("outageMeta", () => {
  it.each([
    ["schedule, status and start", {}, "scheduled | In progress | 9 Oct 2026"],
    [
      "status and start without a schedule",
      { scheduled_display: null },
      "In progress | 9 Oct 2026",
    ],
    [
      "schedule and start without a status",
      { status_display: "" },
      "scheduled | 9 Oct 2026",
    ],
    [
      "nothing when every part is missing",
      { scheduled_display: null, status_display: null, start: "" },
      "",
    ],
  ])("joins %s", (_, overrides, expected) => {
    expect(outageMeta(outage(overrides))).toBe(expected);
  });
});
