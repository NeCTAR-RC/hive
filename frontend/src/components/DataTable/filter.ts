import type { ColumnDef } from "./DataTable";

/** A search query's words, lower-cased; none for a blank query. */
export function queryWords(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** Whether `text` holds every one of `words` (`queryWords`), in any case. */
export function containsWords(text: string, words: readonly string[]): boolean {
  const haystack = text.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** Rows whose searchable columns contain every word of the query. */
export function filterRows<T>(
  rows: T[],
  query: string,
  columns: ColumnDef<T>[],
): T[] {
  const words = queryWords(query);
  if (words.length === 0) return rows;
  const searchable = columns.filter((column) => column.textValue);
  return rows.filter((row) =>
    containsWords(
      searchable.map((column) => column.textValue?.(row) ?? "").join(" "),
      words,
    ),
  );
}
