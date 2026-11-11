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
import { formatDayMonth, formatNumber } from "../../lib/format";
import { ChartTooltip } from "./ChartTooltip";
import {
  axisProps,
  CHART_MARGIN,
  cursorProps,
  GUIDE_DASH,
  GUIDE_STROKE,
  gridProps,
  LABEL_FILL,
  SERIES_STROKE,
} from "./chartTheme";

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

export default function DailyLineChart({
  data,
  valueLabel,
  guide,
}: DailyLineChartProps) {
  const axis = axisProps();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={CHART_MARGIN} accessibilityLayer={false}>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDayMonth}
          minTickGap={32}
          {...axis}
        />
        <YAxis
          width={48}
          axisLine={false}
          tickFormatter={(value: number) => formatNumber(value)}
          {...axis}
        />
        <Tooltip content={<ChartTooltip />} cursor={cursorProps} />
        {guide && (
          <ReferenceLine
            y={guide.value}
            stroke={GUIDE_STROKE}
            strokeDasharray={GUIDE_DASH}
            label={{
              value: guide.label,
              position: "insideTopRight",
              fontSize: axis.tick.fontSize,
              fill: LABEL_FILL,
            }}
          />
        )}
        <Line
          type="monotone"
          dataKey="value"
          name={valueLabel}
          stroke={SERIES_STROKE}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
