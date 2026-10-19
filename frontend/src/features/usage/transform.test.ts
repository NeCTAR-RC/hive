import { describe, expect, it } from "vitest";
import {
  activePreset,
  dailyGuide,
  daysAgo,
  mostUsedItems,
  resolveRange,
  typeItems,
} from "./transform";

const today = new Date("2026-10-10T03:00:00Z");

describe("usage trend transforms", () => {
  it("defaults the range to the past year and clamps to the data floor", () => {
    expect(resolveRange({}, "2022-01-01", today)).toEqual({
      begin: "2025-10-10",
      end: "2026-10-10",
    });
    expect(resolveRange({ begin: "2020-01-01" }, "2022-01-01", today)).toEqual({
      begin: "2022-01-01",
      end: "2026-10-10",
    });
    expect(
      resolveRange(
        { begin: "2026-11-01", end: "2026-10-01" },
        "2022-01-01",
        today,
      ),
    ).toEqual({ begin: "2026-10-01", end: "2026-10-01" });
    expect(resolveRange({ begin: "nope" }, "2022-01-01", today).begin).toBe(
      daysAgo(365, today),
    );
  });

  it("ranks services and instances", () => {
    expect(
      typeItems([
        { type: "instance", rate: 10.456 },
        { type: "load_balancer", rate: 20 },
        { type: "volume", rate: 0 },
      ]),
    ).toEqual([
      { id: "load_balancer", label: "Load balancers", value: 20 },
      { id: "instance", label: "Instances", value: 10.46 },
    ]);
    const items = mostUsedItems({
      count: 7,
      items: [{ name: "web", rate: 5 }],
      other: 2.5,
    });
    expect(items.map((i) => i.label)).toEqual(["web", "Other"]);
    expect(items[1]?.muted).toBe(true);
  });

  it("spreads the budget over the allocation for the guide", () => {
    const allocation = {
      su_budget: 3650,
      allocation: { start_date: "2026-01-01", end_date: "2027-01-01" },
    } as never;
    expect(dailyGuide(allocation)).toEqual({ value: 10, label: "Daily guide" });
    expect(dailyGuide(undefined)).toBeUndefined();
  });
});

describe("activePreset", () => {
  const today = new Date("2026-10-13T00:00:00Z");

  it("names the preset a range matches", () => {
    expect(activePreset("2026-09-13", "2026-10-13", "2020-01-01", today)).toBe(
      "30d",
    );
    expect(activePreset("2025-10-13", "2026-10-13", "2020-01-01", today)).toBe(
      "1y",
    );
  });

  it("matches a preset clamped to the first day of data", () => {
    // 6 months and a year both start at the first day of data here; the
    // shorter one is the one shown as active.
    expect(activePreset("2026-06-01", "2026-10-13", "2026-06-01", today)).toBe(
      "6m",
    );
  });

  it("returns null for a custom range", () => {
    expect(
      activePreset("2026-09-01", "2026-10-13", "2020-01-01", today),
    ).toBeNull();
    expect(
      activePreset("2026-09-13", "2026-10-12", "2020-01-01", today),
    ).toBeNull();
  });
});
