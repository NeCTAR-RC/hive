// Shaping for the usage pages. Usage Trend: the date range and its
// presets, the by-service and by-instance bar lists, and the daily guide
// line (nectar_usage.js: presets at trend/index.html:158-163, the guide at
// :124-135 as budget over allocation days). Allocation Usage: the burn-down
// guide's value on a date.
import {
  getLocalTimeZone,
  parseDate,
  today as todayIn,
} from "@internationalized/date";
import type { BarListItem } from "../../components/Charts/BarList";
import type {
  AllocationSummary,
  MostUsed,
  UsageRow,
} from "../../lib/api/types/usage";
import { enumLabel } from "../../lib/status";

export const DAY_MS = 86_400_000;

/**
 * Today as YYYY-MM-DD in the user's time zone. The range is in local days:
 * the UTC date is still yesterday in Australia until 10 or 11 am.
 */
export function localToday(timeZone: string = getLocalTimeZone()): string {
  return todayIn(timeZone).toString();
}

/** The date `days` calendar days before `today` (both YYYY-MM-DD). */
export function daysAgo(days: number, today: string): string {
  return parseDate(today).subtract({ days }).toString();
}

export const PRESETS: { id: string; label: string; days: number }[] = [
  { id: "30d", label: "Past 30 days", days: 30 },
  { id: "3m", label: "3 months", days: 91 },
  { id: "6m", label: "6 months", days: 182 },
  { id: "1y", label: "Past year", days: 365 },
];

export interface DateRange {
  begin: string;
  end: string;
}

/** The range from the URL, else the past year, clamped to the data floor. */
export function resolveRange(
  search: { begin?: string; end?: string },
  dataFrom: string,
  today: string,
): DateRange {
  const end = search.end && isIso(search.end) ? search.end : today;
  let begin =
    search.begin && isIso(search.begin) ? search.begin : daysAgo(365, today);
  if (begin < dataFrom) begin = dataFrom;
  if (begin > end) begin = end;
  return { begin, end };
}

/**
 * The preset the range is, so its button shows pressed: the one whose range
 * ending today (clamped to the data floor as the page clamps it) is the
 * range shown. Dates typed into the picker that match no preset leave none
 * pressed.
 */
export function activePreset(
  range: DateRange,
  dataFrom: string,
  today: string,
): string | undefined {
  return PRESETS.find((preset) => {
    const presetRange = resolveRange(
      { begin: daysAgo(preset.days, today), end: today },
      dataFrom,
      today,
    );
    return presetRange.begin === range.begin && presetRange.end === range.end;
  })?.id;
}

function isIso(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

const TYPE_LABELS: Record<string, string> = {
  instance: "Instances",
  volume: "Volumes",
  load_balancer: "Load balancers",
  image: "Images",
  object_storage: "Object storage",
  network: "Networks",
  floating_ip: "Floating IPs",
  reservation: "Reservations",
  database: "Databases",
  cluster: "Clusters",
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? enumLabel(type) + "s";
}

export function typeItems(rows: UsageRow[] | undefined): BarListItem[] {
  return (rows ?? [])
    .map((row) => ({
      id: String(row["type"] ?? "other"),
      label: typeLabel(String(row["type"] ?? "other")),
      value: Math.round(Number(row.rate ?? 0) * 100) / 100,
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function mostUsedItems(mostUsed: MostUsed | undefined): BarListItem[] {
  if (!mostUsed) return [];
  const items: BarListItem[] = mostUsed.items
    .filter((item) => item.rate > 0)
    .map((item, index) => ({
      id: `${index}-${item.name}`,
      label: item.name,
      value: item.rate,
    }));
  if (mostUsed.other > 0) {
    items.push({
      id: "other",
      label: "Other",
      value: mostUsed.other,
      muted: true,
    });
  }
  return items;
}

/** The dashed daily guide: the budget spread over the allocation's days. */
export function dailyGuide(
  allocation: AllocationSummary | undefined,
): { value: number; label: string } | undefined {
  const budget = allocation?.su_budget;
  const current = allocation?.allocation;
  if (!budget || budget <= 0 || !current?.start_date || !current.end_date) {
    return undefined;
  }
  const days = Math.round(
    (Date.parse(current.end_date) - Date.parse(current.start_date)) / DAY_MS,
  );
  if (!Number.isFinite(days) || days <= 0) return undefined;
  return { value: Math.round(budget / days), label: "Daily guide" };
}

/** The guide's value on a date, interpolated between its two end points. */
export function guideAt(
  date: string,
  guide: { date: string; value: number }[],
): number {
  const [start, end] = guide;
  if (!start || !end) return 0;
  const span = Date.parse(end.date) - Date.parse(start.date);
  if (span <= 0) return end.value;
  const ratio = (Date.parse(date) - Date.parse(start.date)) / span;
  return Math.round(Math.min(Math.max(ratio, 0), 1) * end.value * 100) / 100;
}
