import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { meQuery, sessionQuery } from "../lib/queries";
import { AppLayout } from "../shell/AppLayout";
import { AuthLayout } from "../shell/AuthLayout";
import { NotFoundPage } from "../features/NotFoundPage";

/** What every route's `beforeLoad` and loader receive from the router. */
export interface RouterContext {
  queryClient: QueryClient;
}

/**
 * The root of the route tree. A path no route claims (and no Horizon
 * redirect maps, see the catch-all in `routes.tsx`) renders the 404 page.
 */
export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  notFoundComponent: () => <NotFoundPage />,
});

/**
 * The layout for pages shown without a session (login, signed out, terms):
 * no shell. Feature route modules hang their signed-out pages here.
 */
export const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "auth",
  component: AuthLayout,
});

/**
 * The dashboard layout: the full shell, behind a live session. A visitor
 * without one goes to the login page, which brings them back afterwards.
 * Feature route modules hang every dashboard page here.
 */
export const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (!session.authenticated) {
      throw redirect({
        to: "/auth/login",
        search: { next: location.href },
      });
    }
    // Every dashboard page reads the project from /api/me; have it ready.
    await context.queryClient.ensureQueryData(meQuery);
  },
  component: AppLayout,
});
