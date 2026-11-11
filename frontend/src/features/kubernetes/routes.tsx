import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";
import { appLayoutRoute } from "../../app/layouts";
import { listSearch, optionalText, tabSearch } from "../../lib/search";

const clustersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/kubernetes/clusters",
  validateSearch: listSearch,
  component: lazyRouteComponent(() => import("./pages"), "ClustersPage"),
});

const createClusterRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/kubernetes/clusters/new",
  // A template's "Create cluster" pre-fills its version, zone and driver.
  validateSearch: z.object({
    version: optionalText,
    zone: optionalText,
    driver: optionalText,
  }),
  component: lazyRouteComponent(() => import("./pages"), "CreateClusterPage"),
});

const clusterRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/kubernetes/clusters/$clusterId",
  validateSearch: tabSearch(["overview", "nodegroups", "labels"]),
  component: lazyRouteComponent(() => import("./pages"), "ClusterDetailPage"),
});

const templatesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/kubernetes/cluster-templates",
  validateSearch: listSearch,
  component: lazyRouteComponent(
    () => import("./pages"),
    "ClusterTemplatesPage",
  ),
});

const templateRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/kubernetes/cluster-templates/$templateId",
  component: lazyRouteComponent(
    () => import("./pages"),
    "ClusterTemplateDetailPage",
  ),
});

/** The Kubernetes pages: clusters and cluster templates. */
export const kubernetesRoutes = [
  clustersRoute,
  createClusterRoute,
  clusterRoute,
  templatesRoute,
  templateRoute,
];
