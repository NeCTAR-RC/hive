// The flavour availability chart: one row per flavour over the next three
// months, free slots as green bars you click on the day you want to start,
// maintenance windows in orange, today's column marked (warre-dashboard's
// easy-gantt table with the hover block and tooltip of
// nectar_reservations.js:350-441).
import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { ChevronDown } from "@ardc-ui/react";
import type { ReservationFlavor } from "../../lib/api/types";
import { formatCalendarDate, formatNumber } from "../../lib/format";
import {
  dayFromOffset,
  eligibleDays,
  monthSpans,
  selectionFor,
  type GanttBar,
  type GanttRange,
  type GanttRow,
  type Selection,
} from "./gantt";
import { flavorDisk, flavorRate, flavorSize } from "./status";
import styles from "./SlotGantt.module.scss";

export interface PickedSlot {
  flavor: ReservationFlavor;
  bar: GanttBar;
  selection: Selection;
}

interface Hover {
  barId: string;
  day: number;
  x: number;
  y: number;
}

function dayLabel(iso: string) {
  return iso.slice(8, 10);
}

/** "12 Oct 2026 to 31 Oct 2026", or just the day for a one-day span. */
function dateSpan(first: string, last: string) {
  return first === last
    ? formatCalendarDate(first)
    : `${formatCalendarDate(first)} to ${formatCalendarDate(last)}`;
}

/** Month header cells with their first grid column (the label column is 1). */
function monthColumns(days: string[]) {
  let start = 2;
  return monthSpans(days).map((month) => {
    const column = start;
    start += month.count;
    return { ...month, column };
  });
}

export function SlotGantt({
  rows,
  range,
  daysLeft,
  canReserve,
  onPick,
}: {
  rows: GanttRow[];
  range: GanttRange;
  daysLeft: number | null;
  canReserve: boolean;
  onPick: (picked: PickedSlot) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const corner = useRef<HTMLDivElement>(null);
  const todayCell = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
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

  const place = (event: PointerEvent<HTMLElement>, bar: GanttBar) => {
    const target = event.currentTarget.getBoundingClientRect();
    const span = bar.to - bar.from + 1;
    setHover({
      barId: bar.id,
      day: dayFromOffset(event.clientX - target.left, target.width, span),
      x: event.clientX,
      y: event.clientY,
    });
  };

  const pick = (
    event: MouseEvent<HTMLButtonElement>,
    row: GanttRow,
    bar: GanttBar,
  ) => {
    const span = bar.to - bar.from + 1;
    const target = event.currentTarget.getBoundingClientRect();
    // A keyboard activation has no pointer position: start on the first day.
    const day =
      event.detail === 0
        ? 0
        : dayFromOffset(event.clientX - target.left, target.width, span);
    const eligible = eligibleDays(daysLeft, row.flavor.max_days);
    setHover(null);
    onPick({
      flavor: row.flavor,
      bar,
      selection: selectionFor(bar, day, eligible),
    });
  };

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
              className={[
                styles.day,
                index === range.todayIndex ? styles.today : "",
              ]
                .join(" ")
                .trim()}
              style={{ gridColumn: index + 2, gridRow: 2 }}
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
              track={track}
              alt={rowIndex % 2 === 1}
              eligible={eligibleDays(daysLeft, row.flavor.max_days)}
              canReserve={canReserve}
              hover={hover}
              onHover={place}
              onLeave={() => setHover(null)}
              onPick={pick}
            />
          ))}
        </div>
        {hover && (
          <HoverTip
            rows={rows}
            hover={hover}
            daysLeft={daysLeft}
            className={styles.tooltip ?? ""}
          />
        )}
      </div>
      <ul className={styles.legend} aria-label="Legend">
        <li>
          <span className={[styles.swatch, styles.swatchFree].join(" ")} /> Free
          time slot
        </li>
        <li>
          <span
            className={[styles.swatch, styles.swatchMaintenance].join(" ")}
          />{" "}
          Maintenance window
        </li>
        <li>
          <span className={[styles.swatch, styles.swatchToday].join(" ")} />{" "}
          Today
        </li>
      </ul>
    </div>
  );
}

function FlavorRow({
  row,
  range,
  track,
  alt,
  eligible,
  canReserve,
  hover,
  onHover,
  onLeave,
  onPick,
}: {
  row: GanttRow;
  range: GanttRange;
  track: string;
  alt: boolean;
  eligible: number;
  canReserve: boolean;
  hover: Hover | null;
  onHover: (event: PointerEvent<HTMLElement>, bar: GanttBar) => void;
  onLeave: () => void;
  onPick: (
    event: MouseEvent<HTMLButtonElement>,
    row: GanttRow,
    bar: GanttBar,
  ) => void;
}) {
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const { flavor } = row;
  return (
    <div role="group" aria-labelledby={labelId} className={styles.row}>
      <div className={styles.label}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span id={labelId}>{flavor.name ?? flavor.id}</span>
          <ChevronDown aria-hidden="true" className={styles.chevron} />
        </button>
        {open && (
          <dl className={styles.details}>
            <dt>Class</dt>
            <dd>{flavor.category ?? "-"}</dd>
            <dt>Description</dt>
            <dd>{flavor.description || "-"}</dd>
            <dt>Availability zone</dt>
            <dd>{flavor.availability_zone ?? "-"}</dd>
            <dt>Size</dt>
            <dd>{flavorSize(flavor) || "-"}</dd>
            <dt>Disk</dt>
            <dd>{flavorDisk(flavor) || "-"}</dd>
            <dt>Max duration</dt>
            <dd>
              {flavor.max_days} {flavor.max_days === 1 ? "day" : "days"}
            </dd>
            <dt>Usage rate</dt>
            <dd>{flavorRate(flavor)}</dd>
          </dl>
        )}
      </div>
      <div
        className={[styles.track, alt ? styles.trackAlt : ""].join(" ").trim()}
        style={{ gridTemplateColumns: track }}
      >
        {range.todayIndex >= 0 && (
          <span
            className={styles.todayColumn}
            style={{ gridColumn: range.todayIndex + 1 }}
            aria-hidden="true"
          />
        )}
        {row.bars.map((bar) => {
          const span = bar.to - bar.from + 1;
          const column = `${bar.from + 1} / span ${span}`;
          const dates = dateSpan(bar.first, bar.last);
          if (bar.kind === "maintenance") {
            return (
              <span
                key={bar.id}
                role="img"
                aria-label={`Maintenance ${dates}${bar.note ? `: ${bar.note}` : ""}`}
                className={[styles.bar, styles.maintenance].join(" ")}
                style={{ gridColumn: column }}
                onPointerMove={(event) => onHover(event, bar)}
                onPointerLeave={onLeave}
              />
            );
          }
          const active = hover?.barId === bar.id ? hover : null;
          const shadeDays = active
            ? Math.max(Math.min(eligible, span - active.day), 1)
            : 0;
          return (
            <button
              key={bar.id}
              type="button"
              className={[styles.bar, styles.free].join(" ")}
              style={{ gridColumn: column }}
              aria-label={`Reserve ${flavor.name ?? "flavour"}, free ${dates} (${span} ${span === 1 ? "day" : "days"})`}
              disabled={!canReserve || eligible === 0}
              onPointerMove={(event) => onHover(event, bar)}
              onPointerLeave={onLeave}
              onClick={(event) => onPick(event, row, bar)}
            >
              {active && (
                <span
                  className={styles.shade}
                  aria-hidden="true"
                  style={{
                    left: `${(active.day / span) * 100}%`,
                    width: `${(shadeDays / span) * 100}%`,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HoverTip({
  rows,
  hover,
  daysLeft,
  className,
}: {
  rows: GanttRow[];
  hover: Hover;
  daysLeft: number | null;
  className: string;
}) {
  let row: GanttRow | undefined;
  let bar: GanttBar | undefined;
  for (const candidate of rows) {
    bar = candidate.bars.find((b) => b.id === hover.barId);
    if (bar) {
      row = candidate;
      break;
    }
  }
  if (!row || !bar) return null;
  const style = { left: hover.x + 16, top: hover.y + 16 };
  if (bar.kind === "maintenance") {
    return (
      <div className={className} style={style} aria-hidden="true">
        <strong>Maintenance</strong>
        <br />
        {dateSpan(bar.first, bar.last)}
        {bar.note ? (
          <>
            <br />
            {bar.note}
          </>
        ) : null}
      </div>
    );
  }
  const selection = selectionFor(
    bar,
    hover.day,
    eligibleDays(daysLeft, row.flavor.max_days),
  );
  const estimate = row.flavor.rate
    ? Math.round(row.flavor.rate * 24 * selection.days * 100) / 100
    : null;
  return (
    <div className={className} style={style} aria-hidden="true">
      <strong>{row.flavor.name}</strong>
      <br />
      {dateSpan(selection.start, selection.end)}
      <br />
      {selection.days} {selection.days === 1 ? "day" : "days"}
      {estimate !== null ? `, about ${formatNumber(estimate)} SU` : ""}
    </div>
  );
}
