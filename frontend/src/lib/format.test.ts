import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collator,
  formatBytes,
  formatCalendarDate,
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatGb,
  formatMb,
  formatMonthYear,
  formatNumber,
  formatRelative,
  formatSu,
  formatSuRate,
  formatWithUnit,
  parseDate,
} from "./format";

describe("parseDate", () => {
  it.each([
    ["an ISO string", "2026-10-09T01:00:00Z", "2026-10-09T01:00:00.000Z"],
    ["unix seconds", 1791541295, "2026-10-09T10:21:35.000Z"],
  ])("reads %s", (_, value, iso) => {
    expect(parseDate(value)?.toISOString()).toBe(iso);
  });

  it.each([["not a date"], [""], [null], [undefined]])(
    "returns null for %j",
    (value) => {
      expect(parseDate(value)).toBeNull();
    },
  );
});

describe("dates in Melbourne time", () => {
  it.each([
    [formatDate, "2026-10-09T01:00:00Z", "9 Oct 2026"],
    [formatDate, "", ""],
    [formatDateTime, "2026-10-09T01:00:00Z", "9 Oct 2026, 12:00 pm"],
    [formatDayMonth, "2026-10-09", "9 Oct"],
    [formatCalendarDate, "2026-10-09", "9 Oct 2026"],
    [formatCalendarDate, null, ""],
    [formatMonthYear, "2026-10-09", "Oct 26"],
    [formatMonthYear, undefined, ""],
  ])("%o(%j) is %j", (format, value, expected) => {
    expect(format(value)).toBe(expected);
  });
});

describe("calendar dates west of UTC", () => {
  const pinned = process.env.TZ;
  afterEach(() => {
    process.env.TZ = pinned;
    vi.resetModules();
  });

  it("keep their day where a plain date shows the day before", async () => {
    process.env.TZ = "America/Los_Angeles";
    vi.resetModules();
    const western = await import("./format");
    expect(western.formatCalendarDate("2026-10-09")).toBe("9 Oct 2026");
    expect(western.formatDayMonth("2026-10-09")).toBe("9 Oct");
    expect(western.formatDate("2026-10-09")).toBe("8 Oct 2026");
  });
});

describe("formatRelative", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  it.each([
    ["2026-10-09T11:59:30Z", "30 seconds ago"],
    ["2026-10-09T11:58:00Z", "2 minutes ago"],
    ["2026-10-09T09:00:00Z", "3 hours ago"],
    ["2026-10-08T12:00:00Z", "yesterday"],
    ["2026-09-19T12:00:00Z", "20 days ago"],
    ["2026-08-09T12:00:00Z", "2 months ago"],
    ["2025-09-04T12:00:00Z", "last year"],
    ["2023-10-09T12:00:00Z", "3 years ago"],
    ["2026-10-09T12:05:00Z", "in 5 minutes"],
    [null, ""],
  ])("%j is %j", (value, expected) => {
    expect(formatRelative(value, now)).toBe(expected);
  });
});

describe("numbers and sizes", () => {
  it.each([
    [formatNumber, 1234.567, "1,234.57"],
    [formatNumber, 0, "0"],
    [formatNumber, null, ""],
    [formatSu, -1, "Unlimited"],
    [formatSu, 12.345, "12.35"],
    [formatSu, undefined, ""],
    [formatSuRate, 0.5, "0.5 SU/hour"],
    [formatSuRate, 1234, "1,234 SU/hour"],
    [formatSuRate, null, ""],
    [formatMb, 512, "512 MB"],
    [formatMb, 1024, "1 GB"],
    [formatMb, 1536, "1.5 GB"],
    [formatMb, 4096, "4 GB"],
    [formatMb, 2_097_152, "2,048 GB"],
    [formatMb, undefined, ""],
    [formatGb, 30, "30 GB"],
    [formatGb, 1500, "1,500 GB"],
    [formatGb, null, ""],
    [formatBytes, 0, "0 B"],
    [formatBytes, 512, "512 B"],
    [formatBytes, 1536, "1.5 KB"],
    [formatBytes, 5 * 1024 ** 2, "5 MB"],
    [formatBytes, 1.25 * 1024 ** 3, "1.25 GB"],
    [formatBytes, 2048 * 1024 ** 4, "2,048 TB"],
    [formatBytes, null, ""],
  ])("%o(%j) is %j", (format, value, expected) => {
    expect(format(value)).toBe(expected);
  });

  it.each([
    [50000, "ms", "50000 ms"],
    [0, "s", "0 s"],
    ["5", "s", "5 s"],
    [null, "ms", ""],
    [undefined, "ms", ""],
    ["", "s", ""],
  ])("formatWithUnit(%j, %j) is %j", (value, unit, expected) => {
    expect(formatWithUnit(value, unit)).toBe(expected);
  });
});

describe("collator", () => {
  it("orders numbers inside text by value, ignoring case", () => {
    expect(["vm-10", "VM-2", "vm-1"].sort(collator.compare)).toEqual([
      "vm-1",
      "VM-2",
      "vm-10",
    ]);
    expect(collator.compare("Alpha", "alpha")).toBe(0);
  });
});
