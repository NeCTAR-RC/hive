const LOCALE = "en-AU";

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

/** "9 Oct 2026" for a date-only value such as a usage bucket. */
export function formatCalendarDate(value: string | null | undefined) {
  const date = parseDate(value);
  return date ? calendarDate.format(date) : "";
}

export function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "" : number.format(value);
}

/** "3 minutes ago" style wording for a past timestamp. */
export function formatRelative(
  value: string | number | null | undefined,
  now = Date.now(),
) {
  const date = parseDate(value);
  if (!date) return "";
  const seconds = Math.round((date.getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relative.format(seconds, "second");
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), "hour");
  return relative.format(Math.round(seconds / 86400), "day");
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

/** Megabytes as "512 MB" or "4 GB". */
export function formatMb(mb: number | null | undefined) {
  if (mb === null || mb === undefined) return "";
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024} GB`;
  if (mb >= 1024) return `${number.format(mb / 1024)} GB`;
  return `${mb} MB`;
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
