import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { appLayoutRoute } from "../../app/layouts";
import { listSearch, tabSearch } from "../../lib/search";

const loadBalancersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/load-balancers",
  validateSearch: listSearch,
  component: lazyRouteComponent(() => import("./pages"), "LoadBalancersPage"),
});

const createLoadBalancerRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/load-balancers/new",
  component: lazyRouteComponent(
    () => import("./pages"),
    "CreateLoadBalancerPage",
  ),
});

const loadBalancerRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/load-balancers/$lbId",
  validateSearch: tabSearch(["overview", "listeners", "pools"]),
  component: lazyRouteComponent(
    () => import("./pages"),
    "LoadBalancerDetailPage",
  ),
});

const listenerRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/load-balancers/$lbId/listeners/$listenerId",
  component: lazyRouteComponent(() => import("./pages"), "ListenerDetailPage"),
});

const poolRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/load-balancers/$lbId/pools/$poolId",
  component: lazyRouteComponent(() => import("./pages"), "PoolDetailPage"),
});

/** The load balancer pages, with a balancer's listeners and pools. */
export const loadBalancerRoutes = [
  loadBalancersRoute,
  createLoadBalancerRoute,
  loadBalancerRoute,
  listenerRoute,
  poolRoute,
];
