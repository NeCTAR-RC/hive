import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatCalendarDate,
  formatDate,
  formatDayMonth,
  formatGb,
  formatMb,
  formatNumber,
  formatRelative,
  formatSu,
  formatSuRate,
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

  it("formats megabytes as MB or GB", () => {
    expect(formatMb(512)).toBe("512 MB");
    expect(formatMb(4096)).toBe("4 GB");
    expect(formatMb(1536)).toBe("1.5 GB");
    expect(formatMb(null)).toBe("");
    expect(formatGb(30)).toBe("30 GB");
    expect(formatGb(undefined)).toBe("");
  });

  it("formats bytes with binary units, stopping at TB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 ** 3 * 1.2)).toBe("1.2 GB");
    expect(formatBytes(1024 ** 5)).toBe("1,024 TB");
    expect(formatBytes(undefined)).toBe("");
  });

  it("reads date-only values as UTC calendar days", () => {
    expect(formatDayMonth("2026-10-09")).toBe("9 Oct");
    expect(formatDayMonth("2026-10-31T23:30:00Z")).toBe("31 Oct");
    expect(formatDayMonth(null)).toBe("");
    expect(formatCalendarDate("2026-10-09")).toBe("9 Oct 2026");
    expect(formatCalendarDate("")).toBe("");
  });

  it("formats SU rates", () => {
    expect(formatSuRate(0.5)).toBe("0.5 SU/hour");
    expect(formatSuRate(null)).toBe("");
  });
});
