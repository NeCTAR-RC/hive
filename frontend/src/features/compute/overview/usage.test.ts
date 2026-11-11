import { describe, expect, it } from "vitest";
import { dailyPoints, peak, trendSummary } from "./usage";

describe("dailyPoints", () => {
  it("keeps the calendar day and rounds the rate", () => {
    const points = dailyPoints([
      { begin: "2026-10-02T00:00:00+00:00", rate: "1.2345" },
      { begin: "2026-10-01T00:00:00+00:00", rate: 3 },
      { begin: "2026-10-03T00:00:00+00:00", rate: null },
      { rate: 9 },
    ]);
    expect(points).toEqual([
      { date: "2026-10-01", value: 3 },
      { date: "2026-10-02", value: 1.23 },
      { date: "2026-10-03", value: 0 },
    ]);
    expect(peak(points)).toEqual({ date: "2026-10-01", value: 3 });
    expect(peak([])).toBeNull();
  });
});

describe("trendSummary", () => {
  const summary = {
    begin: "2026-07-14T00:00:00+00:00",
    end: "2026-10-14T00:00:00+00:00",
    sum: 1234.5,
  };

  it("names the period, the total and the busiest day", () => {
    expect(trendSummary(summary, { date: "2026-10-01", value: 48 })).toBe(
      "Daily service unit usage from 14 July 2026 to 14 Oct 2026: 1,234.5 in total, peaking at 48 on 1 Oct 2026.",
    );
  });

  it("ends after the total when there is no busiest day", () => {
    expect(trendSummary(summary, null)).toBe(
      "Daily service unit usage from 14 July 2026 to 14 Oct 2026: 1,234.5 in total.",
    );
  });
});
