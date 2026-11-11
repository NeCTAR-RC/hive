import type { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { accountRoutes } from "../features/account/routes";
import { apiAccessRoutes } from "../features/apiaccess/routes";
import { authRoutes } from "../features/auth/routes";
import { computeRoutes } from "../features/compute/routes";
import { databaseRoutes } from "../features/databases/routes";
import { dnsRoutes } from "../features/dns/routes";
import { homeRoutes } from "../features/home/routes";
import { identityRoutes } from "../features/identity/routes";
import { kubernetesRoutes } from "../features/kubernetes/routes";
import { loadBalancerRoutes } from "../features/loadbalancers/routes";
import { networkRoutes } from "../features/network/routes";
import { objectStoreRoutes } from "../features/objectstore/routes";
import { orchestrationRoutes } from "../features/orchestration/routes";
import { reservationRoutes } from "../features/reservations/routes";
import { securityRoutes } from "../features/security/routes";
import { shareRoutes } from "../features/shares/routes";
import { termsRoutes } from "../features/terms/routes";
import { usageRoutes } from "../features/usage/routes";
import { volumeRoutes } from "../features/volumes/routes";
import { CONTENT_SCROLL_SELECTOR } from "../shell/scroll";
import { appLayoutRoute, authLayoutRoute, rootRoute } from "./layouts";
import { RouteError } from "./RouteError";
import { RoutePending } from "./RoutePending";
import { catchAllRoute, switchRoute } from "./routes";

/**
 * The route tree: two layouts, `auth` (no shell) and `app` (the full shell
 * behind a live session), each holding the pages of the feature groups,
 * and the catch-all for every other path, last.
 */
const routeTree = rootRoute.addChildren([
  authLayoutRoute.addChildren([...authRoutes, ...termsRoutes]),
  appLayoutRoute.addChildren([
    ...homeRoutes,
    ...accountRoutes,
    switchRoute,
    ...computeRoutes,
    ...networkRoutes,
    ...volumeRoutes,
    ...apiAccessRoutes,
    ...identityRoutes,
    ...usageRoutes,
    ...securityRoutes,
    ...reservationRoutes,
    ...objectStoreRoutes,
    ...kubernetesRoutes,
    ...loadBalancerRoutes,
    ...orchestrationRoutes,
    ...dnsRoutes,
    ...shareRoutes,
    ...databaseRoutes,
  ]),
  catchAllRoute,
]);

/**
 * The app's router. Pages other than login and home load their code on
 * first visit; while a page is loading it shows `RoutePending`, and when it
 * fails to load or render, `RouteError`. `AppLink` preloads a page when a
 * link to it is hovered or focused (`defaultPreload: "intent"`); data
 * caching is TanStack Query's, so a preload is never considered fresh.
 * Scroll positions are restored per layout column rather than the window,
 * which never scrolls; a new page starts its content column at the top.
 */
export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultErrorComponent: RouteError,
    defaultPendingComponent: RoutePending,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    scrollToTopSelectors: [CONTENT_SCROLL_SELECTOR],
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
