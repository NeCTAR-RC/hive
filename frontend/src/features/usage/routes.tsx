import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";
import { appLayoutRoute } from "../../app/layouts";
import { optionalText } from "../../lib/search";

const usageTrendRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/usage/trend",
  validateSearch: z.object({
    begin: optionalText,
    end: optionalText,
  }),
  component: lazyRouteComponent(() => import("./pages"), "UsageTrendPage"),
});

const allocationUsageRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/usage/allocation",
  component: lazyRouteComponent(() => import("./pages"), "AllocationUsagePage"),
});

/** The usage pages: the usage trend and the allocation usage summary. */
export const usageRoutes = [usageTrendRoute, allocationUsageRoute];
