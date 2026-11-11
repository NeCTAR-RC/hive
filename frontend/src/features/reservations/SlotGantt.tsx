// The flavour availability chart: one row per flavour over the next three
// months, free slots as green bars you press on the day you want to start,
// maintenance windows in orange, today's column marked (warre-dashboard's
// easy-gantt table with the hover block and tooltip of
// nectar_reservations.js:350-441).
import { useEffect, useRef } from "react";
import { FlavorRow } from "./FlavorRow";
import {
  dayLabel,
  eligibleDays,
  monthColumns,
  type GanttRange,
  type GanttRow,
  type PickedSlot,
} from "./gantt";
import styles from "./SlotGantt.module.scss";

/**
 * The availability chart. Every free slot is a React Aria button in the tab
 * order with a library tooltip; pointing at a day inside it previews the
 * days a reservation starting there would take, and pressing it hands that
 * proposal to `onPick`. Maintenance windows are focusable images with their
 * own tooltip. Grid positions are the only inline styles.
 */
export function SlotGantt({
  rows,
  range,
  searchedTo,
  daysLeft,
  canReserve,
  onPick,
}: {
  rows: GanttRow[];
  range: GanttRange;
  /** The last day the slot search covered, which the backend may clamp. */
  searchedTo: string;
  daysLeft: number | null;
  canReserve: boolean;
  onPick: (picked: PickedSlot) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const corner = useRef<HTMLDivElement>(null);
  const todayCell = useRef<HTMLDivElement>(null);
  const months = monthColumns(range.days);
  const columns = `var(--gantt-label) repeat(${range.days.length}, var(--gantt-day))`;
  const track = `repeat(${range.days.length}, var(--gantt-day))`;

  // Open with yesterday at the left edge: the grid starts on the 1st of the
  // month as Horizon's does, but the free slots begin today.
  useEffect(() => {
    const box = scroller.current;
    const today = todayCell.current;
    const label = corner.current;
    if (!box || !today || !label) return;
    box.scrollLeft = Math.max(
      0,
      today.offsetLeft - label.offsetWidth - today.offsetWidth,
    );
  }, [range.todayIndex]);

  return (
    <div className={styles.wrap}>
      <div ref={scroller} className={styles.scroller}>
        <div
          className={styles.grid}
          style={{ gridTemplateColumns: columns }}
          role="group"
          aria-label="Flavour availability by day"
        >
          <div ref={corner} className={styles.corner} aria-hidden="true" />
          {months.map((month) => (
            <div
              key={month.label}
              className={styles.month}
              style={{ gridColumn: `${month.column} / span ${month.count}` }}
              aria-hidden="true"
            >
              {month.label}
            </div>
          ))}
          {range.days.map((day, index) => (
            <div
              key={day}
              ref={index === range.todayIndex ? todayCell : undefined}
              className={styles.day}
              data-today={index === range.todayIndex || undefined}
              style={{ gridColumn: index + 2 }}
              aria-hidden="true"
            >
              {dayLabel(day)}
            </div>
          ))}
          {rows.map((row, rowIndex) => (
            <FlavorRow
              key={row.flavor.id}
              row={row}
              range={range}
              searchedTo={searchedTo}
              track={track}
              isAlternate={rowIndex % 2 === 1}
              eligible={eligibleDays(daysLeft, row.flavor.max_days)}
              canReserve={canReserve}
              onPick={onPick}
            />
          ))}
        </div>
      </div>
      <ul className={styles.legend} aria-label="Legend">
        <li>
          <span className={styles.swatch} data-kind="free" /> Free time slot
        </li>
        <li>
          <span className={styles.swatch} data-kind="maintenance" /> Maintenance
          window
        </li>
        <li>
          <span className={styles.swatch} data-kind="today" /> Today
        </li>
      </ul>
    </div>
  );
}
