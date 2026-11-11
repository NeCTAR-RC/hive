/**
 * The Kubernetes pages as one chunk. The routes in `routes.tsx` load this
 * module the first time one of them is visited, so the group's code stays
 * out of the first paint and arrives whole for the group's other pages.
 */
export { ClusterDetailPage } from "./clusters/ClusterDetailPage";
export { ClusterTemplateDetailPage } from "./templates/ClusterTemplateDetailPage";
export { ClusterTemplatesPage } from "./templates/ClusterTemplatesPage";
export { ClustersPage } from "./clusters/ClustersPage";
export { CreateClusterPage } from "./clusters/CreateClusterPage";
