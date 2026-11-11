import type { UseQueryResult } from "@tanstack/react-query";
import type { DataTableProps } from "./DataTable";
import type { TableView } from "./view";

/** What a list query returns: the rows, or the API's `{ items }` envelope. */
export type ListData<T> = T[] | { items: T[] };

/** The parts of a query result a table reads. */
export type ListQuery<T> = Pick<
  UseQueryResult<ListData<T>>,
  "data" | "isPending" | "isFetching" | "error"
>;

/**
 * A search box's state and the table's view (page, page size, sort), as
 * `useListSearch` keeps them in the URL.
 */
export interface TableSearch {
  text: string;
  setText: (text: string) => void;
  view?: TableView;
  setView?: (patch: TableView) => void;
}

export interface QueryTableOptions<T> {
  /**
   * What the rows are, in the plural ("instances"): the empty states read
   * "No instances yet" and "No instances match".
   */
  noun: string;
  /** The page's search box; without it the table has none. */
  search?: TableSearch;
  /** The search box's placeholder. */
  placeholder?: string;
  /**
   * True when the query sends the search text to the server, which returns
   * only the matches; the table then does not search the rows again.
   */
  remoteSearch?: boolean;
  /** The page's own filters, applied before the search. */
  filter?: (row: T) => boolean;
  /** The page's filter settings: a change returns the table to page one. */
  resetKey?: unknown;
  /** Replaces the "No <noun> yet" title. */
  emptyTitle?: string;
  /** Replaces the "No <noun> match" title. */
  noMatchTitle?: string;
  /**
   * False for data that does not change while the page is open (the
   * service catalogue): the toolbar then has no Refresh button.
   */
  refresh?: boolean;
}

/** The DataTable props a query-backed list derives from its query. */
export type QueryTableProps<T> = Pick<
  DataTableProps<T>,
  | "rows"
  | "filter"
  | "isLoading"
  | "isFetching"
  | "error"
  | "onRetry"
  | "onRefresh"
  | "search"
  | "view"
  | "resetKey"
  | "emptyTitle"
  | "noMatchTitle"
>;

/** The rows in a list query's data, whichever shape the endpoint returns. */
export function listRows<T>(data: ListData<T> | undefined): T[] | undefined {
  if (data === undefined || Array.isArray(data)) return data;
  return data.items;
}

/**
 * The DataTable props for a list backed by a query: rows, loading and
 * error states, retry and refresh (`refetch` runs both), the search box,
 * the view the URL keeps, and the two empty-state titles. Pure, so the
 * hook stays a thin shell.
 */
export function queryTableProps<T>(
  query: ListQuery<T>,
  options: QueryTableOptions<T>,
  refetch: () => void,
): QueryTableProps<T> {
  const { noun, search } = options;
  return {
    rows: listRows(query.data),
    filter: options.filter,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    onRetry: refetch,
    onRefresh: options.refresh === false ? undefined : refetch,
    search: search && {
      value: search.text,
      onChange: search.setText,
      placeholder: options.placeholder,
      remote: options.remoteSearch,
    },
    view:
      search?.view && search.setView
        ? { value: search.view, onChange: search.setView }
        : undefined,
    resetKey: options.resetKey,
    emptyTitle: options.emptyTitle ?? `No ${noun} yet`,
    noMatchTitle: options.noMatchTitle ?? `No ${noun} match`,
  };
}
