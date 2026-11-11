// The look every Recharts chart shares, in the props Recharts takes. Colours
// are the token bridge's custom properties; Recharts accepts them as SVG
// paint, so the charts follow the theme without a literal of their own.
import { chartTokens } from "../../styles/chart-tokens";

/** Axis lines and the grid. */
const RULE = "var(--hive-color-rule)";
/** Tick and guide labels. */
export const LABEL_FILL = "var(--hive-color-text-muted)";
/** The muted series: guides, budgets and the hover cursor. */
export const GUIDE_STROKE = "var(--hive-chart-other)";
/** The main series. */
export const SERIES_STROKE = "var(--hive-chart-1)";
/** Dashes for a guide line. */
export const GUIDE_DASH = "6 4";

/** Room around the plot so the last tick label is not clipped. */
export const CHART_MARGIN = { top: 8, right: 16, bottom: 0, left: 0 };

/** Horizontal dashed grid lines only. */
export const gridProps = {
  stroke: RULE,
  strokeDasharray: "3 3",
  vertical: false,
} as const;

/** The hover cursor: a vertical line in the guide colour. */
export const cursorProps = { stroke: GUIDE_STROKE } as const;

/**
 * Tick styling for both axes, at the library's small text size. Read at
 * render time because the size comes from the loaded stylesheet.
 */
export function axisProps() {
  const { fontSize } = chartTokens();
  return {
    tick: { fontSize, fill: LABEL_FILL },
    stroke: RULE,
    tickLine: false,
  } as const;
}
