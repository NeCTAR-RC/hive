// Shape CloudKitty's daily summary rows for the overview trend chart, as
// nectar-dashboard's nectar_usage.js does for the Chart.js line
// (groupby=time-1d, x = begin, y = rate).
import type { DailyPoint } from "../../../components/Charts/DailyLineChart";
import type { UsageRow } from "../../../lib/api/types";

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
