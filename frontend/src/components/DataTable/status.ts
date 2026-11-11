/**
 * What the table's live region says. It depends only on what is shown, never
 * on background refetches, so a poll or a window refocus does not make a
 * screen reader announce the same rows again.
 */
export function tableStatus({
  isLoading,
  hasError,
  total,
  first,
  last,
  emptyTitle,
}: {
  isLoading: boolean;
  /** True when the load failed and there are no rows to show. */
  hasError: boolean;
  total: number;
  first: number;
  last: number;
  emptyTitle: string;
}): string {
  if (isLoading) return "Loading";
  if (hasError) return "Failed to load";
  if (total === 0) return emptyTitle;
  return `Showing ${first} to ${last} of ${total}`;
}
