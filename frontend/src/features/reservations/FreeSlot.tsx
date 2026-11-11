// A free slot of the availability chart, pressed to propose a reservation.
import { useMemo, useState } from "react";
import { Button as AriaButton, type PressEvent } from "react-aria-components";
import { Tooltip, TooltipTrigger } from "@ardc-ui/react";
import { formatNumber } from "../../lib/format";
import {
  barColumn,
  dateSpan,
  dayFromOffset,
  plural,
  selectionFor,
  type GanttBar,
  type GanttRow,
  type PickedSlot,
} from "./gantt";
import styles from "./SlotGantt.module.scss";
import { estimateSu } from "./status";

/**
 * A free slot. The day under the pointer (or the first day, from the
 * keyboard) proposes a reservation starting there for as many days as the
 * flavour and the project allow; the shaded block shows those days and
 * anchors the tooltip that names them.
 */
export function FreeSlot({
  row,
  bar,
  eligible,
  isDisabled,
  onPick,
}: {
  row: GanttRow;
  bar: GanttBar;
  eligible: number;
  isDisabled: boolean;
  onPick: (picked: PickedSlot) => void;
}) {
  const { flavor } = row;
  const span = bar.to - bar.from + 1;
  const [day, setDay] = useState(0);
  // The shade remounts for each day (it is keyed by it), so the anchor is
  // held as state: a new element is what makes the tooltip re-measure and
  // follow the pointer.
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const anchorRef = useMemo(() => ({ current: anchor }), [anchor]);
  const selection = selectionFor(bar, day, eligible);
  const shadeDays = Math.max(Math.min(eligible, span - day), 1);
  const estimate = flavor.rate ? estimateSu(flavor.rate, selection.days) : null;

  const pick = (event: PressEvent) => {
    // A keyboard or assistive technology press has no pointer position: it
    // takes the proposal on show (the first day unless a pointer moved it).
    const start =
      event.pointerType === "keyboard" || event.pointerType === "virtual"
        ? day
        : dayFromOffset(
            event.x,
            event.target.getBoundingClientRect().width,
            span,
          );
    onPick({ flavor, bar, selection: selectionFor(bar, start, eligible) });
  };

  return (
    <TooltipTrigger>
      <AriaButton
        className={styles.slot}
        style={{ gridColumn: barColumn(bar) }}
        aria-label={`Reserve ${flavor.name ?? "flavour"}, free ${dateSpan(bar.first, bar.last)} (${plural(span, "day", "days")})`}
        isDisabled={isDisabled}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const next = dayFromOffset(event.clientX - box.left, box.width, span);
          if (next !== day) setDay(next);
        }}
        onPress={pick}
      >
        <span
          key={day}
          ref={setAnchor}
          className={styles.shade}
          aria-hidden="true"
          style={{
            left: `${(day / span) * 100}%`,
            width: `${(shadeDays / span) * 100}%`,
          }}
        />
      </AriaButton>
      <Tooltip triggerRef={anchorRef}>
        {`${flavor.name ?? flavor.id}: ${dateSpan(selection.start, selection.end)}, ${plural(selection.days, "day", "days")}${estimate !== null ? `, about ${formatNumber(estimate)} SU` : ""}.`}
      </Tooltip>
    </TooltipTrigger>
  );
}
