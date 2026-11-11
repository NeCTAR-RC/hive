// The row action engine: a feature describes its actions once, as a typed
// rule table, and every menu (a list row, a detail page) offers them the
// same way. Every action the panel builds is listed; one that cannot run
// on the item now is shown disabled with the reason, never hidden, so the
// menu does not change shape under the user.
import type { RowAction } from "../components/DataTable/RowActionsMenu";

/** An action as a menu offers it for one item. */
export interface ActionOffer<Id extends string> {
  id: Id;
  label: string;
  tone?: "danger";
  /** The menu section it sits in (see `ActionRule.group`). */
  group?: string;
  isDisabled: boolean;
  disabledReason?: string;
}

/**
 * Why an action cannot run on the item now, or a falsy value when it can.
 * Written as `(item) => condition && "Reason"`.
 */
export type ActionCheck<T, C> = (
  item: T,
  context: C,
) => string | false | null | undefined;

/** One action in a rule table. */
export interface ActionRule<Id extends string, T, C = void> {
  id: Id;
  label: string | ((item: T, context: C) => string);
  tone?: "danger";
  /**
   * The menu section the action sits in, named for screen readers ("Power").
   * Neighbouring actions of one group form a section, and a line separates
   * it from the next; a table without groups is one plain list.
   */
  group?: string;
  /**
   * The statuses that allow the action; any other status disables it with
   * "Not available while the status is ...". Omitted: every status.
   */
  statuses?: readonly string[];
  /** Further checks after the status, in order; the first reason wins. */
  checks?: readonly ActionCheck<T, C>[];
  /**
   * Whether the cloud offers the action at all (an extension it runs).
   * Only for that: an action the item's state rules out is disabled.
   */
  offered?: (context: C) => boolean;
}

/** A feature's actions on one kind of item, in menu order. */
export interface ActionTable<Id extends string, T, C = void> {
  rules: readonly ActionRule<Id, T, C>[];
  /** The item's raw status, matched against a rule's `statuses`. */
  statusOf?: (item: T) => string | null;
  /** The status as the Status column shows it, for the reason. */
  statusLabel?: (item: T) => string;
  /**
   * A check that runs before every rule's own, such as "the item is being
   * deleted"; it gets the action's id so it can spare some actions.
   */
  guard?: (item: T, id: Id, context: C) => string | false | null | undefined;
}

/** The first reason one of `checks` gives, or null when all pass. */
function firstReason<T, C>(
  checks: readonly ActionCheck<T, C>[],
  item: T,
  context: C,
): string | null {
  for (const check of checks) {
    const reason = check(item, context);
    if (reason) return reason;
  }
  return null;
}

/** Why the table's statuses rule the action out for this item, if they do. */
function statusReason<Id extends string, T, C>(
  table: ActionTable<Id, T, C>,
  rule: ActionRule<Id, T, C>,
  item: T,
): string | null {
  if (!rule.statuses) return null;
  const status = table.statusOf?.(item) ?? null;
  if (status !== null && rule.statuses.includes(status)) return null;
  const label = table.statusLabel?.(item) ?? status ?? "";
  return label
    ? `Not available while the status is ${label}`
    : "Not available in the current state";
}

/**
 * The actions a menu offers for `item`, in the table's order. An action is
 * disabled by, in turn, the table's guard, the rule's statuses and the
 * rule's checks; the first reason found is the one shown. A table whose
 * rules read a context (the project's quota, say) takes it third.
 */
export function offerActions<Id extends string, T>(
  table: ActionTable<Id, T>,
  item: T,
): ActionOffer<Id>[];
export function offerActions<Id extends string, T, C>(
  table: ActionTable<Id, T, C>,
  item: T,
  context: C,
): ActionOffer<Id>[];
export function offerActions<Id extends string, T, C>(
  table: ActionTable<Id, T, C>,
  item: T,
  maybeContext?: C,
): ActionOffer<Id>[] {
  // Absent only for a table without a context, whose rules never read it.
  const context = maybeContext as C;
  const offers: ActionOffer<Id>[] = [];
  for (const rule of table.rules) {
    if (rule.offered && !rule.offered(context)) continue;
    const reason =
      (table.guard?.(item, rule.id, context) || null) ??
      statusReason(table, rule, item) ??
      firstReason(rule.checks ?? [], item, context);
    const label =
      typeof rule.label === "function" ? rule.label(item, context) : rule.label;
    const offer: ActionOffer<Id> = {
      id: rule.id,
      label,
      isDisabled: reason !== null,
    };
    if (rule.tone) offer.tone = rule.tone;
    if (rule.group) offer.group = rule.group;
    if (reason !== null) offer.disabledReason = reason;
    offers.push(offer);
  }
  return offers;
}

/** Whether `id` is among the offers and can run now. */
export function allows<Id extends string>(
  offers: readonly ActionOffer<Id>[],
  id: Id,
): boolean {
  return offers.some((offer) => offer.id === id && !offer.isDisabled);
}

/** The offers as the row menu's items, each running `run` with its id. */
export function toRowActions<Id extends string>(
  offers: readonly ActionOffer<Id>[],
  run: (id: Id) => void,
): RowAction[] {
  return offers.map((offer) => ({
    id: offer.id,
    label: offer.label,
    tone: offer.tone,
    group: offer.group,
    isDisabled: offer.isDisabled,
    disabledReason: offer.disabledReason,
    onAction: () => run(offer.id),
  }));
}
