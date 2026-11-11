import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import type {
  RegisteredRouter,
  RouteApi,
  RouteById,
  RouteIds,
} from "@tanstack/react-router";
import { mergeSearch } from "../search";

type RouteId = RouteIds<RegisteredRouter["routeTree"]>;

/** The validated search params of a route, as its pages read them. */
export type RouteSearch<TId extends RouteId> = RouteById<
  RegisteredRouter["routeTree"],
  TId
>["types"]["fullSearchSchema"];

/** A function that applies a patch to the route's search params. */
export type SearchPatch<TId extends RouteId> = (
  patch: Partial<RouteSearch<TId>>,
) => void;

/**
 * The one way a page changes its search params (search text, filters, a
 * `?create=true` flag): the patch is merged into the current params, empty
 * values are dropped (see `mergeSearch`), and the history entry is replaced
 * so typing in a search box does not fill the back button.
 *
 * The route types the patch. The update applies to the current location,
 * so the route must be the one on screen; reading its match asserts that
 * (TanStack throws when the route is not matched).
 */
export function useSearchPatch<TId extends RouteId>(
  route: RouteApi<TId>,
): SearchPatch<TId> {
  route.useMatch({ select: () => null });
  const navigate = useNavigate();
  return useCallback(
    (patch) =>
      void navigate({
        to: ".",
        search: (previous) => mergeSearch(previous, patch),
        replace: true,
      }),
    [navigate],
  );
}
