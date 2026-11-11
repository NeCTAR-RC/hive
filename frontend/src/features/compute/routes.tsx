import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";
import { appLayoutRoute } from "../../app/layouts";
import {
  listSearch,
  optionalFlag,
  optionalText,
  statusListSearch,
  tabParam,
} from "../../lib/search";

const overviewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/overview",
  component: lazyRouteComponent(() => import("./pages"), "OverviewPage"),
});

const instancesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/instances",
  validateSearch: statusListSearch,
  component: lazyRouteComponent(() => import("./pages"), "InstancesPage"),
});

const launchRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/instances/launch",
  validateSearch: z.object({
    flavor: optionalText,
    source: optionalText,
  }),
  component: lazyRouteComponent(() => import("./pages"), "LaunchPage"),
});

const instanceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/instances/$instanceId",
  validateSearch: z.object({
    tab: tabParam([
      "overview",
      "interfaces",
      "volumes",
      "security",
      "log",
      "actions",
    ]),
    action: optionalText,
  }),
  component: lazyRouteComponent(() => import("./pages"), "InstanceDetailPage"),
});

const imagesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/images",
  validateSearch: listSearch.extend({
    visibility: optionalText,
    snapshots: optionalFlag,
  }),
  component: lazyRouteComponent(() => import("./pages"), "ImagesPage"),
});

const imageRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/images/$imageId",
  component: lazyRouteComponent(() => import("./pages"), "ImageDetailPage"),
});

const keyPairsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/key-pairs",
  validateSearch: listSearch,
  component: lazyRouteComponent(() => import("./pages"), "KeyPairsPage"),
});

const keyPairRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/key-pairs/$name",
  component: lazyRouteComponent(() => import("./pages"), "KeyPairDetailPage"),
});

const serverGroupsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/server-groups",
  validateSearch: listSearch,
  component: lazyRouteComponent(() => import("./pages"), "ServerGroupsPage"),
});

const serverGroupRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/server-groups/$groupId",
  component: lazyRouteComponent(
    () => import("./pages"),
    "ServerGroupDetailPage",
  ),
});

/** The compute pages: overview, instances, images, key pairs, server groups. */
export const computeRoutes = [
  overviewRoute,
  instancesRoute,
  launchRoute,
  instanceRoute,
  imagesRoute,
  imageRoute,
  keyPairsRoute,
  keyPairRoute,
  serverGroupsRoute,
  serverGroupRoute,
];
