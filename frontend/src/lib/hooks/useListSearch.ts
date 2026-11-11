import { useCallback, useMemo } from "react";
import type {
  RegisteredRouter,
  RouteApi,
  RouteIds,
} from "@tanstack/react-router";
import type { TableView } from "../../components/DataTable/view";
import {
  useSearchPatch,
  type RouteSearch,
  type SearchPatch,
} from "./useSearchPatch";

type RouteId = RouteIds<RegisteredRouter["routeTree"]>;

/** The params `listSearch` declares: the search text and the table's view. */
type ListParam = "q" | keyof TableView;

/** The routes whose search schema carries every `listSearch` param. */
export type ListRouteId = {
  [K in RouteId]: ListParam extends keyof RouteSearch<K> ? K : never;
}[RouteId];

/** A list page's search state, all of it in the URL. */
export interface ListSearch<TId extends ListRouteId> {
  /** The route's search params: the search text and the page's filters. */
  params: RouteSearch<TId>;
  /** Merges a patch into them (a filter, a dialog flag). */
  patch: SearchPatch<TId>;
  /** The search box's text, `?q=` in the URL. */
  text: string;
  /** Sets the search text; blank text leaves the URL. */
  setText: (text: string) => void;
  /** The table's page, page size and sort (`?page=2&sort=name`). */
  view: TableView;
  /** Merges a change of page, page size or sort into the URL. */
  setView: (patch: TableView) => void;
}

/**
 * The search box, the table's view and the filters of a list page, read
 * from and written to the URL, so a search and the page of results survive
 * a reload and the back button on every list. The route's schema must
 * extend `listSearch` (the type enforces it), or the router would drop the
 * params on the next navigation.
 */
export function useListSearch<TId extends ListRouteId>(
  route: RouteApi<TId>,
): ListSearch<TId> {
  const params = route.useSearch();
  const patch = useSearchPatch(route);
  const text = params.q ?? "";
  const setText = useCallback((q: string) => patch({ q }), [patch]);
  const { page, size, sort, order } = params;
  const view = useMemo(
    () => ({ page, size, sort, order }),
    [page, size, sort, order],
  );
  // `ListRouteId` guarantees the route declares these params; TypeScript
  // cannot see that through the generic route id.
  const setView = useCallback(
    (next: TableView) => patch(next as Partial<RouteSearch<TId>>),
    [patch],
  );
  return { params, patch, text, setText, view, setView };
}
