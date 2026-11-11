// A router's static routes. Neutron keeps them as one list, so adding or
// deleting a route sends the whole list that should remain.
import type { HostRoute } from "../../../lib/api/types/network";

/** A static route's row id: its destination and next hop. */
export function routeId(route: HostRoute): string {
  return `${route.destination}|${route.nexthop}`;
}

/** `routes` with `added` first, as the add route dialog sends them. */
export function withRoute(routes: HostRoute[], added: HostRoute): HostRoute[] {
  return [added, ...routes];
}

/** `routes` less every route in `removed`, matched by destination and hop. */
export function withoutRoutes(
  routes: HostRoute[],
  removed: HostRoute[],
): HostRoute[] {
  const gone = new Set(removed.map(routeId));
  return routes.filter((route) => !gone.has(routeId(route)));
}
