import { useId, useState, type ReactNode } from "react";
import {
  Button,
  Cell,
  Column,
  Pagination,
  Row,
  Table,
  TableBody,
  TableHeader,
} from "@ardc-ui/react";
import { TABLET, useMediaQuery } from "../../lib/hooks/useMediaQuery";
import styles from "./ChartFigure.module.scss";

/**
 * Rows on one page of the table view: a daily series runs to hundreds of
 * days, and a page keeps the table small to render and to read. The same
 * number a `DataTable` shows by default.
 */
export const TABLE_PAGE_SIZE = 20;

export interface ChartColumn {
  id: string;
  label: string;
  /** Figures in this column are set in tabular digits so they line up. */
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

/**
 * A chart with its data table alternative. The chart is an image with a
 * spoken summary; "View as table" swaps it for the library `Table`, so the
 * figures are reachable by keyboard and screen reader, as every chart in
 * Hive must be. The first column names each row. A long series is paged,
 * `TABLE_PAGE_SIZE` rows at a time, under the library `Pagination`.
 */
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
  const [rawPage, setPage] = useState(1);
  const tablet = useMediaQuery(TABLET);
  const totalPages = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));
  // A shorter series (a new allocation, a narrower range) keeps the page in range.
  const page = Math.min(rawPage, totalPages);
  const firstRow = (page - 1) * TABLE_PAGE_SIZE;
  const pageRows = rows.slice(firstRow, firstRow + TABLE_PAGE_SIZE);
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
        <>
          {/* The wrapper scrolls, so keyboard users need a tab stop on it
              (axe scrollable-region-focusable); a labelled region is the
              accepted pattern for that. */}
          {/* eslint-disable jsx-a11y/no-noninteractive-tabindex */}
          <div
            className={styles.tableWrap}
            style={{ maxHeight: height }}
            role="region"
            aria-label={`${summary} as a table`}
            tabIndex={0}
          >
            <Table aria-labelledby={captionId}>
              <TableHeader>
                {columns.map((column, position) => (
                  <Column
                    key={column.id}
                    id={column.id}
                    isRowHeader={position === 0}
                  >
                    {column.label}
                  </Column>
                ))}
              </TableHeader>
              <TableBody>
                {pageRows.map((row, index) => (
                  <Row key={firstRow + index} id={firstRow + index}>
                    {columns.map((column) => (
                      <Cell key={column.id}>
                        {column.numeric ? (
                          <span className={styles.numeric}>
                            {row[column.id]}
                          </span>
                        ) : (
                          row[column.id]
                        )}
                      </Cell>
                    ))}
                  </Row>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
          {totalPages > 1 && (
            <div className={styles.pager}>
              <Pagination
                aria-label={`${title} pages`}
                variant={tablet ? "compact" : "input"}
                totalPages={totalPages}
                currentPage={page}
                onPageChange={setPage}
                previousLabel="Previous page"
                nextLabel="Next page"
                inputLabel="Page"
                inputDescription={`of ${totalPages}`}
              />
            </div>
          )}
        </>
      )}
    </figure>
  );
}
