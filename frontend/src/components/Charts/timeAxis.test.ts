import { describe, expect, it } from "vitest";
import { dayTime, monthTicks, timeDay } from "./timeAxis";

describe("dayTime and timeDay", () => {
  it("round-trips an ISO day through its UTC midnight", () => {
    expect(dayTime("2026-03-01")).toBe(Date.UTC(2026, 2, 1));
    expect(timeDay(dayTime("2026-12-31"))).toBe("2026-12-31");
    expect(dayTime("not a day")).toBeNaN();
  });
});

describe("monthTicks", () => {
  it("puts one tick on the first of every month of a year", () => {
    const ticks = monthTicks(dayTime("2026-01-01"), dayTime("2026-12-31"));
    expect(ticks.map(timeDay)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
      "2026-12-01",
    ]);
  });

  it("starts at the next month for a mid-month start and crosses years", () => {
    const ticks = monthTicks(dayTime("2025-11-15"), dayTime("2026-02-01"));
    expect(ticks.map(timeDay)).toEqual([
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ]);
  });

  it("gives nothing for an empty or reversed period", () => {
    expect(monthTicks(Number.NaN, 0)).toEqual([]);
    expect(monthTicks(dayTime("2026-02-01"), dayTime("2026-01-01"))).toEqual(
      [],
    );
  });
});
