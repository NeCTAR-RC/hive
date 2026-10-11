// A chart with its data table alternative. The chart is an image with a
// spoken summary; "View as table" swaps it for a real table so the figures
// are reachable by keyboard and screen reader, as the plan requires for
// every chart in Hive.
import { useId, useState, type ReactNode } from "react";
import { Button } from "@ardc-ui/react";
import styles from "./ChartFigure.module.scss";

export interface ChartColumn {
  id: string;
  label: string;
  numeric?: boolean;
}

export interface ChartFigureProps {
  /** Visible caption above the chart. */
  title: string;
  /** What a screen reader hears instead of the chart. */
  summary: string;
  columns: ChartColumn[];
  rows: Record<string, ReactNode>[];
  /** Chart height in pixels. */
  height?: number;
  children: ReactNode;
}

export function ChartFigure({
  title,
  summary,
  columns,
  rows,
  height = 260,
  children,
}: ChartFigureProps) {
  const captionId = useId();
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <figure className={styles.figure}>
      <div className={styles.head}>
        <figcaption id={captionId} className={styles.caption}>
          {title}
        </figcaption>
        <Button
          variant="secondary"
          size="sm"
          onPress={() => setView(view === "chart" ? "table" : "chart")}
        >
          {view === "chart" ? "View as table" : "View as chart"}
        </Button>
      </div>
      {view === "chart" ? (
        <div
          className={styles.chart}
          role="img"
          aria-label={summary}
          style={{ height }}
        >
          {children}
        </div>
      ) : (
        // The wrapper scrolls, so keyboard users need a tab stop on it
        // (axe scrollable-region-focusable); a labelled region is the
        // accepted pattern for that.
        /* eslint-disable jsx-a11y/no-noninteractive-tabindex */
        <div
          className={styles.tableWrap}
          style={{ maxHeight: height }}
          role="region"
          aria-label={`${summary} as a table`}
          tabIndex={0}
        >
          <table className={styles.table} aria-describedby={captionId}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.id}
                    scope="col"
                    className={column.numeric ? styles.numeric : undefined}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {columns.map((column, position) =>
                    position === 0 ? (
                      <th key={column.id} scope="row">
                        {row[column.id]}
                      </th>
                    ) : (
                      <td
                        key={column.id}
                        className={column.numeric ? styles.numeric : undefined}
                      >
                        {row[column.id]}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        /* eslint-enable jsx-a11y/no-noninteractive-tabindex */
      )}
    </figure>
  );
}
