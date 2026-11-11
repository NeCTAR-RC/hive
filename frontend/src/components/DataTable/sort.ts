import { collator } from "../../lib/format";

export type SortValue = string | number | null | undefined;

function isBlank(value: SortValue): value is null | undefined | "" {
  return value === null || value === undefined || value === "";
}

/**
 * Orders two present values ascending: numbers by value, anything else as
 * text through the shared numeric-aware collator.
 */
function compareAscending(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * A sorted copy of `rows` by `accessor`. Blank values (null, undefined or
 * an empty string) go last in both directions, so flipping the order never
 * buries the rows that have a value under the ones that do not. The sort is
 * stable, so equal rows keep the caller's order.
 */
export function sortRows<T>(
  rows: readonly T[],
  accessor: (row: T) => SortValue,
  direction: "ascending" | "descending",
): T[] {
  const sign = direction === "descending" ? -1 : 1;
  return rows
    .map((row) => ({ row, value: accessor(row) }))
    .sort((left, right) => {
      const a = left.value;
      const b = right.value;
      if (isBlank(a)) return isBlank(b) ? 0 : 1;
      if (isBlank(b)) return -1;
      return compareAscending(a, b) * sign;
    })
    .map(({ row }) => row);
}
