// Reservations are made in whole UTC days (Warre starts them at 00:00 UTC
// and ends them at 23:59 UTC), so a reservation reads as the days the user
// chose, not as local times that can fall on the next day.
import { LOCALE } from "../../lib/format";

const part = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: "UTC" });
const DAY = part({ day: "numeric" });
const DAY_MONTH = part({ day: "numeric", month: "short" });
const FULL = part({ day: "numeric", month: "short", year: "numeric" });

/** The UTC day ("2026-10-20") a reservation time falls on, if it parses. */
export function utcDay(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time)
    ? undefined
    : new Date(time).toISOString().slice(0, 10);
}

/**
 * The reserved UTC days as a short range: "16 to 20 Oct 2026", "28 Oct to
 * 3 Nov 2026", "28 Dec 2026 to 3 Jan 2027", or one day "16 Oct 2026".
 * Empty when either end is missing.
 */
export function formatReservedDays(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const first = utcDay(start);
  const last = utcDay(end);
  if (!first || !last) return "";
  const from = new Date(first);
  const to = new Date(last);
  if (first === last) return FULL.format(from);
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const sameMonth = sameYear && first.slice(5, 7) === last.slice(5, 7);
  const head = sameMonth
    ? DAY.format(from)
    : sameYear
      ? DAY_MONTH.format(from)
      : FULL.format(from);
  return `${head} to ${FULL.format(to)}`;
}

/** The day after a UTC day, for the earliest end an extension can have. */
export function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
