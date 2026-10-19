// Stored column choices for DataTable. localStorage is per-browser and
// outlives releases, so whatever is read back is validated: anything but
// the shape below is ignored, ids of columns that no longer exist are
// dropped, and a column added since the choice was saved takes its
// default visibility instead of staying hidden.

/** What DataTable writes: the shown ids and every id the table had then. */
export interface StoredColumns {
  shown: string[];
  known: string[];
}

/** A parsed choice; `legacy` marks the first release's bare array. */
export interface ParsedColumns extends StoredColumns {
  legacy: boolean;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/** The stored value, or null when it is missing or malformed. */
export function parseStoredColumns(raw: unknown): ParsedColumns | null {
  // The first release stored a bare array of shown ids, with no record of
  // which columns existed.
  if (isStringArray(raw)) return { shown: raw, known: raw, legacy: true };
  if (raw && typeof raw === "object") {
    const { shown, known } = raw as Record<string, unknown>;
    if (isStringArray(shown) && isStringArray(known)) {
      return { shown, known, legacy: false };
    }
  }
  return null;
}

/**
 * The visible column ids for a table, or null to use the defaults. A
 * legacy array cannot tell new columns from hidden ones, so it only ever
 * shows what it lists.
 */
export function resolveVisibleColumns(
  stored: ParsedColumns | null,
  columnIds: string[],
  isDefaultVisible: (id: string) => boolean,
): Set<string> | null {
  if (!stored) return null;
  const shown = new Set(stored.shown);
  const known = new Set(stored.known);
  const visible = columnIds.filter((id) =>
    known.has(id) || stored.legacy ? shown.has(id) : isDefaultVisible(id),
  );
  return new Set(visible);
}
