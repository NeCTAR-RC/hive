import type { Selection } from "@ardc-ui/react";

/**
 * The rows a batch action acts on. The table's header checkbox selects
 * "all", which in the table means every row it shows, so it resolves to the
 * current page and never to rows on other pages the user has not seen.
 * Explicit keys resolve against the page too, which drops keys of rows a
 * refetch removed.
 */
export function resolveSelection<T>(
  selection: Selection,
  pageRows: readonly T[],
  getRowId: (row: T) => string,
): T[] {
  if (selection === "all") return [...pageRows];
  return pageRows.filter((row) => selection.has(getRowId(row)));
}
