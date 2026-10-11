import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatNumber,
  formatRelative,
  formatSu,
  parseDate,
} from "./format";

describe("format helpers", () => {
  it("parses ISO strings and unix seconds", () => {
    expect(parseDate("2026-10-09T01:00:00Z")?.toISOString()).toBe(
      "2026-10-09T01:00:00.000Z",
    );
    expect(parseDate(1791541295)?.getUTCFullYear()).toBe(2026);
    expect(parseDate("not a date")).toBeNull();
    expect(parseDate(null)).toBeNull();
  });

  it("formats dates in Australian English", () => {
    expect(formatDate("2026-10-09T01:00:00Z")).toMatch(/9 Oct 2026|Oct 2026/);
    expect(formatDate("")).toBe("");
  });

  it("formats numbers with at most two decimals", () => {
    expect(formatNumber(1234.567)).toBe("1,234.57");
    expect(formatNumber(null)).toBe("");
  });

  it("treats -1 SU as unlimited", () => {
    expect(formatSu(-1)).toBe("Unlimited");
    expect(formatSu(12.345)).toBe("12.35");
    expect(formatSu(undefined)).toBe("");
  });

  it("describes relative time", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");
    expect(formatRelative("2026-10-09T11:58:00Z", now)).toBe("2 minutes ago");
    expect(formatRelative("2026-10-08T12:00:00Z", now)).toBe("yesterday");
  });
});
