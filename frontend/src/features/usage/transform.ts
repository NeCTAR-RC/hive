// Shaping for the Usage Trend page: the date range and its presets, the
// by-service and by-instance bar lists, and the daily guide line
// (nectar_usage.js: presets at trend/index.html:158-163, the guide at
// :124-135 as budget over allocation days).
import type { BarListItem } from "../../components/Charts/BarList";
import type {
  AllocationSummary,
  MostUsed,
  UsageRow,
} from "../../lib/api/types";

export const DAY_MS = 86_400_000;

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysAgo(days: number, today: Date = new Date()): string {
  return isoDate(new Date(today.getTime() - days * DAY_MS));
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
  today: Date = new Date(),
): DateRange {
  const end = search.end && isIso(search.end) ? search.end : isoDate(today);
  let begin =
    search.begin && isIso(search.begin) ? search.begin : daysAgo(365, today);
  if (begin < dataFrom) begin = dataFrom;
  if (begin > end) begin = end;
  return { begin, end };
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
  return TYPE_LABELS[type] ?? type.replace(/_/g, " ") + "s";
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
  if (!budget || budget <= 0 || !current) return undefined;
  const days = Math.round(
    (Date.parse(current.end_date) - Date.parse(current.start_date)) / DAY_MS,
  );
  if (!Number.isFinite(days) || days <= 0) return undefined;
  return { value: Math.round(budget / days), label: "Daily guide" };
}
