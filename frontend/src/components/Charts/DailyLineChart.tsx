// A line of one value per day, as Horizon's overview and usage pages draw
// with Chart.js. Loaded lazily through LazyDailyLineChart so Recharts stays
// out of the initial bundle.
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, formatDayMonth, formatNumber } from "../../lib/format";
import styles from "./DailyLineChart.module.scss";

export interface DailyPoint {
  /** ISO date, "2026-10-09". */
  date: string;
  value: number;
}

export interface DailyLineChartProps {
  data: DailyPoint[];
  valueLabel: string;
  /** A dashed horizontal guide, such as a daily budget. */
  guide?: { value: number; label: string };
}

const TICK = { fontSize: 12, fill: "var(--hive-color-text-muted)" };
const AXIS = "var(--hive-color-rule)";

function PointTooltip({
  active,
  payload,
  label,
  valueLabel,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
  valueLabel: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipDate}>{formatDate(label)}</div>
      <div>
        {valueLabel}: {formatNumber(payload[0]?.value)}
      </div>
    </div>
  );
}

export default function DailyLineChart({
  data,
  valueLabel,
  guide,
}: DailyLineChartProps) {
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
          tickFormatter={formatDayMonth}
          minTickGap={32}
          tick={TICK}
          stroke={AXIS}
          tickLine={false}
        />
        <YAxis
          width={48}
          tick={TICK}
          stroke={AXIS}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => formatNumber(value)}
        />
        <Tooltip
          content={<PointTooltip valueLabel={valueLabel} />}
          cursor={{ stroke: "var(--hive-chart-other)" }}
        />
        {guide && (
          <ReferenceLine
            y={guide.value}
            stroke="var(--hive-chart-other)"
            strokeDasharray="6 4"
            label={{
              value: guide.label,
              position: "insideTopRight",
              fontSize: 12,
              fill: "var(--hive-color-text-muted)",
            }}
          />
        )}
        <Line
          type="monotone"
          dataKey="value"
          name={valueLabel}
          stroke="var(--hive-chart-1)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
