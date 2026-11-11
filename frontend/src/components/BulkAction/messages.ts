// The words of a batch action: its confirmation title, the note naming
// skipped items and the one toast that sums up the batch. Pure, so every
// panel words its batches the same way.
import type { BulkOutcome } from "../../lib/bulk";

/** What the items are called: "key pair", "key pairs". */
export interface Noun {
  one: string;
  many: string;
}

/** How an action is worded in its dialog and its toasts. */
export interface Verb {
  /** The dialog's title and button: "Delete". */
  label: string;
  /** The success toast: "Deleted 3 key pairs." */
  done: string;
  /** The failure toast: "Could not delete 2 of 5 key pairs: ..." */
  failed: string;
}

export const DELETE: Verb = {
  label: "Delete",
  done: "Deleted",
  failed: "delete",
};
export const REMOVE: Verb = {
  label: "Remove",
  done: "Removed",
  failed: "remove",
};
export const DETACH: Verb = {
  label: "Detach",
  done: "Detached",
  failed: "detach",
};
export const RELEASE: Verb = {
  label: "Release",
  done: "Released",
  failed: "release",
};

/** How the items read in a sentence: "key pair web" or "3 key pairs". */
export function describeItems<T>(
  items: readonly T[],
  noun: Noun,
  name: (item: T) => string,
): string {
  const [only] = items;
  if (items.length === 1 && only !== undefined) {
    return `${noun.one} ${name(only)}`;
  }
  return `${items.length} ${noun.many}`;
}

/** The confirmation's default title: "Delete key pair web?". */
export function confirmTitle<T>(
  verb: Verb,
  items: readonly T[],
  noun: Noun,
  name: (item: T) => string,
): string {
  return `${verb.label} ${describeItems(items, noun, name)}?`;
}

/** The message an error carries, if it carries one. */
export function errorReason(error: unknown): string | null {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return null;
}

/** The one toast after a batch, with its tone. */
export interface BulkSummary {
  tone: "success" | "danger";
  text: string;
}

/**
 * Sums up a batch in one sentence: "Deleted 3 key pairs." when every item
 * succeeded, otherwise "Could not delete 2 of 5 key pairs: <reason>" with
 * the first failure's reason, or "Could not delete key pair web: <reason>"
 * for a batch of one.
 */
export function summarise<T>(
  outcome: BulkOutcome<T>,
  verb: Verb,
  noun: Noun,
  name: (item: T) => string,
): BulkSummary {
  const total = outcome.succeeded.length + outcome.failed.length;
  const [first] = outcome.failed;
  if (!first) {
    return {
      tone: "success",
      text: `${verb.done} ${describeItems(outcome.succeeded, noun, name)}.`,
    };
  }
  const what =
    total === 1
      ? `${noun.one} ${name(first.item)}`
      : `${outcome.failed.length} of ${total} ${noun.many}`;
  const reason = errorReason(first.error);
  return {
    tone: "danger",
    text: reason
      ? `Could not ${verb.failed} ${what}: ${reason}`
      : `Could not ${verb.failed} ${what}.`,
  };
}

/** What a batch says about the items it leaves alone. */
export function skippedNote<T>(
  skipped: readonly T[],
  name: (item: T) => string,
  why: string,
): string {
  return `Skipped ${skipped.map(name).join(", ")}: ${why}.`;
}
