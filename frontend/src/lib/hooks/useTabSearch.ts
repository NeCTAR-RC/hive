import { useCallback } from "react";
import type { Key } from "@ardc-ui/react";
import type {
  RegisteredRouter,
  RouteApi,
  RouteIds,
} from "@tanstack/react-router";
import { tabPatch } from "../search";
import { useSearchPatch, type RouteSearch } from "./useSearchPatch";

type RouteId = RouteIds<RegisteredRouter["routeTree"]>;

/** The routes whose search schema carries a tab (`tabParam`). */
export type TabRouteId = {
  [K in RouteId]: "tab" extends keyof RouteSearch<K> ? K : never;
}[RouteId];

/** A route's tab ids, as its schema's `tabParam` declares them. */
export type TabOf<TId extends TabRouteId> = NonNullable<
  RouteSearch<TId>["tab"]
>;

/** A tabbed page's tab state, kept in the URL. */
export interface TabSearch<TId extends TabRouteId> {
  /** The tab on screen: the URL's tab, or the first tab when it has none. */
  tab: TabOf<TId>;
  /** Selects a tab, for the library `Tabs`' `onSelectionChange`. */
  selectTab: (key: Key) => void;
}

/**
 * The tab of a tabbed page, read from and written to `?tab=`, so a reload,
 * a link and the back button land on the same tab. The route's schema
 * validates the value once (`tabParam` in `src/lib/search.ts`), so the
 * page reads a typed tab id; `firstTab` is the one shown without a param,
 * and selecting it clears the param. Other search params are kept.
 */
export function useTabSearch<TId extends TabRouteId>(
  route: RouteApi<TId>,
  firstTab: TabOf<TId>,
): TabSearch<TId> {
  const search = route.useSearch();
  const patch = useSearchPatch(route);
  const tab: TabOf<TId> = search.tab ?? firstTab;
  const select = useCallback(
    // The library Tabs only offer the ids the page renders, which are the
    // ids the route's schema declares; TypeScript cannot see that `tab` is
    // a key of every TabRouteId's search, so the patch is asserted.
    (key: Key) =>
      patch(
        tabPatch(String(key) as TabOf<TId>, firstTab) as Partial<
          RouteSearch<TId>
        >,
      ),
    [patch, firstTab],
  );
  return { tab, selectTab: select };
}
