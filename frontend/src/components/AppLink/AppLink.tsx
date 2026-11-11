import {
  useRouter,
  type RegisteredRouter,
  type ToOptions,
} from "@tanstack/react-router";
import { Link, type LinkProps } from "@ardc-ui/react";

/** `Omit` applied to each member of a union, which plain `Omit` collapses. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** The library link's own props (size, variant, tone, icons), minus `href`. */
type LibraryLinkProps = DistributiveOmit<LinkProps, "href">;

/**
 * A route in the app, type-checked against the route tree exactly as
 * TanStack's own `Link` checks `to`, `params`, `search` and `hash`.
 */
type RouteTarget<TTo extends string | undefined> = ToOptions<
  RegisteredRouter,
  string,
  TTo
> & { href?: never; newTab?: never };

/** A URL written out: another site, Horizon, or a path built elsewhere. */
interface HrefTarget {
  href: string;
  to?: never;
  /**
   * Opens the link in a new tab, marked with the library's new-window icon
   * and, for screen readers, "(opens in a new tab)". For links to other
   * sites; Horizon opens in the current tab, as the sidebar's links do.
   */
  newTab?: boolean;
}

export type AppLinkProps<TTo extends string | undefined = undefined> =
  LibraryLinkProps & (RouteTarget<TTo> | HrefTarget);

/**
 * The library `Link`, as shipped, pointed at a route in the app or at a URL.
 *
 * Give it TanStack's `to` (with `params`, `search` and `hash` as needed) and
 * it builds the URL from the route tree; or give it an `href`. Either way it
 * renders the library link with that `href`, and the React Aria
 * `RouterProvider` in `main.tsx` turns a press on a same-site link into a
 * client-side navigation, so the page does not reload. Links to other sites,
 * and links opened in a new tab or window, are left to the browser.
 */
export function AppLink<const TTo extends string | undefined = undefined>(
  props: AppLinkProps<TTo>,
) {
  const router = useRouter();
  if (props.to === undefined) {
    const { newTab, children, ...linkProps } = props as HrefTarget & LinkProps;
    if (!newTab) {
      return <Link {...(linkProps as LinkProps)}>{children}</Link>;
    }
    return (
      <Link
        {...(linkProps as LinkProps)}
        target="_blank"
        iconAfter="arrow-up-right-from-square"
      >
        {children}
        <span className="visually-hidden"> (opens in a new tab)</span>
      </Link>
    );
  }
  const { to, from, params, search, hash, state, mask, ...linkProps } =
    props as RouteTarget<TTo> & LibraryLinkProps;
  // The route options were checked against the route tree at the call site;
  // the router's own signatures cannot see that generic link, hence the
  // cast.
  const target = {
    to,
    from,
    params,
    search,
    hash,
    state,
    mask,
  } as Parameters<typeof router.preloadRoute>[0];
  const { href } = router.buildLocation(target);
  const { onHoverStart, onFocus } = linkProps;
  return (
    <Link
      {...(linkProps as LibraryLinkProps)}
      href={href}
      onHoverStart={(event) => {
        onHoverStart?.(event);
        preloadOnIntent(router, target);
      }}
      onFocus={(event) => {
        onFocus?.(event);
        preloadOnIntent(router, target);
      }}
    />
  );
}

/**
 * Loads a linked page's code (and runs its `beforeLoad`) while the pointer
 * rests on the link or the keyboard focuses it, so the click finds the page
 * ready. It follows the router's `defaultPreload`, as TanStack's own `Link`
 * does; a preload never throws (the router logs and drops its failures).
 */
function preloadOnIntent(
  router: RegisteredRouter,
  target: Parameters<RegisteredRouter["preloadRoute"]>[0],
) {
  if (router.options.defaultPreload === "intent") {
    void router.preloadRoute(target);
  }
}
