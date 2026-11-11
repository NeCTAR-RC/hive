import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { appLayoutRoute } from "../../app/layouts";
import {
  createSearch,
  listSearch,
  optionalFlag,
  optionalText,
  tabSearch,
} from "../../lib/search";

const securityGroupsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/security-groups",
  validateSearch: createSearch,
  component: lazyRouteComponent(() => import("./pages"), "SecurityGroupsPage"),
});

const securityGroupRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/security-groups/$groupId",
  component: lazyRouteComponent(
    () => import("./pages"),
    "SecurityGroupDetailPage",
  ),
});

const topologyRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/topology",
  component: lazyRouteComponent(() => import("./pages"), "TopologyPage"),
});

const networksRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/networks",
  validateSearch: createSearch.extend({ scope: optionalText }),
  component: lazyRouteComponent(() => import("./pages"), "NetworksPage"),
});

const networkRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/networks/$networkId",
  validateSearch: tabSearch(["overview", "subnets", "ports"]),
  component: lazyRouteComponent(() => import("./pages"), "NetworkDetailPage"),
});

const subnetRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/subnets/$subnetId",
  component: lazyRouteComponent(() => import("./pages"), "SubnetDetailPage"),
});

const portRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/ports/$portId",
  component: lazyRouteComponent(() => import("./pages"), "PortDetailPage"),
});

const routersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/routers",
  validateSearch: createSearch,
  component: lazyRouteComponent(() => import("./pages"), "RoutersPage"),
});

const routerRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/routers/$routerId",
  validateSearch: tabSearch(["overview", "interfaces", "routes"]),
  component: lazyRouteComponent(() => import("./pages"), "RouterDetailPage"),
});

const floatingIpsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/floating-ips",
  validateSearch: listSearch.extend({ allocate: optionalFlag }),
  component: lazyRouteComponent(() => import("./pages"), "FloatingIpsPage"),
});

/** Horizon's floating_ip_portforwardings "show" view takes ?floating_ip_id=. */
const portForwardingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/port-forwardings",
  validateSearch: listSearch
    .extend({
      floating_ip: optionalText,
      floating_ip_id: optionalText,
    })
    .transform(({ floating_ip_id, ...rest }) =>
      floating_ip_id && !rest.floating_ip
        ? { ...rest, floating_ip: floating_ip_id }
        : rest,
    ),
  component: lazyRouteComponent(() => import("./pages"), "PortForwardingsPage"),
});

const trunksRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/trunks",
  validateSearch: createSearch,
  component: lazyRouteComponent(() => import("./pages"), "TrunksPage"),
});

const trunkRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/trunks/$trunkId",
  component: lazyRouteComponent(() => import("./pages"), "TrunkDetailPage"),
});

/**
 * The network pages: security groups, topology, networks (with their
 * subnets and ports), routers, floating IPs and port forwardings, trunks.
 */
export const networkRoutes = [
  securityGroupsRoute,
  securityGroupRoute,
  topologyRoute,
  networksRoute,
  networkRoute,
  subnetRoute,
  portRoute,
  routersRoute,
  routerRoute,
  floatingIpsRoute,
  portForwardingsRoute,
  trunksRoute,
  trunkRoute,
];
