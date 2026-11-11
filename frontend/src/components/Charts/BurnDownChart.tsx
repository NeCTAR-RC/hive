// The allocation burn-down: cumulative service units against a straight
// guide from zero to the budget, as nectar_usage.js draws with Chart.js on
// a time axis with one tick per month. Loaded lazily through
// LazyBurnDownChart.
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
import { formatMonthYear, formatNumber } from "../../lib/format";
import { ChartTooltip } from "./ChartTooltip";
import {
  axisProps,
  CHART_MARGIN,
  cursorProps,
  GUIDE_DASH,
  GUIDE_STROKE,
  gridProps,
  SERIES_STROKE,
} from "./chartTheme";
import { dayTime, monthTicks, timeDay } from "./timeAxis";

export interface BurnDownChartProps {
  cumulative: { date: string; value: number | null }[];
  guide: { date: string; value: number }[];
  usedLabel: string;
  guideLabel: string;
}

interface BurnDownRow {
  date: string;
  /** The date's time, the x value: days without a point keep their room. */
  time: number;
  used?: number | null;
  guide?: number;
}

/**
 * One row per date with both series, in date order; the guide is
 * interpolated by Recharts between its two end points.
 */
function mergeSeries({
  cumulative,
  guide,
}: Pick<BurnDownChartProps, "cumulative" | "guide">): BurnDownRow[] {
  const byDate = new Map<string, BurnDownRow>();
  for (const point of cumulative) {
    byDate.set(point.date, {
      date: point.date,
      time: dayTime(point.date),
      used: point.value,
    });
  }
  for (const point of guide) {
    byDate.set(point.date, {
      ...byDate.get(point.date),
      date: point.date,
      time: dayTime(point.date),
      guide: point.value,
    });
  }
  // ISO dates sort correctly as plain strings.
  return [...byDate.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

export default function BurnDownChart({
  cumulative,
  guide,
  usedLabel,
  guideLabel,
}: BurnDownChartProps) {
  const axis = axisProps();
  const rows = mergeSeries({ cumulative, guide });
  const start = rows[0]?.time ?? Number.NaN;
  const end = rows.at(-1)?.time ?? Number.NaN;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={CHART_MARGIN} accessibilityLayer={false}>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={[start, end]}
          ticks={monthTicks(start, end)}
          tickFormatter={(time: number) => formatMonthYear(timeDay(time))}
          minTickGap={24}
          {...axis}
        />
        <YAxis
          width={56}
          axisLine={false}
          tickFormatter={(value: number) => formatNumber(value)}
          {...axis}
        />
        <Tooltip content={<ChartTooltip />} cursor={cursorProps} />
        <Legend wrapperStyle={{ fontSize: axis.tick.fontSize }} />
        <Line
          type="monotone"
          dataKey="guide"
          name={guideLabel}
          stroke={GUIDE_STROKE}
          strokeDasharray={GUIDE_DASH}
          strokeWidth={2}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="used"
          name={usedLabel}
          stroke={SERIES_STROKE}
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
