import type { ColumnDef } from "./DataTable";

/** Rows whose searchable columns contain every word of the query. */
export function filterRows<T>(
  rows: T[],
  query: string,
  columns: ColumnDef<T>[],
): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return rows;
  const searchable = columns.filter((column) => column.textValue);
  return rows.filter((row) => {
    const haystack = searchable
      .map((column) => column.textValue?.(row) ?? "")
      .join(" ")
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
