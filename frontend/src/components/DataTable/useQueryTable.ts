import { useCallback } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  queryTableProps,
  type ListData,
  type QueryTableOptions,
  type QueryTableProps,
} from "./queryTable";

/**
 * The DataTable props for a list backed by a query, so a page spreads them
 * instead of wiring loading, errors, retry, refresh, search and the empty
 * states by hand:
 *
 *   const table = useQueryTable(keyPairs, { noun: "key pairs", search });
 *   <DataTable id="keypairs" label="Key pairs" columns={columns} {...table} />
 *
 * The query may return the rows or the API's `{ items }` envelope. The
 * table filters and searches the rows itself (see `DataTable`).
 */
export function useQueryTable<T>(
  query: UseQueryResult<ListData<T>>,
  options: QueryTableOptions<T>,
): QueryTableProps<T> {
  const { refetch } = query;
  const retry = useCallback(() => void refetch(), [refetch]);
  return queryTableProps(query, options, retry);
}
