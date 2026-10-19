// The day grid behind the availability chart on the create page: the same
// three-month window, bars and hover selection as warre-dashboard's
// easy-gantt adaptation (nectar_reservations.js:142-220, 350-441 and
// easy-gantt.js:8-62). Every date is a UTC calendar day as "YYYY-MM-DD".
import type {
  FreeSlot,
  MaintenanceWindow,
  ReservationFlavor,
} from "../../lib/api/types";
import { slotLastDay } from "./status";

const DAY_MS = 86_400_000;
const MONTHS_AHEAD = 3;

const monthLabel = new Intl.DateTimeFormat("en-AU", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function toUtc(iso: string): number {
  return Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  );
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * DAY_MS);
}

/** Inclusive day count from `start` to `end`, 0 when `end` is earlier. */
export function spanDays(start: string, end: string): number {
  return Math.max(Math.round((toUtc(end) - toUtc(start)) / DAY_MS) + 1, 0);
}

export interface GanttRange {
  /** The first day of today's month. */
  first: string;
  /** The last day of the month three months from today. */
  last: string;
  days: string[];
  today: string;
  todayIndex: number;
}

/** Horizon draws from the 1st of the current month to the end of the month
 * three months ahead (easy-gantt.js:11-18). */
export function ganttRange(today: string, months = MONTHS_AHEAD): GanttRange {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  const firstMs = Date.UTC(year, month, 1);
  // Day 0 of the month after the target month is that month's last day.
  const lastMs = Date.UTC(year, month + months + 1, 0);
  const days: string[] = [];
  for (let ms = firstMs; ms <= lastMs; ms += DAY_MS) days.push(fromUtc(ms));
  return {
    first: fromUtc(firstMs),
    last: fromUtc(lastMs),
    days,
    today,
    todayIndex: days.indexOf(today),
  };
}

export interface MonthSpan {
  label: string;
  count: number;
}

export function monthSpans(days: string[]): MonthSpan[] {
  const spans: MonthSpan[] = [];
  for (const day of days) {
    const label = monthLabel.format(new Date(toUtc(day)));
    const last = spans[spans.length - 1];
    if (last && last.label === label) last.count += 1;
    else spans.push({ label, count: 1 });
  }
  return spans;
}

/** The day under a pointer that is `offset` pixels into a bar `width`
 * pixels wide and `count` days long (nectar_reservations.js:413-417). */
export function dayFromOffset(
  offset: number,
  width: number,
  count: number,
): number {
  if (width <= 0 || count <= 0) return 0;
  const day = Math.floor((offset / width) * count);
  return Math.min(Math.max(day, 0), count - 1);
}

/** The most days one reservation may take: the smaller of the flavour's
 * maximum and the project's days left (nectar_reservations.js:361, 409). */
export function eligibleDays(
  daysLeft: number | null,
  flavorMaxDays: number,
): number {
  const limit =
    daysLeft === null ? flavorMaxDays : Math.min(daysLeft, flavorMaxDays);
  return Math.max(limit, 0);
}

export interface GanttBar {
  kind: "free" | "maintenance";
  id: string;
  /** First and last day the bar covers, clipped to the range. */
  first: string;
  last: string;
  /** Column indexes within the range, inclusive. */
  from: number;
  to: number;
  note: string | null;
  slot: FreeSlot | null;
}

export interface GanttRow {
  flavor: ReservationFlavor;
  bars: GanttBar[];
}

function clip(
  range: GanttRange,
  first: string,
  last: string,
): { first: string; last: string; from: number; to: number } | null {
  if (last < first || last < range.first || first > range.last) return null;
  const start = first < range.first ? range.first : first;
  const end = last > range.last ? range.last : last;
  return {
    first: start,
    last: end,
    from: range.days.indexOf(start),
    to: range.days.indexOf(end),
  };
}

/** One row per flavour with its free slots and the maintenance windows that
 * apply to it (a window with no flavours applies to all), as Horizon
 * chains them on the flavour's row (nectar_reservations.js:146-220). A
 * free slot spans the whole days the backend says it can be reserved for. */
export function buildRows(
  flavors: ReservationFlavor[],
  slots: FreeSlot[],
  windows: MaintenanceWindow[],
  range: GanttRange,
): GanttRow[] {
  const rows: GanttRow[] = [];
  for (const flavor of flavors) {
    if (!flavor.id) continue;
    const bars: GanttBar[] = [];
    slots
      .filter((slot) => slot.flavor_id === flavor.id)
      .forEach((slot, index) => {
        const placed = clip(range, slot.first_day, slot.last_day);
        if (!placed) return;
        bars.push({
          kind: "free",
          id: `free-${flavor.id}-${index}`,
          ...placed,
          note: null,
          slot,
        });
      });
    for (const window of windows) {
      const applies =
        window.flavors.length === 0 ||
        window.flavors.some((f) => f.id === flavor.id);
      if (!applies || !window.start) continue;
      const first = window.start.slice(0, 10);
      const last = slotLastDay(window.end) ?? first;
      const placed = clip(
        range,
        first < range.today ? range.today : first,
        last,
      );
      if (!placed) continue;
      bars.push({
        kind: "maintenance",
        id: `maint-${window.id ?? window.start}-${flavor.id}`,
        ...placed,
        note: window.note,
        slot: null,
      });
    }
    bars.sort((a, b) => a.from - b.from || (a.kind === "free" ? -1 : 1));
    rows.push({ flavor, bars });
  }
  return rows;
}

export interface Selection {
  start: string;
  end: string;
  days: number;
}

/** The dates a click at `dayOffset` into a free bar proposes: from that day
 * for the eligible days, cut at the end of the bar
 * (nectar_reservations.js:417-435). */
export function selectionFor(
  bar: GanttBar,
  dayOffset: number,
  eligible: number,
): Selection {
  const span = bar.to - bar.from + 1;
  const offset = Math.min(Math.max(dayOffset, 0), span - 1);
  const start = addDays(bar.first, offset);
  const remaining = span - offset;
  const days = Math.max(Math.min(eligible, remaining), 1);
  return { start, end: addDays(start, days - 1), days };
}

/** Gap between the pointer and the hover tip, in pixels. */
const TIP_GAP = 16;

/** Where a tip of `size` goes for a pointer at `pointer`: below and right
 * of it, flipped above or left where it would leave the viewport, and
 * never past the top or left edge. */
export function tipPosition(
  pointer: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  let left = pointer.x + TIP_GAP;
  if (left + size.width > viewport.width) {
    left = pointer.x - TIP_GAP - size.width;
  }
  let top = pointer.y + TIP_GAP;
  if (top + size.height > viewport.height) {
    top = pointer.y - TIP_GAP - size.height;
  }
  return { left: Math.max(left, 0), top: Math.max(top, 0) };
}
