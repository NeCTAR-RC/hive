import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { authLayoutRoute } from "../../app/layouts";

const termsRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: "/terms",
  component: lazyRouteComponent(() => import("./pages"), "TermsPage"),
});

/** The terms of use, under the auth layout: readable without a session. */
export const termsRoutes = [termsRoute];
