/**
 * The load balancer pages as one chunk. The routes in `routes.tsx` load this
 * module the first time one of them is visited, so the group's code stays
 * out of the first paint and arrives whole for the group's other pages.
 */
export { CreateLoadBalancerPage } from "./loadbalancers/CreateLoadBalancerPage";
export { ListenerDetailPage } from "./listeners/ListenerDetailPage";
export { LoadBalancerDetailPage } from "./loadbalancers/LoadBalancerDetailPage";
export { LoadBalancersPage } from "./loadbalancers/LoadBalancersPage";
export { PoolDetailPage } from "./pools/PoolDetailPage";
