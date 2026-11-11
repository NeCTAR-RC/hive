import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import {
  Button,
  Cell,
  Column,
  Label,
  Loading,
  Menu,
  MenuItem,
  MenuTrigger,
  Pagination,
  Rotate,
  Row,
  SearchField,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableHeader,
} from "@ardc-ui/react";
import type { Key, Selection, SortDescriptor } from "@ardc-ui/react";
import { readLocal, writeLocal } from "../../lib/storage";
import { DESKTOP, TABLET, useMediaQuery } from "../../lib/hooks/useMediaQuery";
import { recoverFocus } from "../BulkAction/focus";
import { ErrorState } from "../ErrorState/ErrorState";
import { ActionsMenu } from "./ActionsMenu";
import { batchMenuActions, batchTriggerLabel } from "./batchMenu";
import { columnChoice, parseStoredColumns, visibleColumnIds } from "./columns";
import styles from "./DataTable.module.scss";
import { filterRows } from "./filter";
import { RowActionsMenu, type RowAction } from "./RowActionsMenu";
import { resolveSelection } from "./selection";
import { sortRows, type SortValue } from "./sort";
import { tableStatus } from "./status";
import { useTableView, type ControlledView } from "./useTableView";

export interface ColumnDef<T> {
  id: string;
  label: string;
  cell: (row: T) => ReactNode;
  /** Enables client-side sorting on this column; blank values sort last. */
  sortValue?: (row: T) => SortValue;
  /** The column that names the row (one per table). */
  isRowHeader?: boolean;
  /** Hidden by default on viewports narrower than this breakpoint. */
  hideBelow?: "md" | "lg";
  defaultHidden?: boolean;
  /** Text the search box matches against; defaults to nothing. */
  textValue?: (row: T) => string | null | undefined;
}

/**
 * An action on the selected rows, listed in the toolbar's "With selected"
 * menu (`batchMenuActions`).
 */
export interface BatchAction<T> {
  id: string;
  label: string;
  onAction: (rows: T[]) => void;
  /**
   * Marks a destructive action; the menu draws it as any other (gap "Danger
   * row in a menu"), and its confirmation carries the danger tone.
   */
  tone?: "danger";
  /** True when the selection rules the action out; it is listed disabled. */
  isDisabled?: (rows: T[]) => boolean;
}

export interface DataTableProps<T> {
  /** Storage key for the page size and column choices. */
  id: string;
  /** Accessible name of the table. */
  label: string;
  columns: ColumnDef<T>[];
  /** Every row the table can show, before the filters and the search. */
  rows: T[] | undefined;
  /** The page's own filters (a status or scope select), applied first. */
  filter?: (row: T) => boolean;
  getRowId: (row: T) => string;
  rowActions?: (row: T) => RowAction[];
  batchActions?: BatchAction<T>[];
  isLoading?: boolean;
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onRefresh?: () => void;
  /**
   * The search box. The table matches its words against each column's
   * `textValue` and returns to its first page when the text changes.
   */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    /** The query searched already (on the server): show its rows as given. */
    remote?: boolean;
  };
  /**
   * Filter fields for the toolbar, such as a side-labelled `Select`. Each
   * one is a cell of the toolbar's filter grid, which sets its width.
   */
  filters?: ReactNode;
  /** Primary actions shown at the right of the toolbar. */
  toolbarActions?: ReactNode;
  /** Shown when there are no rows at all. */
  emptyTitle: string;
  /** Shown under `emptyTitle` only, never under `noMatchTitle`. */
  emptyBody?: ReactNode;
  /**
   * Shown when there are rows but the filters and the search leave none;
   * `emptyTitle` when not given.
   */
  noMatchTitle?: string;
  defaultSort?: SortDescriptor;
  pageSizes?: number[];
  /**
   * The page, page size and sort, when the page keeps them (in the URL,
   * through `useListSearch`, which `useQueryTable` passes on); without it
   * the table keeps them itself.
   */
  view?: ControlledView;
  /**
   * Changing this value returns the table to its first page, as a change of
   * the search text does: pass the page's filter settings.
   */
  resetKey?: unknown;
  /**
   * Row ids to select again, such as the rows a batch could not act on;
   * each new array replaces the selection. `useBulkAction` passes it.
   */
  reselect?: readonly string[] | undefined;
  /** The table's region, where `useBulkAction` returns focus after a delete. */
  regionRef?: Ref<HTMLDivElement>;
}

const DEFAULT_PAGE_SIZES = [10, 20, 50, 100];
const ACTIONS_COLUMN = "__actions";
const NO_SELECTION: Selection = new Set();

/**
 * The dashboard's list table: the library `Table` (which owns the selection
 * and sort UI) with a toolbar (search, filters, column choice, refresh),
 * client-side filtering, searching, sorting and paging, batch and row
 * actions, loading, empty and error states, and a live region that
 * announces what is shown. A list backed by a query gets its loading,
 * error, refresh, search and empty-state props from `useQueryTable`. Every
 * library control inside it is used as shipped; the table's own layout sets
 * the widths. Loading and empty states speak from the library table's own
 * empty cell; the centred `Pagination` sits under the table with the row
 * count and the page size either side of it.
 *
 * The page, page size and sort live in the URL on a list page (`view`), so
 * the back button returns to the same page of the same sort. A search that
 * leaves no rows offers "Clear search" in the empty state.
 *
 * Batch actions sit in a "With selected" menu in the toolbar, before the
 * column chooser, there whether or not rows are selected (disabled while
 * none are), so nothing moves when a row is ticked; Horizon keeps its batch
 * buttons in the table toolbar the same way. Selection belongs to the page
 * on screen: it clears whenever the page, sort, page size or `resetKey`
 * changes, so a batch action only ever acts on rows the user can see; a
 * batch action clears it, and `reselect` brings back the rows the batch
 * could not act on. A failed background refetch keeps the cached rows and
 * says so above them; only a failure with nothing to show replaces the
 * table. Pass a stable `getRowId` (a module-level function or a
 * `useCallback`) so the row items are not rebuilt on every render.
 */
export function DataTable<T>({
  id,
  label,
  columns,
  rows,
  filter,
  getRowId,
  rowActions,
  batchActions,
  isLoading = false,
  isFetching = false,
  error,
  onRetry,
  onRefresh,
  search,
  filters,
  toolbarActions,
  emptyTitle,
  emptyBody,
  noMatchTitle,
  defaultSort,
  pageSizes = DEFAULT_PAGE_SIZES,
  view,
  resetKey,
  reselect,
  regionRef,
}: DataTableProps<T>) {
  const tablet = useMediaQuery(TABLET);
  const desktop = useMediaQuery(DESKTOP);

  // Column choices: the stored choice, validated, over the responsive
  // defaults (see visibleColumnIds).
  const columnsKey = `table.${id}.columns`;
  const [storedColumns, setStoredColumns] = useState(() =>
    parseStoredColumns(readLocal<unknown>(columnsKey, null)),
  );
  const visibleIds = useMemo(
    () => visibleColumnIds(columns, { tablet, desktop }, storedColumns),
    [columns, storedColumns, tablet, desktop],
  );

  const {
    page: rawPage,
    pageSize,
    sort,
    setPage,
    setPageSize,
    setSort,
  } = useTableView({ id, view, defaultSort, pageSizes });
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const searchRef = useRef<HTMLDivElement>(null);
  // State rather than a ref: the batch menu's items close over it.
  const [mainElement, setMainElement] = useState<HTMLDivElement | null>(null);

  // A change of the search text or of the caller's reset key (the page's
  // filters) clears the selection at once and returns to page one. The
  // page may live in the URL, which is changed after the render, never
  // during it.
  const searchText = search?.value ?? "";
  const [seenReset, setSeenReset] = useState({ resetKey, searchText });
  if (resetKey !== seenReset.resetKey || searchText !== seenReset.searchText) {
    setSeenReset({ resetKey, searchText });
    setSelection(NO_SELECTION);
  }
  const pageReset = useRef({ resetKey, searchText });
  useEffect(() => {
    const seen = pageReset.current;
    if (seen.resetKey === resetKey && seen.searchText === searchText) return;
    pageReset.current = { resetKey, searchText };
    if (rawPage !== 1) setPage(1);
  }, [resetKey, searchText, rawPage, setPage]);
  const [seenReselect, setSeenReselect] = useState(reselect);
  if (reselect !== seenReselect) {
    setSeenReselect(reselect);
    if (reselect) setSelection(new Set(reselect));
  }

  const rowCount = rows?.length ?? 0;
  const sorted = useMemo(() => {
    const all = rows ?? [];
    const filtered = filter ? all.filter(filter) : all;
    const kept = search?.remote
      ? filtered
      : filterRows(filtered, searchText, columns);
    const accessor = columns.find((c) => c.id === sort?.column)?.sortValue;
    if (!sort || !accessor) return kept;
    return sortRows(kept, accessor, sort.direction);
  }, [rows, filter, search?.remote, searchText, sort, columns]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(rawPage, totalPages);
  const pageRows = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize],
  );
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  // At most one page of rows, so this stays cheap without a memo.
  const selectedRows = resolveSelection(selection, pageRows, getRowId);

  const columnsWithActions = useMemo<ColumnDef<T>[]>(() => {
    const visible = columns.filter((column) => visibleIds.has(column.id));
    if (!rowActions) return visible;
    return [
      ...visible,
      {
        id: ACTIONS_COLUMN,
        label: "Actions",
        cell: (row) => <RowActionsMenu actions={rowActions(row)} />,
      },
    ];
  }, [columns, visibleIds, rowActions]);

  const items = useMemo(
    () => pageRows.map((row) => ({ key: getRowId(row), row })),
    [pageRows, getRowId],
  );

  // Errors weigh what was loaded, not what the filters leave on screen.
  const blockingError = Boolean(error) && !isLoading && rowCount === 0;
  const staleError = Boolean(error) && !isLoading && rowCount > 0;
  const isEmpty = rowCount === 0;
  const emptyText = isEmpty ? emptyTitle : (noMatchTitle ?? emptyTitle);

  const onColumnsChange = (keys: Selection) => {
    if (keys === "all") {
      setStoredColumns(null);
      writeLocal(columnsKey, null);
      return;
    }
    const choice = columnChoice(columns, keys);
    setStoredColumns({ ...choice, legacy: false });
    writeLocal(columnsKey, choice);
  };

  // The "With selected" menu returns focus to its trigger, which the
  // cleared selection has just disabled, so focus would fall to the body;
  // once the menu has gone it moves to the table instead.
  const clearSelection = () => {
    setSelection(NO_SELECTION);
    requestAnimationFrame(() => recoverFocus(mainElement));
  };

  const onSortChange = (descriptor: SortDescriptor) => {
    setSort(descriptor);
    setSelection(NO_SELECTION);
  };

  const onPageChange = (next: number) => {
    setPage(next);
    setSelection(NO_SELECTION);
  };

  const onPageSizeChange = (key: Key | null) => {
    const size = Number(key);
    if (!Number.isFinite(size) || size <= 0) return;
    setPageSize(size);
    setSelection(NO_SELECTION);
  };

  // The button that offered it disappears with the search, so focus moves
  // to the search box the user would type a new search into.
  const clearSearch = () => {
    search?.onChange("");
    searchRef.current?.querySelector("input")?.focus();
  };

  const status = tableStatus({
    isLoading,
    hasError: blockingError,
    total,
    first,
    last,
    emptyTitle: emptyText,
  });

  return (
    <div className={styles.wrapper} ref={regionRef}>
      <div className={styles.main} ref={setMainElement}>
        <div className={styles.toolbar}>
          {(search || filters) && (
            <div className={styles.fields}>
              {search && (
                <div className={styles.search} ref={searchRef}>
                  <SearchField
                    size="sm"
                    aria-label="Search"
                    value={search.value}
                    onChange={search.onChange}
                    placeholder={search.placeholder ?? "Search"}
                  />
                </div>
              )}
              {filters && <div className={styles.filters}>{filters}</div>}
            </div>
          )}
          <div className={styles.actions}>
            {toolbarActions}
            {batchActions && (
              <ActionsMenu
                label="With selected"
                triggerLabel={batchTriggerLabel(selectedRows.length)}
                menuLabel="Selected rows"
                isDisabled={selectedRows.length === 0}
                actions={batchMenuActions(
                  batchActions,
                  selectedRows,
                  clearSelection,
                )}
              />
            )}
            <MenuTrigger>
              <Button variant="secondary" size="xs">
                Columns
              </Button>
              <Menu
                aria-label="Columns"
                selectionMode="multiple"
                selectedKeys={visibleIds}
                onSelectionChange={onColumnsChange}
                placement="bottom end"
              >
                {columns.map((column) => (
                  <MenuItem key={column.id} id={column.id}>
                    {column.label}
                  </MenuItem>
                ))}
              </Menu>
            </MenuTrigger>
            {onRefresh && (
              <Button
                variant="secondary"
                size="xs"
                onPress={onRefresh}
                isDisabled={isFetching}
                aria-label="Refresh"
              >
                <Rotate
                  aria-hidden="true"
                  className={styles.refreshIcon}
                  data-spinning={isFetching || undefined}
                />
              </Button>
            )}
          </div>
        </div>

        <div role="status" className="visually-hidden">
          {status}
        </div>

        {staleError && (
          <ErrorState
            error={error}
            tone="warning"
            title="Could not refresh the list; showing the last rows loaded"
            onRetry={onRetry}
          />
        )}

        {blockingError ? (
          <ErrorState
            error={error}
            title="Could not load the list"
            onRetry={onRetry}
          />
        ) : (
          <Table
            aria-label={label}
            selectionMode={batchActions ? "multiple" : "none"}
            selectedKeys={selection}
            onSelectionChange={setSelection}
            sortDescriptor={sort}
            onSortChange={onSortChange}
          >
            <TableHeader columns={columnsWithActions}>
              {(column) => (
                <Column
                  id={column.id}
                  isRowHeader={column.isRowHeader}
                  allowsSorting={Boolean(column.sortValue)}
                >
                  {column.id === ACTIONS_COLUMN ? (
                    <span className={styles.hiddenLabel}>
                      <span className="visually-hidden">{column.label}</span>
                    </span>
                  ) : (
                    column.label
                  )}
                </Column>
              )}
            </TableHeader>
            <TableBody
              items={isLoading ? [] : items}
              // The rows render one cell per visible column; the collection
              // caches rows by item, so it must know to rebuild them when the
              // column set changes (a viewport crossing a breakpoint, the
              // columns menu), or React Aria rejects the stale cell count.
              dependencies={[columnsWithActions]}
              renderEmptyState={() =>
                isLoading ? (
                  // The live region above already says "Loading".
                  <Loading aria-hidden="true">Loading items...</Loading>
                ) : (
                  <>
                    <p>{emptyText}</p>
                    {isEmpty && emptyBody}
                    {!isEmpty && searchText && (
                      <Button
                        variant="secondary"
                        size="xs"
                        onPress={clearSearch}
                      >
                        Clear search
                      </Button>
                    )}
                  </>
                )
              }
            >
              {(item) => (
                <Row id={item.key} columns={columnsWithActions}>
                  {(column) => <Cell>{column.cell(item.row)}</Cell>}
                </Row>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {!isLoading && total > 0 && (
        <div className={styles.footer}>
          <p className={styles.count} aria-hidden="true">
            Showing {first} to {last} of {total}
          </p>
          {totalPages > 1 && (
            <div className={styles.pager}>
              <Pagination
                aria-label="Pages"
                variant={tablet ? "compact" : "input"}
                totalPages={totalPages}
                currentPage={page}
                onPageChange={onPageChange}
                previousLabel="Previous page"
                nextLabel="Next page"
                inputLabel="Page"
                inputDescription={`of ${totalPages}`}
              />
            </div>
          )}
          <div className={styles.pageSize}>
            <Select
              aria-label="Rows per page"
              labelPosition="side"
              selectedKey={String(pageSize)}
              onSelectionChange={onPageSizeChange}
            >
              <Label>Per page</Label>
              {pageSizes.map((size) => (
                <SelectItem key={size} id={String(size)}>
                  {String(size)}
                </SelectItem>
              ))}
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
