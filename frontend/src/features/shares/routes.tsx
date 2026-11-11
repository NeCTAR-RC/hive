import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { appLayoutRoute } from "../../app/layouts";
import { createFromSearch, listSearch, tabSearch } from "../../lib/search";

const sharesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/shares",
  validateSearch: createFromSearch,
  component: lazyRouteComponent(() => import("./pages"), "SharesPage"),
});

const shareRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/shares/$shareId",
  validateSearch: tabSearch(["overview", "rules"]),
  component: lazyRouteComponent(() => import("./pages"), "ShareDetailPage"),
});

const shareSnapshotsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/snapshots",
  validateSearch: listSearch,
  component: lazyRouteComponent(() => import("./pages"), "SnapshotsPage"),
});

const shareSnapshotRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/snapshots/$snapshotId",
  component: lazyRouteComponent(() => import("./pages"), "SnapshotDetailPage"),
});

const securityServicesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/security-services",
  validateSearch: listSearch,
  component: lazyRouteComponent(
    () => import("./pages"),
    "SecurityServicesPage",
  ),
});

const securityServiceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/security-services/$serviceId",
  component: lazyRouteComponent(
    () => import("./pages"),
    "SecurityServiceDetailPage",
  ),
});

const shareGroupsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/share-groups",
  validateSearch: createFromSearch,
  component: lazyRouteComponent(() => import("./pages"), "ShareGroupsPage"),
});

const shareGroupRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/share-groups/$groupId",
  component: lazyRouteComponent(
    () => import("./pages"),
    "ShareGroupDetailPage",
  ),
});

const shareGroupSnapshotsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/share-group-snapshots",
  validateSearch: listSearch,
  component: lazyRouteComponent(
    () => import("./pages"),
    "ShareGroupSnapshotsPage",
  ),
});

/**
 * The shared file system pages: shares, share snapshots, security
 * services, share groups and share group snapshots.
 */
export const shareRoutes = [
  sharesRoute,
  shareRoute,
  shareSnapshotsRoute,
  shareSnapshotRoute,
  securityServicesRoute,
  securityServiceRoute,
  shareGroupsRoute,
  shareGroupRoute,
  shareGroupSnapshotsRoute,
];
