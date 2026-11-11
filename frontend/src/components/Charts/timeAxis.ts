// A time axis for the charts whose points are not one per day (the
// burn-down's guide has only its two ends): x is the day's time, so the
// spacing follows the calendar, and the ticks fall once a month.

const DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** An ISO day ("2026-03-01") as milliseconds at its UTC midnight. */
export function dayTime(date: string): number {
  const match = DAY.exec(date);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** The ISO day of a time on the axis, for the day formatters. */
export function timeDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * One tick per month: the first of every month from `start` to `end`
 * (times from `dayTime`), both included. A period that starts mid-month
 * has its first tick on the next month's first.
 */
export function monthTicks(start: number, end: number): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return [];
  }
  const first = new Date(start);
  let year = first.getUTCFullYear();
  let month = first.getUTCMonth();
  if (first.getUTCDate() !== 1) month += 1;
  const ticks: number[] = [];
  for (;;) {
    const tick = Date.UTC(year, month, 1);
    if (tick > end) return ticks;
    ticks.push(tick);
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
}
