// Shape CloudKitty's daily summary rows for the overview trend chart, as
// nectar-dashboard's nectar_usage.js does for the Chart.js line
// (groupby=time-1d, x = begin, y = rate), and describe the trend in words.
import type { DailyPoint } from "../../../components/Charts/DailyLineChart";
import type { UsageRow, UsageSummary } from "../../../lib/api/types/usage";
import { formatCalendarDate, formatSu } from "../../../lib/format";

/**
 * One point per summary row with a date: the row's calendar day and its
 * rate rounded to cents (0 when missing), in date order.
 */
export function dailyPoints(rows: UsageRow[] | undefined): DailyPoint[] {
  const points: DailyPoint[] = [];
  for (const row of rows ?? []) {
    if (typeof row.begin !== "string" || row.begin.length < 10) continue;
    const value = Number(row.rate ?? 0);
    points.push({
      date: row.begin.slice(0, 10),
      value: Number.isFinite(value) ? Math.round(value * 100) / 100 : 0,
    });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/** The busiest day, for the spoken chart summary. */
export function peak(points: DailyPoint[]): DailyPoint | null {
  let best: DailyPoint | null = null;
  for (const point of points) {
    if (!best || point.value > best.value) best = point;
  }
  return best;
}

/**
 * The trend chart's spoken summary: the period, the total and, when there
 * is a busiest day, its usage and date.
 */
export function trendSummary(
  summary: Pick<UsageSummary, "begin" | "end" | "sum">,
  busiest: DailyPoint | null,
): string {
  return (
    `Daily service unit usage from ${formatCalendarDate(summary.begin)} to ${formatCalendarDate(summary.end)}: ${formatSu(summary.sum)} in total` +
    (busiest
      ? `, peaking at ${formatSu(busiest.value)} on ${formatCalendarDate(busiest.date)}.`
      : ".")
  );
}
