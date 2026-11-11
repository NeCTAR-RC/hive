import type { ColumnDef } from "./DataTable";

/** Which parts of the viewport's width range the window reaches. */
interface Viewport {
  tablet: boolean;
  desktop: boolean;
}

/**
 * A column choice as the table stores it: the ids shown, and every id the
 * table had when the choice was made, so a column added later can be told
 * apart from one the user hid.
 */
export interface StoredColumns {
  shown: string[];
  known: string[];
}

/**
 * A stored choice read back. `legacy` marks the bare array of shown ids
 * that tables stored before `known` was recorded.
 */
export interface ParsedColumns extends StoredColumns {
  legacy: boolean;
}

/**
 * The columns a table shows before the user chooses: everything except
 * `defaultHidden` columns and those whose `hideBelow` breakpoint the
 * viewport does not reach.
 */
export function defaultVisibleColumnIds<T>(
  columns: readonly ColumnDef<T>[],
  viewport: Viewport,
): Set<string> {
  return new Set(
    columns
      .filter((column) => {
        if (column.defaultHidden) return false;
        if (column.hideBelow === "md") return viewport.tablet;
        if (column.hideBelow === "lg") return viewport.desktop;
        return true;
      })
      .map((column) => column.id),
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/**
 * Reads a stored column choice, or null when there is none or it is not one.
 * Local storage outlives releases and can be edited by hand, so anything
 * but the two shapes tables have written is ignored.
 */
export function parseStoredColumns(raw: unknown): ParsedColumns | null {
  if (isStringArray(raw)) return { shown: raw, known: raw, legacy: true };
  if (raw !== null && typeof raw === "object") {
    const { shown, known } = raw as Record<string, unknown>;
    if (isStringArray(shown) && isStringArray(known)) {
      return { shown, known, legacy: false };
    }
  }
  return null;
}

/**
 * The columns a table shows: the defaults without a stored choice;
 * otherwise the stored choice for the columns it knew, and the default for
 * a column added since. Ids of columns that no longer exist drop out. A
 * legacy choice cannot tell a new column from a hidden one, so it shows
 * only what it lists.
 */
export function visibleColumnIds<T>(
  columns: readonly ColumnDef<T>[],
  viewport: Viewport,
  stored: ParsedColumns | null,
): Set<string> {
  const defaults = defaultVisibleColumnIds(columns, viewport);
  if (!stored) return defaults;
  const shown = new Set(stored.shown);
  const known = new Set(stored.known);
  return new Set(
    columns
      .map((column) => column.id)
      .filter((id) =>
        stored.legacy || known.has(id) ? shown.has(id) : defaults.has(id),
      ),
  );
}

/** The choice to store when the user shows `shown`, in column order. */
export function columnChoice<T>(
  columns: readonly ColumnDef<T>[],
  shown: Pick<ReadonlySet<string>, "has">,
): StoredColumns {
  const known = columns.map((column) => column.id);
  return { shown: known.filter((id) => shown.has(id)), known };
}
