// The allocation burn-down: cumulative service units against a straight
// guide from zero to the budget, as nectar_usage.js draws with Chart.js.
// Loaded lazily through LazyBurnDownChart.
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, formatNumber } from "../../lib/format";
import styles from "./DailyLineChart.module.scss";

export interface BurnDownChartProps {
  cumulative: { date: string; value: number | null }[];
  guide: { date: string; value: number }[];
  usedLabel: string;
  guideLabel: string;
}

const TICK = { fontSize: 12, fill: "var(--hive-color-text-muted)" };
const AXIS = "var(--hive-color-rule)";

const monthTick = new Intl.DateTimeFormat("en-AU", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

function BurnTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | null }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipDate}>{formatDate(label)}</div>
      {payload.map((entry) =>
        entry.value === null || entry.value === undefined ? null : (
          <div key={entry.name}>
            {entry.name}: {formatNumber(entry.value)}
          </div>
        ),
      )}
    </div>
  );
}

export default function BurnDownChart({
  cumulative,
  guide,
  usedLabel,
  guideLabel,
}: BurnDownChartProps) {
  // One row per date with both series; the guide is interpolated by
  // Recharts between its two end points.
  const byDate = new Map<
    string,
    { date: string; used?: number | null; guide?: number }
  >();
  for (const point of cumulative) {
    byDate.set(point.date, { date: point.date, used: point.value });
  }
  for (const point of guide) {
    byDate.set(point.date, {
      ...byDate.get(point.date),
      date: point.date,
      guide: point.value,
    });
  }
  const data = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
        accessibilityLayer={false}
      >
        <CartesianGrid stroke={AXIS} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(value: string) => monthTick.format(new Date(value))}
          minTickGap={40}
          tick={TICK}
          stroke={AXIS}
          tickLine={false}
        />
        <YAxis
          width={56}
          tick={TICK}
          stroke={AXIS}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => formatNumber(value)}
        />
        <Tooltip
          content={<BurnTooltip />}
          cursor={{ stroke: "var(--hive-chart-other)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="guide"
          name={guideLabel}
          stroke="var(--hive-chart-other)"
          strokeDasharray="6 4"
          strokeWidth={2}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="used"
          name={usedLabel}
          stroke="var(--hive-chart-1)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
