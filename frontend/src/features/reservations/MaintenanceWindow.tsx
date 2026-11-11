// A maintenance window of the availability chart.
import { Focusable } from "react-aria-components";
import { Tooltip, TooltipTrigger } from "@ardc-ui/react";
import { barColumn, dateSpan, type GanttBar } from "./gantt";
import styles from "./SlotGantt.module.scss";

/**
 * A maintenance window: not actionable, but focusable so its dates and note
 * reach keyboard users through the same tooltip pointer users see.
 */
export function MaintenanceWindow({ bar }: { bar: GanttBar }) {
  const dates = dateSpan(bar.first, bar.last);
  return (
    <TooltipTrigger>
      <Focusable>
        {/* A tooltip trigger must take focus (React Aria's Focusable). */}
        {/* eslint-disable jsx-a11y/no-noninteractive-tabindex */}
        <span
          role="img"
          tabIndex={0}
          aria-label={`Maintenance ${dates}${bar.note ? `: ${bar.note}` : ""}`}
          className={styles.maintenance}
          style={{ gridColumn: barColumn(bar) }}
        />
        {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
      </Focusable>
      <Tooltip>
        {`Maintenance: ${dates}.${bar.note ? ` ${bar.note}` : ""}`}
      </Tooltip>
    </TooltipTrigger>
  );
}
