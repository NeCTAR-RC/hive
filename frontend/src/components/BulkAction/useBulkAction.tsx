import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useMutation } from "@tanstack/react-query";
import { settleAll, splitEligible, type BulkOutcome } from "../../lib/bulk";
import { useInvalidate } from "../../lib/hooks/useInvalidate";
import { notify } from "../../lib/notify";
import type { ProjectKeyOf } from "../../lib/queryKeys";
import { ConfirmDialog } from "../ConfirmDialog/ConfirmDialog";
import { recoverFocus } from "./focus";
import {
  confirmTitle,
  skippedNote,
  summarise,
  type Noun,
  type Verb,
} from "./messages";

interface SpecWording<T> {
  verb: Verb;
  /** The confirmation's tone; "danger" unless the action destroys nothing. */
  tone?: "danger" | "primary";
  /** The confirmation's title; "<Verb> <noun> <name>?" by default. */
  title?: (items: T[]) => string;
  /** What the confirmation says about the consequences. */
  body?: ReactNode | ((items: T[]) => ReactNode);
  /**
   * Whether the action may run on an item now. Selected items it may not
   * run on are skipped and named in the confirmation.
   */
  eligible?: (item: T) => boolean;
  /** Why skipped items were skipped; "not available in the current state". */
  skippedWhy?: string;
  /** Runs without asking first, as Horizon's start and resume do. */
  immediate?: boolean;
  /** After a batch in which at least one item succeeded, with those items. */
  onSucceeded?: (items: T[]) => void;
}

/**
 * One action a batch can run: either `request`, sent once per item, or
 * `batch`, one request for the whole batch (a server-side bulk endpoint)
 * that reports the items it could not act on.
 */
export type BulkActionSpec<T> = SpecWording<T> &
  (
    | { request: (item: T) => Promise<unknown>; batch?: never }
    | { batch: (items: T[]) => Promise<BulkOutcome<T>>; request?: never }
  );

export interface BulkActionOptions<T, A extends string> {
  noun: Noun;
  /** The item's name in titles, notes and toasts. */
  name: (item: T) => string;
  /** The item's row id: the table's `getRowId`. */
  getId: (item: T) => string;
  /** What any of the actions changes, marked stale once per batch. */
  invalidates: readonly ProjectKeyOf[];
  actions: Record<A, BulkActionSpec<T>>;
}

/** What the table showing the items takes from the hook (`DataTable`). */
export interface BulkTableProps {
  /** The rows to select again: the ones the last batch could not act on. */
  reselect: readonly string[] | undefined;
  /** The table's region, where focus goes back after a removal. */
  regionRef: RefObject<HTMLDivElement | null>;
}

export interface BulkActions<T, A extends string> {
  /** Starts `action` on `items`: asks first unless the action is immediate. */
  run: (action: A, items: T[]) => void;
  /** The confirmation, while one is open; render it beside the table. */
  dialog: ReactNode;
  isPending: boolean;
  /** Spread onto the `DataTable` that lists the items. */
  tableProps: BulkTableProps;
}

interface Confirming<T, A> {
  action: A;
  items: T[];
  skipped: T[];
}

const DEFAULT_SKIPPED_WHY = "not available in the current state";

/**
 * Runs an action on a batch of items, from a table's selection or one row's
 * menu, and owns everything around it: the eligible items and a note
 * naming the skipped ones, the confirmation, one mutation for the whole
 * batch (so the dialog stays busy until every request and the one refetch
 * have finished), and one toast summing up the outcome. A failed item
 * never stops the others; the items that failed stay selected for another
 * try, and the toast gives the first reason. After the batch, focus that
 * fell to the body (its row was deleted) moves to the table.
 */
export function useBulkAction<T, A extends string>(
  options: BulkActionOptions<T, A>,
): BulkActions<T, A> {
  const { noun, name, getId, invalidates, actions } = options;
  const invalidate = useInvalidate();
  const [confirming, setConfirming] = useState<Confirming<T, A> | null>(null);
  const [reselect, setReselect] = useState<readonly string[]>();
  const [settledBatches, setSettledBatches] = useState(0);
  const regionRef = useRef<HTMLDivElement>(null);

  const mutation = useMutation({
    mutationFn: async ({ action, items }: { action: A; items: T[] }) => {
      const spec = actions[action];
      const outcome = spec.batch
        ? await spec.batch(items).catch((error: unknown) => ({
            succeeded: [],
            failed: items.map((item) => ({ item, error })),
          }))
        : await settleAll(items, spec.request);
      // A failed write may still have reached the cloud, so the batch
      // refetches whatever happened, before the dialog closes.
      await invalidate(...invalidates);
      return outcome;
    },
    onSuccess: (outcome, { action }) => {
      const spec = actions[action];
      const summary = summarise(outcome, spec.verb, noun, name);
      notify[summary.tone](summary.text);
      setConfirming(null);
      if (outcome.failed.length > 0) {
        setReselect(outcome.failed.map(({ item }) => getId(item)));
      }
      if (outcome.succeeded.length > 0) spec.onSucceeded?.(outcome.succeeded);
      setSettledBatches((count) => count + 1);
    },
  });

  // Once the dialog has gone and React Aria has tried to restore focus.
  useEffect(() => {
    if (settledBatches === 0) return;
    const frame = requestAnimationFrame(() => recoverFocus(regionRef.current));
    return () => cancelAnimationFrame(frame);
  }, [settledBatches]);

  const run = (action: A, items: T[]) => {
    const spec = actions[action];
    const { eligible, skipped } = spec.eligible
      ? splitEligible(items, spec.eligible)
      : { eligible: items, skipped: [] };
    const why = spec.skippedWhy ?? DEFAULT_SKIPPED_WHY;
    if (eligible.length === 0) {
      if (skipped.length > 0) notify.info(skippedNote(skipped, name, why));
      return;
    }
    if (spec.immediate) {
      if (skipped.length > 0) notify.info(skippedNote(skipped, name, why));
      mutation.mutate({ action, items: eligible });
      return;
    }
    setConfirming({ action, items: eligible, skipped });
  };

  let dialog: ReactNode = null;
  if (confirming) {
    const { action, items, skipped } = confirming;
    const spec = actions[action];
    const body = typeof spec.body === "function" ? spec.body(items) : spec.body;
    dialog = (
      <ConfirmDialog
        isOpen
        onOpenChange={(open) => !open && setConfirming(null)}
        title={
          spec.title?.(items) ?? confirmTitle(spec.verb, items, noun, name)
        }
        confirmLabel={spec.verb.label}
        tone={spec.tone ?? "danger"}
        isPending={mutation.isPending}
        onConfirm={() => mutation.mutate({ action, items })}
      >
        {body}
        {skipped.length > 0 && (
          <p>
            {skippedNote(skipped, name, spec.skippedWhy ?? DEFAULT_SKIPPED_WHY)}
          </p>
        )}
      </ConfirmDialog>
    );
  }

  return {
    run,
    dialog,
    isPending: mutation.isPending,
    tableProps: { reselect, regionRef },
  };
}
