import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { appLayoutRoute } from "../../app/layouts";

const apiAccessRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/api-access",
  component: lazyRouteComponent(() => import("./pages"), "ApiAccessPage"),
});

/** The API access page. */
export const apiAccessRoutes = [apiAccessRoute];
