/**
 * The list envelopes the backend wraps its collections in, and its plain
 * accepted reply.
 *
 * The backend declares them as generic models (`Items[T]`, `Paginated[T]`),
 * which the OpenAPI document spells out once per row type
 * (`Items_Zone_`, `Paginated_Instance_`). TypeScript cannot index those
 * by row type, so the SPA keeps the one generic shape they all share; the
 * mocks' contract test checks every envelope against its instance.
 */
import type { components } from "../generated/openapi";

/**
 * One page of a marker-paged list; `has_more` says whether a page follows
 * `next_marker`.
 */
export interface Paginated<T> {
  items: T[];
  next_marker: string | null;
  has_more: boolean;
}

/**
 * A complete list. Domain responses extend it with what the list page needs
 * beside the rows (a quota, the parent resource).
 */
export interface Items<T> {
  items: T[];
}

/** A request the upstream accepted and carries out later (a 202). */
export type Accepted = components["schemas"]["Accepted"];
