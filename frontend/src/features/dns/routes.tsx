import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { appLayoutRoute } from "../../app/layouts";
import { createSearch, listSearch } from "../../lib/search";

const zonesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/dns/zones",
  validateSearch: createSearch,
  component: lazyRouteComponent(() => import("./pages"), "ZonesPage"),
});

const zoneRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/dns/zones/$zoneId",
  validateSearch: listSearch,
  component: lazyRouteComponent(() => import("./pages"), "ZoneDetailPage"),
});

/** The DNS pages: the zones and a zone. */
export const dnsRoutes = [zonesRoute, zoneRoute];
