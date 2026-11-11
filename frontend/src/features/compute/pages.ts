/**
 * The compute pages as one chunk. The routes in `routes.tsx` load this
 * module the first time one of them is visited, so the group's code stays
 * out of the first paint and arrives whole for the group's other pages.
 */
export { ImageDetailPage } from "./images/ImageDetailPage";
export { ImagesPage } from "./images/ImagesPage";
export { InstanceDetailPage } from "./instances/InstanceDetailPage";
export { InstancesPage } from "./instances/InstancesPage";
export { LaunchPage } from "./instances/LaunchPage";
export { KeyPairDetailPage } from "./keypairs/KeyPairDetailPage";
export { KeyPairsPage } from "./keypairs/KeyPairsPage";
export { OverviewPage } from "./overview/OverviewPage";
export { ServerGroupDetailPage } from "./servergroups/ServerGroupDetailPage";
export { ServerGroupsPage } from "./servergroups/ServerGroupsPage";
