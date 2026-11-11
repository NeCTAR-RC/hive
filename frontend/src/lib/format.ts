/** The one locale every user-visible format and comparison uses. */
export const LOCALE = "en-AU";

/**
 * Compares display text the way people read it: numbers inside strings by
 * value ("vm-2" before "vm-10"), ignoring case and accents. One instance,
 * because building a collator per comparison is the slow part of a sort.
 */
export const collator = new Intl.Collator(LOCALE, {
  numeric: true,
  sensitivity: "base",
});

const dateTime = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateOnly = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium" });
const number = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

export function parseDate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const date =
    typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: string | number | null | undefined) {
  const date = parseDate(value);
  return date ? dateTime.format(date) : "";
}

export function formatDate(value: string | number | null | undefined) {
  const date = parseDate(value);
  return date ? dateOnly.format(date) : "";
}

const dayMonth = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "9 Oct" for a chart axis; ISO dates are read as UTC calendar days. */
export function formatDayMonth(value: string | number | null | undefined) {
  const date = parseDate(value);
  return date ? dayMonth.format(date) : "";
}

const calendarDate = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: "medium",
  timeZone: "UTC",
});

/**
 * "9 Oct 2026" for a date-only value such as a usage bucket. Read as a UTC
 * calendar day, so "2026-10-09" never shows as the 8th west of UTC.
 */
export function formatCalendarDate(value: string | null | undefined) {
  const date = parseDate(value);
  return date ? calendarDate.format(date) : "";
}

const monthYear = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

/** "Oct 26" for a month axis; ISO dates are read as UTC calendar days. */
export function formatMonthYear(value: string | null | undefined) {
  const date = parseDate(value);
  return date ? monthYear.format(date) : "";
}

export function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "" : number.format(value);
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * "3 minutes ago" style wording for a timestamp, in the largest unit that
 * keeps the number small: "2 months ago" rather than "61 days ago".
 */
export function formatRelative(
  value: string | number | null | undefined,
  now = Date.now(),
) {
  const date = parseDate(value);
  if (!date) return "";
  const seconds = Math.round((date.getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < MINUTE) return relative.format(seconds, "second");
  if (abs < HOUR)
    return relative.format(Math.round(seconds / MINUTE), "minute");
  if (abs < DAY) return relative.format(Math.round(seconds / HOUR), "hour");
  if (abs < MONTH) return relative.format(Math.round(seconds / DAY), "day");
  if (abs < YEAR) return relative.format(Math.round(seconds / MONTH), "month");
  return relative.format(Math.round(seconds / YEAR), "year");
}

/** SU figures use at most two decimals; -1 means unlimited. */
export function formatSu(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  if (value === -1) return "Unlimited";
  return number.format(value);
}

/** "0.5 SU/hour" for a flavour rate. */
export function formatSuRate(rate: number | null | undefined) {
  if (rate === null || rate === undefined) return "";
  return `${number.format(rate)} SU/hour`;
}

/**
 * A value with its unit, as "50000 ms" or "5 s", written as the API sends
 * it; empty when there is no value, so `KeyValueList` shows its dash.
 */
export function formatWithUnit(
  value: number | string | null | undefined,
  unit: string,
) {
  if (value === null || value === undefined || value === "") return "";
  return `${String(value)} ${unit}`;
}

/** Megabytes as "512 MB", "4 GB" or "1.5 GB". */
export function formatMb(mb: number | null | undefined) {
  if (mb === null || mb === undefined) return "";
  if (mb >= 1024) return `${number.format(mb / 1024)} GB`;
  return `${number.format(mb)} MB`;
}

/** Gigabytes as "30 GB". */
export function formatGb(gb: number | null | undefined) {
  if (gb === null || gb === undefined) return "";
  return `${number.format(gb)} GB`;
}

/** Bytes as "1.2 GB" or "512 MB". */
export function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${number.format(value)} ${units[unit]}`;
}
