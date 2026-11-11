import type { SortDescriptor } from "@ardc-ui/react";

/**
 * Where a table stands in its rows: the page, the page size and the sort.
 * A list page keeps it in the URL (`listSearch`), so a reload or the back
 * button returns to the same place; an unset field means the table's
 * default (the first page, the remembered page size, the default sort).
 */
export interface TableView {
  page?: number | undefined;
  size?: number | undefined;
  sort?: string | undefined;
  order?: "asc" | "desc" | undefined;
}

/** The sort the view names, or the table's default when it names none. */
export function viewSort(
  view: TableView,
  defaultSort: SortDescriptor | undefined,
): SortDescriptor | undefined {
  if (!view.sort) return defaultSort;
  return {
    column: view.sort,
    direction: view.order === "desc" ? "descending" : "ascending",
  };
}

/**
 * The view fields for a sort the user chose. The table's default sort
 * clears them, so a list sorted the usual way keeps a plain URL.
 */
export function sortView(
  sort: SortDescriptor,
  defaultSort: SortDescriptor | undefined,
): Pick<TableView, "sort" | "order"> {
  if (
    defaultSort &&
    sort.column === defaultSort.column &&
    sort.direction === defaultSort.direction
  ) {
    return { sort: undefined, order: undefined };
  }
  return {
    sort: String(sort.column),
    order: sort.direction === "descending" ? "desc" : "asc",
  };
}

/**
 * The page size to show: the view's, when it is one the table offers,
 * else the one the user last chose for this table.
 */
export function viewPageSize(
  view: TableView,
  remembered: number,
  pageSizes: readonly number[],
): number {
  return view.size !== undefined && pageSizes.includes(view.size)
    ? view.size
    : remembered;
}
