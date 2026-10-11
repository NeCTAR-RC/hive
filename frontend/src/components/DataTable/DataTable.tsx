// The dashboard's list table: the design system's Table (which owns the
// selection and sort UI) wrapped with the toolbar, column visibility,
// client-side sorting and paging, batch and row actions, skeleton, empty
// and error states, and a live region that announces what is shown.
import { useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Cell,
  ChevronDown,
  Column,
  Label,
  Menu,
  MenuItem,
  MenuTrigger,
  Pagination,
  Row,
  SearchField,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableHeader,
} from "@ardc-ui/react";
import type { Key, Selection, SortDescriptor } from "@ardc-ui/react";
import { RefreshCw } from "lucide-react";
import { readLocal, writeLocal } from "../../lib/storage";
import { DESKTOP, TABLET, useMediaQuery } from "../../lib/useMediaQuery";
import { EmptyState } from "../EmptyState/EmptyState";
import { ErrorState } from "../ErrorState/ErrorState";
import { Skeleton } from "../Skeleton/Skeleton";
import styles from "./DataTable.module.scss";

export interface ColumnDef<T> {
  id: string;
  label: string;
  cell: (row: T) => ReactNode;
  /** Enables client-side sorting on this column. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** The column that names the row (one per table). */
  isRowHeader?: boolean;
  /** Hidden by default on viewports narrower than this breakpoint. */
  hideBelow?: "md" | "lg";
  defaultHidden?: boolean;
  /** Text the search box matches against; defaults to nothing. */
  textValue?: (row: T) => string | null | undefined;
  className?: string;
}

export interface RowAction {
  id: string;
  label: string;
  onAction: () => void;
  isDisabled?: boolean;
  disabledReason?: string;
  tone?: "danger";
}

export interface BatchAction<T> {
  id: string;
  label: string;
  onAction: (rows: T[]) => void;
  tone?: "danger";
  isDisabled?: (rows: T[]) => boolean;
}

export interface DataTableProps<T> {
  /** Storage key for the page size and column choices. */
  id: string;
  /** Accessible name of the table. */
  label: string;
  columns: ColumnDef<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string;
  rowActions?: (row: T) => RowAction[];
  batchActions?: BatchAction<T>[];
  isLoading?: boolean;
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onRefresh?: () => void;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  /** Extra toolbar controls (filters). */
  filters?: ReactNode;
  /** Primary actions shown at the right of the toolbar. */
  toolbarActions?: ReactNode;
  emptyTitle: string;
  emptyBody?: ReactNode;
  defaultSort?: SortDescriptor;
  pageSizes?: number[];
  /** Changing this value returns the table to its first page. */
  resetKey?: unknown;
}

const DEFAULT_PAGE_SIZES = [10, 20, 50, 100];
const SKELETON_ROWS = 5;
const ACTIONS_COLUMN = "__actions";

function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  if (a === b) return 0;
  if (a === null || a === undefined || a === "") return 1;
  if (b === null || b === undefined || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en-AU", {
    numeric: true,
    sensitivity: "base",
  });
}

export function DataTable<T>({
  id,
  label,
  columns,
  rows,
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
  defaultSort,
  pageSizes = DEFAULT_PAGE_SIZES,
  resetKey,
}: DataTableProps<T>) {
  const tablet = useMediaQuery(TABLET);
  const desktop = useMediaQuery(DESKTOP);

  // Column choices: the stored list wins; otherwise the responsive defaults.
  const [storedColumns, setStoredColumns] = useState<string[] | null>(() =>
    readLocal<string[] | null>(`table.${id}.columns`, null),
  );
  const visibleIds = useMemo(() => {
    if (storedColumns) {
      return new Set(storedColumns);
    }
    return new Set(
      columns
        .filter((column) => {
          if (column.defaultHidden) return false;
          if (column.hideBelow === "md") return tablet;
          if (column.hideBelow === "lg") return desktop;
          return true;
        })
        .map((column) => column.id),
    );
  }, [columns, storedColumns, tablet, desktop]);
  const visible = columns.filter((column) => visibleIds.has(column.id));

  const [sort, setSort] = useState<SortDescriptor | undefined>(defaultSort);
  const [pageSize, setPageSize] = useState(() =>
    readLocal(`table.${id}.pageSize`, pageSizes[1] ?? 20),
  );
  const [rawPage, setRawPage] = useState(1);
  const [selection, setSelection] = useState<Selection>(new Set());

  // Back to page one when the caller's reset key changes (search, filter).
  const [seenReset, setSeenReset] = useState(resetKey);
  if (resetKey !== seenReset) {
    setSeenReset(resetKey);
    setRawPage(1);
  }

  const sorted = useMemo(() => {
    const list = rows ?? [];
    if (!sort) return list;
    const column = columns.find((c) => c.id === sort.column);
    if (!column?.sortValue) return list;
    const accessor = column.sortValue;
    const direction = sort.direction === "descending" ? -1 : 1;
    return [...list].sort(
      (a, b) => compareValues(accessor(a), accessor(b)) * direction,
    );
  }, [rows, sort, columns]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(rawPage, totalPages);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const selectedRows = useMemo(() => {
    const list = rows ?? [];
    if (selection === "all") return list;
    return list.filter((row) => selection.has(getRowId(row)));
  }, [rows, selection, getRowId]);

  const columnsWithActions: ColumnDef<T>[] = rowActions
    ? [
        ...visible,
        {
          id: ACTIONS_COLUMN,
          label: "Actions",
          cell: (row) => <RowActionsMenu actions={rowActions(row)} />,
          className: styles.actionsCell,
        },
      ]
    : visible;

  const onColumnsChange = (keys: Selection) => {
    if (keys === "all") {
      setStoredColumns(null);
      writeLocal(`table.${id}.columns`, null);
      return;
    }
    const chosen = columns
      .map((column) => column.id)
      .filter((columnId) => keys.has(columnId));
    setStoredColumns(chosen);
    writeLocal(`table.${id}.columns`, chosen);
  };

  const onPageSizeChange = (key: Key | null) => {
    const size = Number(key);
    if (!Number.isFinite(size) || size <= 0) return;
    setPageSize(size);
    setRawPage(1);
    writeLocal(`table.${id}.pageSize`, size);
  };

  const status = isLoading
    ? "Loading"
    : error
      ? "Failed to load"
      : total === 0
        ? emptyTitle
        : `Showing ${first} to ${last} of ${total}${isFetching ? ", updating" : ""}`;

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {search && (
            <SearchField
              size="sm"
              aria-label="Search"
              value={search.value}
              onChange={search.onChange}
              placeholder={search.placeholder ?? "Search"}
              className={styles.search}
            />
          )}
          {filters}
        </div>
        <div className={styles.toolbarRight}>
          {toolbarActions}
          <MenuTrigger>
            <Button variant="secondary" size="xs">
              Columns
              <ChevronDown aria-hidden="true" />
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
              <RefreshCw
                aria-hidden="true"
                size={14}
                className={isFetching ? styles.spinning : undefined}
              />
            </Button>
          )}
        </div>
      </div>

      {batchActions && selectedRows.length > 0 && (
        <div className={styles.batchBar} role="region" aria-label="Selection">
          <span className={styles.batchCount}>
            {selectedRows.length} selected
          </span>
          {batchActions.map((action) => (
            <Button
              key={action.id}
              variant="secondary"
              size="xs"
              {...(action.tone ? { tone: action.tone } : {})}
              isDisabled={action.isDisabled?.(selectedRows) ?? false}
              onPress={() => {
                action.onAction(selectedRows);
                setSelection(new Set());
              }}
            >
              {action.label}
            </Button>
          ))}
          <Button
            variant="link"
            size="xs"
            onPress={() => setSelection(new Set())}
          >
            Clear selection
          </Button>
        </div>
      )}

      <div role="status" className="visually-hidden">
        {status}
      </div>

      {error && !isLoading ? (
        <ErrorState
          error={error}
          title="Could not load the list"
          {...(onRetry ? { onRetry } : {})}
        />
      ) : (
        <Table
          aria-label={label}
          className={styles.table}
          {...(batchActions
            ? {
                selectionMode: "multiple" as const,
                selectedKeys: selection,
                onSelectionChange: setSelection,
              }
            : {})}
          {...(sort ? { sortDescriptor: sort } : {})}
          onSortChange={setSort}
        >
          <TableHeader columns={columnsWithActions}>
            {(column) => (
              <Column
                id={column.id}
                isRowHeader={column.isRowHeader ?? false}
                allowsSorting={Boolean(column.sortValue)}
                className={column.className}
              >
                {column.id === ACTIONS_COLUMN ? (
                  <span className="visually-hidden">{column.label}</span>
                ) : (
                  column.label
                )}
              </Column>
            )}
          </TableHeader>
          <TableBody
            items={
              isLoading
                ? []
                : pageRows.map((row) => ({ key: getRowId(row), row }))
            }
            renderEmptyState={() =>
              isLoading ? (
                <SkeletonRows columns={columnsWithActions.length} />
              ) : (
                <EmptyState title={emptyTitle}>{emptyBody}</EmptyState>
              )
            }
          >
            {(item) => (
              <Row id={item.key} columns={columnsWithActions}>
                {(column) => (
                  <Cell className={column.className}>
                    {column.cell(item.row)}
                  </Cell>
                )}
              </Row>
            )}
          </TableBody>
        </Table>
      )}

      {!error && !isLoading && total > 0 && (
        <div className={styles.footer}>
          <p className={styles.count} aria-hidden="true">
            Showing {first} to {last} of {total}
          </p>
          <div className={styles.footerRight}>
            <Select
              aria-label="Rows per page"
              labelPosition="side"
              className={styles.pageSize}
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
            {totalPages > 1 && (
              <Pagination
                aria-label="Pages"
                variant={tablet ? "compact" : "input"}
                totalPages={totalPages}
                currentPage={page}
                onPageChange={setRawPage}
                previousLabel="Previous page"
                nextLabel="Next page"
                inputLabel="Page"
                inputDescription={`of ${totalPages}`}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonRows({ columns }: { columns: number }) {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      {Array.from({ length: SKELETON_ROWS }, (_, rowIndex) => (
        <div key={rowIndex} className={styles.skeletonRow}>
          {Array.from({ length: Math.max(1, columns) }, (_, cellIndex) => (
            <Skeleton key={cellIndex} width={cellIndex === 0 ? "40%" : "70%"} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  if (actions.length === 0) return null;
  const onAction = (key: Key) => {
    actions.find((action) => action.id === key)?.onAction();
  };
  const disabledKeys = actions
    .filter((action) => action.isDisabled)
    .map((action) => action.id);
  return (
    <MenuTrigger>
      <Button variant="secondary" size="xs">
        Actions
        <ChevronDown aria-hidden="true" />
      </Button>
      <Menu
        aria-label="Row actions"
        onAction={onAction}
        disabledKeys={disabledKeys}
        placement="bottom end"
      >
        {actions.map((action) => (
          <MenuItem
            key={action.id}
            id={action.id}
            textValue={action.label}
            className={action.tone === "danger" ? styles.dangerItem : undefined}
          >
            {action.isDisabled && action.disabledReason ? (
              <span>
                {action.label}
                <span className={styles.reason}>{action.disabledReason}</span>
              </span>
            ) : (
              action.label
            )}
          </MenuItem>
        ))}
      </Menu>
    </MenuTrigger>
  );
}
