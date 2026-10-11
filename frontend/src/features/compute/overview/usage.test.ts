import { describe, expect, it } from "vitest";
import { dailyPoints, peak } from "./usage";

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
