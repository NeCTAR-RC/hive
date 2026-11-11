import { useCallback, useState } from "react";
import type { SortDescriptor } from "@ardc-ui/react";
import { readLocal, writeLocal } from "../../lib/storage";
import { sortView, viewPageSize, viewSort, type TableView } from "./view";

/** A view the page keeps (in the URL), and how to change it. */
export interface ControlledView {
  value: TableView;
  onChange: (patch: TableView) => void;
}

/** The table's page, page size and sort, read and set as one. */
export interface TableViewState {
  /** The requested page; the table clamps it to the pages it has. */
  page: number;
  pageSize: number;
  sort: SortDescriptor | undefined;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setSort: (sort: SortDescriptor) => void;
}

/**
 * The table's view: the page's own (`view`, kept in the URL by
 * `useListSearch`) when it passes one, otherwise the table's local state,
 * so a table inside a dialog or a detail tab works the same way. The page
 * size the user picks is also remembered per table (`table.<id>.pageSize`)
 * for the next visit. Every setter returns to the default value with an
 * unset field, so the URL only carries what differs.
 */
export function useTableView({
  id,
  view,
  defaultSort,
  pageSizes,
}: {
  id: string;
  view: ControlledView | undefined;
  defaultSort: SortDescriptor | undefined;
  pageSizes: readonly number[];
}): TableViewState {
  const [local, setLocal] = useState<TableView>({});
  const [remembered, setRemembered] = useState(() =>
    readLocal(`table.${id}.pageSize`, pageSizes[1] ?? 20),
  );
  const value = view ? view.value : local;
  const onChange = view?.onChange;
  const change = useCallback(
    (patch: TableView) => {
      if (onChange) onChange(patch);
      else setLocal((previous) => ({ ...previous, ...patch }));
    },
    [onChange],
  );

  const setPage = useCallback(
    (page: number) => change({ page: page > 1 ? page : undefined }),
    [change],
  );
  const setPageSize = useCallback(
    (size: number) => {
      setRemembered(size);
      writeLocal(`table.${id}.pageSize`, size);
      change({ size, page: undefined });
    },
    [change, id],
  );
  const setSort = useCallback(
    (sort: SortDescriptor) => change(sortView(sort, defaultSort)),
    [change, defaultSort],
  );

  return {
    page: value.page ?? 1,
    pageSize: viewPageSize(value, remembered, pageSizes),
    sort: viewSort(value, defaultSort),
    setPage,
    setPageSize,
    setSort,
  };
}
