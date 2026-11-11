import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activePreset,
  dailyGuide,
  daysAgo,
  guideAt,
  localToday,
  mostUsedItems,
  resolveRange,
  typeItems,
} from "./transform";

const today = "2026-10-10";

describe("localToday", () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    // 21:30 UTC on the 14th is 08:30 on the 15th in Sydney (AEDT, +11).
    {
      at: "2026-10-14T21:30:00Z",
      zone: "Australia/Sydney",
      expected: "2026-10-15",
    },
    { at: "2026-10-14T21:30:00Z", zone: "UTC", expected: "2026-10-14" },
    // Perth (+8) is still on the 14th at 15:59 UTC, and on the 15th at 16:00.
    {
      at: "2026-10-14T15:59:00Z",
      zone: "Australia/Perth",
      expected: "2026-10-14",
    },
    {
      at: "2026-10-14T16:00:00Z",
      zone: "Australia/Perth",
      expected: "2026-10-15",
    },
  ])("is $expected at $at in $zone", ({ at, zone, expected }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(at));
    expect(localToday(zone)).toBe(expected);
  });
});

describe("activePreset", () => {
  it("names the preset the range is", () => {
    expect(
      activePreset(
        { begin: daysAgo(30, today), end: today },
        "2020-01-01",
        today,
      ),
    ).toBe("30d");
    expect(
      activePreset(
        { begin: daysAgo(365, today), end: today },
        "2020-01-01",
        today,
      ),
    ).toBe("1y");
  });

  it("names none for typed dates", () => {
    expect(
      activePreset(
        { begin: daysAgo(31, today), end: today },
        "2020-01-01",
        today,
      ),
    ).toBeUndefined();
    expect(
      activePreset(
        { begin: daysAgo(30, today), end: "2026-10-09" },
        "2020-01-01",
        today,
      ),
    ).toBeUndefined();
  });

  it("matches a preset clamped to the data floor", () => {
    expect(
      activePreset({ begin: "2026-01-01", end: today }, "2026-01-01", today),
    ).toBe("1y");
  });
});

describe("daysAgo", () => {
  it.each([
    { days: 0, expected: "2026-10-10" },
    { days: 30, expected: "2026-09-10" },
    { days: 365, expected: "2025-10-10" },
    // Calendar days, so a DST change in between does not shift the date.
    { days: 10, from: "2026-10-12", expected: "2026-10-02" },
  ])("$days days before is $expected", ({ days, from, expected }) => {
    expect(daysAgo(days, from ?? today)).toBe(expected);
  });
});

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

describe("guideAt", () => {
  const guide = [
    { date: "2026-01-01", value: 0 },
    { date: "2026-01-11", value: 1000 },
  ];

  it.each([
    ["the start", "2026-01-01", 0],
    ["a date between the ends", "2026-01-04", 300],
    ["the end", "2026-01-11", 1000],
    ["a date before the start, held at the start", "2025-12-25", 0],
    ["a date after the end, held at the end", "2026-02-01", 1000],
  ])("reads %s", (_, date, expected) => {
    expect(guideAt(date, guide)).toBe(expected);
  });

  it("rounds to two decimal places", () => {
    const thirds = [
      { date: "2026-01-01", value: 0 },
      { date: "2026-01-04", value: 100 },
    ];
    expect(guideAt("2026-01-02", thirds)).toBe(33.33);
  });

  it("reads 0 without both end points", () => {
    expect(guideAt("2026-01-04", [])).toBe(0);
    expect(guideAt("2026-01-04", [{ date: "2026-01-01", value: 0 }])).toBe(0);
  });

  it("reads the end value when the guide spans no time", () => {
    const flat = [
      { date: "2026-01-01", value: 0 },
      { date: "2026-01-01", value: 500 },
    ];
    expect(guideAt("2026-01-01", flat)).toBe(500);
  });
});
