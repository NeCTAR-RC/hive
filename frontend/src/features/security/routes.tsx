import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { appLayoutRoute } from "../../app/layouts";

const securityRisksRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/security/risks",
  component: lazyRouteComponent(() => import("./pages"), "SecurityRisksPage"),
});

/** The security risks page. */
export const securityRoutes = [securityRisksRoute];
