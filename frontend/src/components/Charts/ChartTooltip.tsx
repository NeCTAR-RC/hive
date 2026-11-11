import { formatCalendarDate, formatNumber } from "../../lib/format";
import styles from "./ChartTooltip.module.scss";

/**
 * The hover card for the daily charts, drawn as the library tooltip: the
 * day, then one line per series with a value. Passed to Recharts' `Tooltip` as `content`, which fills in
 * these props. The day is the hovered row's `date`, a date-only ISO string
 * (the x value may be its time, see `timeAxis.ts`), so it is formatted as a
 * calendar day and never shifts west of UTC.
 */
export function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: {
    name?: string;
    value?: number | null;
    payload?: { date?: string };
  }[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <div>{formatCalendarDate(payload[0]?.payload?.date)}</div>
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
