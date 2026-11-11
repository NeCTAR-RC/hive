// The pure core of a batch action: run one request per item and report
// every outcome, and split a selection into what an action may run on.
// `useBulkAction` (src/components/BulkAction) is the shell around it.

/** One item a batch could not act on, and why. */
export interface BulkFailure<T> {
  item: T;
  error: unknown;
}

/** What a batch did: the items it acted on and the ones it could not. */
export interface BulkOutcome<T> {
  succeeded: T[];
  failed: BulkFailure<T>[];
}

/**
 * Runs `run` on every item at once and waits for all of them. A rejection
 * never stops the others; it comes back as a value beside its item. Both
 * lists keep the order of `items`, so the first failure is the first
 * failed item the user selected.
 */
export async function settleAll<T>(
  items: readonly T[],
  run: (item: T) => Promise<unknown>,
): Promise<BulkOutcome<T>> {
  // The async wrapper turns a synchronous throw into a rejection too.
  const results = await Promise.allSettled(
    items.map(async (item) => run(item)),
  );
  const outcome: BulkOutcome<T> = { succeeded: [], failed: [] };
  results.forEach((result, index) => {
    const item = items[index] as T;
    if (result.status === "fulfilled") outcome.succeeded.push(item);
    else outcome.failed.push({ item, error: result.reason });
  });
  return outcome;
}

/** A selection split by whether an action may run on each item now. */
export interface Eligibility<T> {
  eligible: T[];
  skipped: T[];
}

/**
 * Splits a selection as Horizon's BatchAction does: the action runs only
 * on the items it is allowed on now, and the others are skipped and named
 * to the user. Both lists keep the selection's order.
 */
export function splitEligible<T>(
  items: readonly T[],
  allowed: (item: T) => boolean,
): Eligibility<T> {
  const split: Eligibility<T> = { eligible: [], skipped: [] };
  for (const item of items) {
    (allowed(item) ? split.eligible : split.skipped).push(item);
  }
  return split;
}
