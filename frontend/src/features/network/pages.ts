/**
 * The network pages as one chunk. The routes in `routes.tsx` load this
 * module the first time one of them is visited, so the group's code stays
 * out of the first paint and arrives whole for the group's other pages.
 */
export { FloatingIpsPage } from "./floatingips/FloatingIpsPage";
export { PortForwardingsPage } from "./floatingips/PortForwardingsPage";
export { NetworkDetailPage } from "./networks/NetworkDetailPage";
export { NetworksPage } from "./networks/NetworksPage";
export { PortDetailPage } from "./networks/PortDetailPage";
export { SubnetDetailPage } from "./networks/SubnetDetailPage";
export { RouterDetailPage } from "./routers/RouterDetailPage";
export { RoutersPage } from "./routers/RoutersPage";
export { SecurityGroupDetailPage } from "./securitygroups/SecurityGroupDetailPage";
export { SecurityGroupsPage } from "./securitygroups/SecurityGroupsPage";
export { TopologyPage } from "./topology/TopologyPage";
export { TrunkDetailPage } from "./trunks/TrunkDetailPage";
export { TrunksPage } from "./trunks/TrunksPage";
