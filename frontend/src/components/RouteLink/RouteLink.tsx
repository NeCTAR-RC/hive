// An in-app link: the design system's Link (so it looks and focuses like
// every other DS link) with a typed TanStack route target. The href is built
// by the app router, and the DS Link navigates client-side because main.tsx
// mounts react-aria's RouterProvider over the TanStack router, so following
// it keeps the SPA, the query cache and the session alive.
import { Link } from "@ardc-ui/react";
import type { LinkProps } from "@ardc-ui/react";
import {
  useRouter,
  type RegisteredRouter,
  type ToOptions,
} from "@tanstack/react-router";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/**
 * DS `Link` props (variant, size, tone, iconBefore, iconAfter,
 * chevronLeft, chevronRight, aria-*) without `href`, plus the TanStack
 * target: `to` and, where the route needs them, `params`, `search` and
 * `hash`. Use absolute paths in `to`.
 */
export type RouteLinkProps<TTo extends string | undefined = "."> =
  DistributiveOmit<LinkProps, "href"> &
    ToOptions<RegisteredRouter, string, TTo>;

interface NavigationFields {
  to?: string;
  from?: string;
  params?: unknown;
  search?: unknown;
  hash?: unknown;
  state?: unknown;
  mask?: unknown;
  unsafeRelative?: unknown;
  _fromLocation?: unknown;
}

export function RouteLink<const TTo extends string | undefined = ".">(
  props: RouteLinkProps<TTo>,
) {
  const router = useRouter();
  const {
    to,
    from,
    params,
    search,
    hash,
    state,
    mask,
    unsafeRelative,
    _fromLocation,
    ...linkProps
  } = props as unknown as NavigationFields & LinkProps;
  const href = router.buildLocation({
    to,
    from,
    params,
    search,
    hash,
    state,
    mask,
    unsafeRelative,
    _fromLocation,
  } as Parameters<typeof router.buildLocation>[0]).href;
  return <Link variant="link" {...(linkProps as LinkProps)} href={href} />;
}
