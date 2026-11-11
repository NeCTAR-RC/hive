import { describe, expect, it } from "vitest";
import { formatReservedDays, nextDay, utcDay } from "./days";

describe("utcDay", () => {
  it("reads the UTC day of a time, whatever its offset", () => {
    expect(utcDay("2026-10-20T23:59:00+00:00")).toBe("2026-10-20");
    expect(utcDay("2026-10-21T10:59:00+11:00")).toBe("2026-10-20");
    expect(utcDay(null)).toBeUndefined();
    expect(utcDay("soon")).toBeUndefined();
  });
});

describe("formatReservedDays", () => {
  it("shows the days chosen, not the local end on the next day", () => {
    expect(
      formatReservedDays(
        "2026-10-16T00:00:00+00:00",
        "2026-10-20T23:59:00+00:00",
      ),
    ).toBe("16 to 20 Oct 2026");
  });

  it("names both months or both years when they differ", () => {
    expect(
      formatReservedDays("2026-10-28T00:00:00Z", "2026-11-03T23:59:00Z"),
    ).toBe("28 Oct to 3 Nov 2026");
    expect(
      formatReservedDays("2026-12-28T00:00:00Z", "2027-01-03T23:59:00Z"),
    ).toBe("28 Dec 2026 to 3 Jan 2027");
  });

  it("shows one day once, and nothing without both ends", () => {
    expect(
      formatReservedDays("2026-10-16T07:29:00Z", "2026-10-16T23:59:00Z"),
    ).toBe("16 Oct 2026");
    expect(formatReservedDays(null, "2026-10-16T23:59:00Z")).toBe("");
  });
});

describe("nextDay", () => {
  it("steps over month and year ends", () => {
    expect(nextDay("2026-10-31")).toBe("2026-11-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });
});
