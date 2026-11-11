/**
 * The shared file system pages as one chunk. The routes in `routes.tsx` load this
 * module the first time one of them is visited, so the group's code stays
 * out of the first paint and arrives whole for the group's other pages.
 */
export { ShareGroupDetailPage } from "./groups/ShareGroupDetailPage";
export { ShareGroupSnapshotsPage } from "./groups/ShareGroupSnapshotsPage";
export { ShareGroupsPage } from "./groups/ShareGroupsPage";
export { SecurityServiceDetailPage } from "./securityservices/SecurityServiceDetailPage";
export { SecurityServicesPage } from "./securityservices/SecurityServicesPage";
export { ShareDetailPage } from "./shares/ShareDetailPage";
export { SharesPage } from "./shares/SharesPage";
export { SnapshotDetailPage } from "./snapshots/SnapshotDetailPage";
export { SnapshotsPage } from "./snapshots/SnapshotsPage";
