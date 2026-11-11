// Search-param schemas shared by the routes. Every field is tolerant: a
// malformed value (a hand-edited URL, an old bookmark) is dropped and the
// page renders without it, instead of the route failing to load.
import { z } from "zod";

/** An optional text param, such as `?q=web`. */
export const optionalText = z.string().optional().catch(undefined);

/** An optional flag param, such as `?create=true`. */
export const optionalFlag = z.boolean().optional().catch(undefined);

/** An optional whole number of at least 1, such as `?page=2`. */
export const optionalCount = z
  .number()
  .int()
  .min(1)
  .optional()
  .catch(undefined);

/**
 * A list page: the text in its search box and the table's view of the
 * rows (page, page size, sort column and order). Every list page keeps
 * them in the URL, so they survive a reload and the back button; its
 * route's schema is this one, or extends it with the page's filters and
 * dialog flags, and the page reads and writes it through `useListSearch`.
 */
export const listSearch = z.object({
  q: optionalText,
  page: optionalCount,
  size: optionalCount,
  sort: optionalText,
  order: z.enum(["asc", "desc"]).optional().catch(undefined),
});

/** A list page with a status filter. */
export const statusListSearch = listSearch.extend({ status: optionalText });

/** A list page whose create dialog a link can open. */
export const createSearch = listSearch.extend({ create: optionalFlag });

/** A list page whose create dialog a link can open from a snapshot. */
export const createFromSearch = createSearch.extend({ snapshot: optionalText });

/**
 * A page's tab, such as `?tab=volumes`: one of the page's tab ids, or unset
 * for its first tab. Any other value is dropped, so a stale bookmark opens
 * the first tab. The ids are declared here, in the route, and nowhere else;
 * the page reads the typed value through `useTabSearch`.
 */
export function tabParam<const T extends readonly [string, ...string[]]>(
  tabs: T,
) {
  return z.enum(tabs).optional().catch(undefined);
}

/** A detail page with tabs and no other search params. */
export function tabSearch<const T extends readonly [string, ...string[]]>(
  tabs: T,
) {
  return z.object({ tab: tabParam(tabs) });
}

/**
 * The search patch that selects a tab: the first tab leaves the URL, so
 * every page opens on it without a param and a link to it stays plain.
 */
export function tabPatch<T extends string>(
  tab: T,
  firstTab: T,
): { tab: T | undefined } {
  return { tab: tab === firstTab ? undefined : tab };
}

/** A value that means "not set": the param is left out of the URL. */
function isEmpty(value: unknown): boolean {
  return (
    value === undefined || value === null || value === "" || value === false
  );
}

/**
 * The search params after a patch: the patch's values replace the current
 * ones, and every empty value (unset, blank text, a cleared flag) is left
 * out, so the URL only ever carries what is in effect.
 */
export function mergeSearch<T extends object>(
  previous: T,
  patch: Partial<T>,
): Partial<T> {
  const next: Partial<T> = { ...previous, ...patch };
  for (const key in next) {
    if (isEmpty(next[key])) delete next[key];
  }
  return next;
}
