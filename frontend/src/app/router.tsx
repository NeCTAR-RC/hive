// Code-based route tree. Two layouts: `auth` (no shell) and `app` (the full
// shell, which requires a live session). The catch-all applies the Horizon
// redirect map before giving up with a 404.
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { z } from "zod";
import { apiFetch } from "../lib/api/client";
import { meQuery, sessionQuery } from "../lib/queries";
import { AppLayout } from "../shell/AppLayout";
import { AuthLayout } from "../shell/AuthLayout";
import { matchRedirect } from "../shell/navigation/redirects";
import { LoginPage } from "../features/auth/LoginPage";
import { SignedOutPage } from "../features/auth/SignedOutPage";
import { NotFoundPage } from "../features/NotFoundPage";
import { RouteError, RoutePending } from "./RouteFallbacks";

// Every other page is a lazily loaded route component, so the login page
// and the shell no longer download all of the panels. Vite splits each
// dynamic import into its own chunk, grouped here by feature.

// home
const HomePage = lazyRouteComponent(
  () => import("../features/home/HomePage"),
  "HomePage",
);

// account
const MyDetailsPage = lazyRouteComponent(
  () => import("../features/account/MyDetailsPage"),
  "MyDetailsPage",
);
const ResetPasswordPage = lazyRouteComponent(
  () => import("../features/account/ResetPasswordPage"),
  "ResetPasswordPage",
);

// terms
const TermsPage = lazyRouteComponent(
  () => import("../features/terms/TermsPage"),
  "TermsPage",
);

// compute
const OverviewPage = lazyRouteComponent(
  () => import("../features/compute/overview/OverviewPage"),
  "OverviewPage",
);
const InstancesPage = lazyRouteComponent(
  () => import("../features/compute/instances/InstancesPage"),
  "InstancesPage",
);
const InstanceDetailPage = lazyRouteComponent(
  () => import("../features/compute/instances/InstanceDetailPage"),
  "InstanceDetailPage",
);
const LaunchPage = lazyRouteComponent(
  () => import("../features/compute/instances/LaunchPage"),
  "LaunchPage",
);
const ImagesPage = lazyRouteComponent(
  () => import("../features/compute/images/ImagesPage"),
  "ImagesPage",
);
const ImageDetailPage = lazyRouteComponent(
  () => import("../features/compute/images/ImageDetailPage"),
  "ImageDetailPage",
);
const KeyPairsPage = lazyRouteComponent(
  () => import("../features/compute/keypairs/KeyPairsPage"),
  "KeyPairsPage",
);
const KeyPairDetailPage = lazyRouteComponent(
  () => import("../features/compute/keypairs/KeyPairDetailPage"),
  "KeyPairDetailPage",
);
const ServerGroupsPage = lazyRouteComponent(
  () => import("../features/compute/servergroups/ServerGroupsPage"),
  "ServerGroupsPage",
);
const ServerGroupDetailPage = lazyRouteComponent(
  () => import("../features/compute/servergroups/ServerGroupDetailPage"),
  "ServerGroupDetailPage",
);

// network
const SecurityGroupsPage = lazyRouteComponent(
  () => import("../features/network/securitygroups/SecurityGroupsPage"),
  "SecurityGroupsPage",
);
const SecurityGroupDetailPage = lazyRouteComponent(
  () => import("../features/network/securitygroups/SecurityGroupDetailPage"),
  "SecurityGroupDetailPage",
);
const NetworksPage = lazyRouteComponent(
  () => import("../features/network/networks/NetworksPage"),
  "NetworksPage",
);
const NetworkDetailPage = lazyRouteComponent(
  () => import("../features/network/networks/NetworkDetailPage"),
  "NetworkDetailPage",
);
const SubnetDetailPage = lazyRouteComponent(
  () => import("../features/network/networks/SubnetDetailPage"),
  "SubnetDetailPage",
);
const PortDetailPage = lazyRouteComponent(
  () => import("../features/network/networks/PortDetailPage"),
  "PortDetailPage",
);
const RoutersPage = lazyRouteComponent(
  () => import("../features/network/routers/RoutersPage"),
  "RoutersPage",
);
const RouterDetailPage = lazyRouteComponent(
  () => import("../features/network/routers/RouterDetailPage"),
  "RouterDetailPage",
);
const FloatingIpsPage = lazyRouteComponent(
  () => import("../features/network/floatingips/FloatingIpsPage"),
  "FloatingIpsPage",
);
const PortForwardingsPage = lazyRouteComponent(
  () => import("../features/network/floatingips/PortForwardingsPage"),
  "PortForwardingsPage",
);
const TrunksPage = lazyRouteComponent(
  () => import("../features/network/trunks/TrunksPage"),
  "TrunksPage",
);
const TrunkDetailPage = lazyRouteComponent(
  () => import("../features/network/trunks/TrunkDetailPage"),
  "TrunkDetailPage",
);
const TopologyPage = lazyRouteComponent(
  () => import("../features/network/topology/TopologyPage"),
  "TopologyPage",
);

// apiaccess
const ApiAccessPage = lazyRouteComponent(
  () => import("../features/apiaccess/ApiAccessPage"),
  "ApiAccessPage",
);

// volumes
const VolumesPage = lazyRouteComponent(
  () => import("../features/volumes/volumes/VolumesPage"),
  "VolumesPage",
);
const VolumeDetailPage = lazyRouteComponent(
  () => import("../features/volumes/volumes/VolumeDetailPage"),
  "VolumeDetailPage",
);
const SnapshotsPage = lazyRouteComponent(
  () => import("../features/volumes/snapshots/SnapshotsPage"),
  "SnapshotsPage",
);
const SnapshotDetailPage = lazyRouteComponent(
  () => import("../features/volumes/snapshots/SnapshotDetailPage"),
  "SnapshotDetailPage",
);
const BackupsPage = lazyRouteComponent(
  () => import("../features/volumes/backups/BackupsPage"),
  "BackupsPage",
);
const BackupDetailPage = lazyRouteComponent(
  () => import("../features/volumes/backups/BackupDetailPage"),
  "BackupDetailPage",
);

// identity
const MembersPage = lazyRouteComponent(
  () => import("../features/identity/members/MembersPage"),
  "MembersPage",
);
const UserLookupPage = lazyRouteComponent(
  () => import("../features/identity/lookup/UserLookupPage"),
  "UserLookupPage",
);
const UserDetailPage = lazyRouteComponent(
  () => import("../features/identity/lookup/UserDetailPage"),
  "UserDetailPage",
);
const ApplicationCredentialsPage = lazyRouteComponent(
  () => import("../features/identity/appcreds/ApplicationCredentialsPage"),
  "ApplicationCredentialsPage",
);
const ApplicationCredentialDetailPage = lazyRouteComponent(
  () => import("../features/identity/appcreds/ApplicationCredentialDetailPage"),
  "ApplicationCredentialDetailPage",
);
const CredentialsPage = lazyRouteComponent(
  () => import("../features/identity/credentials/CredentialsPage"),
  "CredentialsPage",
);

// usage
const UsageTrendPage = lazyRouteComponent(
  () => import("../features/usage/UsageTrendPage"),
  "UsageTrendPage",
);
const AllocationUsagePage = lazyRouteComponent(
  () => import("../features/usage/AllocationUsagePage"),
  "AllocationUsagePage",
);

// security
const SecurityRisksPage = lazyRouteComponent(
  () => import("../features/security/SecurityRisksPage"),
  "SecurityRisksPage",
);

// reservations
const ReservationsPage = lazyRouteComponent(
  () => import("../features/reservations/ReservationsPage"),
  "ReservationsPage",
);
const CreateReservationPage = lazyRouteComponent(
  () => import("../features/reservations/CreateReservationPage"),
  "CreateReservationPage",
);
const ReservationDetailPage = lazyRouteComponent(
  () => import("../features/reservations/ReservationDetailPage"),
  "ReservationDetailPage",
);

// objectstore
const ContainersPage = lazyRouteComponent(
  () => import("../features/objectstore/ContainersPage"),
  "ContainersPage",
);
const ContainerPage = lazyRouteComponent(
  () => import("../features/objectstore/ContainerPage"),
  "ContainerPage",
);

// kubernetes
const ClustersPage = lazyRouteComponent(
  () => import("../features/kubernetes/ClustersPage"),
  "ClustersPage",
);
const CreateClusterPage = lazyRouteComponent(
  () => import("../features/kubernetes/CreateClusterPage"),
  "CreateClusterPage",
);
const ClusterDetailPage = lazyRouteComponent(
  () => import("../features/kubernetes/ClusterDetailPage"),
  "ClusterDetailPage",
);
const ClusterTemplatesPage = lazyRouteComponent(
  () => import("../features/kubernetes/ClusterTemplatesPage"),
  "ClusterTemplatesPage",
);
const ClusterTemplateDetailPage = lazyRouteComponent(
  () => import("../features/kubernetes/ClusterTemplateDetailPage"),
  "ClusterTemplateDetailPage",
);

// loadbalancers
const LoadBalancersPage = lazyRouteComponent(
  () => import("../features/loadbalancers/LoadBalancersPage"),
  "LoadBalancersPage",
);
const CreateLoadBalancerPage = lazyRouteComponent(
  () => import("../features/loadbalancers/CreateLoadBalancerPage"),
  "CreateLoadBalancerPage",
);
const LoadBalancerDetailPage = lazyRouteComponent(
  () => import("../features/loadbalancers/LoadBalancerDetailPage"),
  "LoadBalancerDetailPage",
);
const ListenerDetailPage = lazyRouteComponent(
  () => import("../features/loadbalancers/ListenerDetailPage"),
  "ListenerDetailPage",
);
const PoolDetailPage = lazyRouteComponent(
  () => import("../features/loadbalancers/PoolDetailPage"),
  "PoolDetailPage",
);

// orchestration
const StacksPage = lazyRouteComponent(
  () => import("../features/orchestration/StacksPage"),
  "StacksPage",
);
const LaunchStackPage = lazyRouteComponent(
  () => import("../features/orchestration/LaunchStackPage"),
  "LaunchStackPage",
);
const StackDetailPage = lazyRouteComponent(
  () => import("../features/orchestration/StackDetailPage"),
  "StackDetailPage",
);
const ResourceTypesPage = lazyRouteComponent(
  () => import("../features/orchestration/ResourceTypesPage"),
  "ResourceTypesPage",
);
const ResourceTypeDetailPage = lazyRouteComponent(
  () => import("../features/orchestration/ResourceTypeDetailPage"),
  "ResourceTypeDetailPage",
);
const TemplateVersionDetailPage = lazyRouteComponent(
  () => import("../features/orchestration/TemplateVersionsPage"),
  "TemplateVersionDetailPage",
);
const TemplateVersionsPage = lazyRouteComponent(
  () => import("../features/orchestration/TemplateVersionsPage"),
  "TemplateVersionsPage",
);

// dns
const ZonesPage = lazyRouteComponent(
  () => import("../features/dns/ZonesPage"),
  "ZonesPage",
);
const ZoneDetailPage = lazyRouteComponent(
  () => import("../features/dns/ZoneDetailPage"),
  "ZoneDetailPage",
);

// shares
const SharesPage = lazyRouteComponent(
  () => import("../features/shares/SharesPage"),
  "SharesPage",
);
const ShareDetailPage = lazyRouteComponent(
  () => import("../features/shares/ShareDetailPage"),
  "ShareDetailPage",
);
const ShareSnapshotDetailPage = lazyRouteComponent(
  () => import("../features/shares/SnapshotsPage"),
  "SnapshotDetailPage",
);
const ShareSnapshotsPage = lazyRouteComponent(
  () => import("../features/shares/SnapshotsPage"),
  "SnapshotsPage",
);
const SecurityServiceDetailPage = lazyRouteComponent(
  () => import("../features/shares/SecurityServicesPage"),
  "SecurityServiceDetailPage",
);
const SecurityServicesPage = lazyRouteComponent(
  () => import("../features/shares/SecurityServicesPage"),
  "SecurityServicesPage",
);
const ShareGroupDetailPage = lazyRouteComponent(
  () => import("../features/shares/ShareGroupsPage"),
  "ShareGroupDetailPage",
);
const ShareGroupSnapshotsPage = lazyRouteComponent(
  () => import("../features/shares/ShareGroupsPage"),
  "ShareGroupSnapshotsPage",
);
const ShareGroupsPage = lazyRouteComponent(
  () => import("../features/shares/ShareGroupsPage"),
  "ShareGroupsPage",
);

// databases
const DbInstancesPage = lazyRouteComponent(
  () => import("../features/databases/InstancesPage"),
  "DbInstancesPage",
);
const LaunchDbInstancePage = lazyRouteComponent(
  () => import("../features/databases/LaunchInstancePage"),
  "LaunchDbInstancePage",
);
const DbInstanceDetailPage = lazyRouteComponent(
  () => import("../features/databases/InstanceDetailPage"),
  "DbInstanceDetailPage",
);
const DbBackupDetailPage = lazyRouteComponent(
  () => import("../features/databases/BackupsPage"),
  "DbBackupDetailPage",
);
const DbBackupsPage = lazyRouteComponent(
  () => import("../features/databases/BackupsPage"),
  "DbBackupsPage",
);
const DbConfigurationDetailPage = lazyRouteComponent(
  () => import("../features/databases/ConfigurationsPage"),
  "DbConfigurationDetailPage",
);
const DbConfigurationsPage = lazyRouteComponent(
  () => import("../features/databases/ConfigurationsPage"),
  "DbConfigurationsPage",
);

export interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  notFoundComponent: () => <NotFoundPage />,
});

// --- public pages ---------------------------------------------------------

const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "auth",
  component: AuthLayout,
});

export const loginRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: "/auth/login",
  validateSearch: z.object({
    next: z.string().optional(),
    reason: z.string().optional(),
  }),
  component: LoginPage,
});

const signedOutRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: "/auth/signed-out",
  component: SignedOutPage,
});

const termsRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: "/terms",
  component: TermsPage,
});

// --- the dashboard --------------------------------------------------------

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (!session.authenticated) {
      throw redirect({
        to: "/auth/login",
        search: { next: location.href },
      });
    }
    // Every dashboard page reads the project from /api/me; have it ready.
    await context.queryClient.ensureQueryData(meQuery);
  },
  component: AppLayout,
});

export const homeRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  component: HomePage,
});

export const myDetailsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/account/my-details",
  component: MyDetailsPage,
});

// Horizon's /auth/switch/<id>/ equivalent: switch, then go home. This is a
// state change, so it runs in beforeLoad and never on a hover preload
// (`defaultPreload: "intent"` preloads links on hover).
export const switchRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/auth/switch/$projectId",
  beforeLoad: async ({ params, context, preload }) => {
    if (preload) return;
    await apiFetch("/api/session/project", {
      method: "POST",
      json: { project_id: params.projectId },
    });
    context.queryClient.clear();
    throw redirect({ to: "/", replace: true });
  },
  component: () => null,
});

// --- compute ---------------------------------------------------------------

export const overviewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/overview",
  component: OverviewPage,
});

export const instancesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/instances",
  validateSearch: z.object({
    q: z.string().optional(),
    status: z.string().optional(),
  }),
  component: InstancesPage,
});

export const launchRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/instances/launch",
  validateSearch: z.object({
    flavor: z.string().optional(),
    source: z.string().optional(),
  }),
  component: LaunchPage,
});

export const instanceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/instances/$instanceId",
  validateSearch: z.object({
    tab: z.string().optional(),
    action: z.string().optional(),
  }),
  component: InstanceDetailPage,
});

export const imagesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/images",
  validateSearch: z.object({
    q: z.string().optional(),
    visibility: z.string().optional(),
    snapshots: z.boolean().optional(),
  }),
  component: ImagesPage,
});

export const imageRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/images/$imageId",
  component: ImageDetailPage,
});

export const keyPairsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/key-pairs",
  component: KeyPairsPage,
});

export const keyPairRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/key-pairs/$name",
  component: KeyPairDetailPage,
});

export const serverGroupsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/server-groups",
  component: ServerGroupsPage,
});

export const serverGroupRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/compute/server-groups/$groupId",
  component: ServerGroupDetailPage,
});

// --- network ---------------------------------------------------------------

const listSearch = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
});

const createSearch = z.object({
  q: z.string().optional(),
  create: z.boolean().optional(),
});

const tabSearch = z.object({ tab: z.string().optional() });

export const securityGroupsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/security-groups",
  validateSearch: createSearch,
  component: SecurityGroupsPage,
});

export const securityGroupRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/security-groups/$groupId",
  component: SecurityGroupDetailPage,
});

export const topologyRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/topology",
  component: TopologyPage,
});

export const networksRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/networks",
  validateSearch: createSearch.extend({ scope: z.string().optional() }),
  component: NetworksPage,
});

export const networkRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/networks/$networkId",
  validateSearch: tabSearch,
  component: NetworkDetailPage,
});

export const subnetRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/subnets/$subnetId",
  component: SubnetDetailPage,
});

export const portRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/ports/$portId",
  component: PortDetailPage,
});

export const routersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/routers",
  validateSearch: createSearch,
  component: RoutersPage,
});

export const routerRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/routers/$routerId",
  validateSearch: tabSearch,
  component: RouterDetailPage,
});

export const floatingIpsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/floating-ips",
  validateSearch: z.object({
    q: z.string().optional(),
    allocate: z.boolean().optional(),
  }),
  component: FloatingIpsPage,
});

// Horizon's floating_ip_portforwardings "show" view takes ?floating_ip_id=.
export const portForwardingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/port-forwardings",
  validateSearch: z
    .object({
      q: z.string().optional(),
      floating_ip: z.string().optional(),
      floating_ip_id: z.string().optional(),
    })
    .transform(({ floating_ip_id, ...rest }) =>
      floating_ip_id && !rest.floating_ip
        ? { ...rest, floating_ip: floating_ip_id }
        : rest,
    ),
  component: PortForwardingsPage,
});

export const trunksRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/trunks",
  validateSearch: createSearch,
  component: TrunksPage,
});

export const trunkRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/trunks/$trunkId",
  component: TrunkDetailPage,
});

// --- project ---------------------------------------------------------------

export const volumesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/storage/volumes",
  validateSearch: listSearch.extend({
    create: z.boolean().optional(),
    snapshot: z.string().optional(),
    image: z.string().optional(),
    volume: z.string().optional(),
  }),
  component: VolumesPage,
});

// Horizon's /project/volumes/create/?snapshot_id= (and image_id,
// volume_id) lands here via the redirect map; open the dialog on the list.
export const volumeCreateRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/storage/volumes/create",
  validateSearch: z.object({
    snapshot_id: z.string().optional(),
    image_id: z.string().optional(),
    volume_id: z.string().optional(),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/storage/volumes",
      search: {
        create: true,
        ...(search.snapshot_id ? { snapshot: search.snapshot_id } : {}),
        ...(search.image_id ? { image: search.image_id } : {}),
        ...(search.volume_id ? { volume: search.volume_id } : {}),
      },
      replace: true,
    });
  },
});

export const volumeRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/storage/volumes/$volumeId",
  component: VolumeDetailPage,
});

export const snapshotsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/storage/snapshots",
  validateSearch: listSearch,
  component: SnapshotsPage,
});

export const snapshotRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/storage/snapshots/$snapshotId",
  component: SnapshotDetailPage,
});

export const backupsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/storage/backups",
  validateSearch: listSearch,
  component: BackupsPage,
});

export const backupRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/storage/backups/$backupId",
  component: BackupDetailPage,
});

export const apiAccessRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/api-access",
  component: ApiAccessPage,
});

// --- account, identity, usage, security, reservations ----------------------

export const resetPasswordRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/account/reset-password",
  component: ResetPasswordPage,
});

export const membersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/members",
  validateSearch: z.object({ add: z.boolean().optional() }),
  component: MembersPage,
});

export const userLookupRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/identity/user-lookup",
  validateSearch: z.object({ q: z.string().optional() }),
  component: UserLookupPage,
});

export const userDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/identity/users/$userId",
  component: UserDetailPage,
});

export const appCredentialsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/identity/application-credentials",
  validateSearch: z.object({ create: z.boolean().optional() }),
  component: ApplicationCredentialsPage,
});

export const appCredentialRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/identity/application-credentials/$credentialId",
  component: ApplicationCredentialDetailPage,
});

export const credentialsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/identity/credentials",
  validateSearch: z.object({ create: z.boolean().optional() }),
  component: CredentialsPage,
});

export const usageTrendRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/usage/trend",
  validateSearch: z.object({
    begin: z.string().optional(),
    end: z.string().optional(),
  }),
  component: UsageTrendPage,
});

export const allocationUsageRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/usage/allocation",
  component: AllocationUsagePage,
});

export const securityRisksRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/security/risks",
  component: SecurityRisksPage,
});

export const reservationsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/reservations",
  component: ReservationsPage,
});

export const createReservationRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/reservations/new",
  validateSearch: z.object({
    category: z.string().optional(),
    zone: z.string().optional(),
  }),
  component: CreateReservationPage,
});

export const reservationRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/reservations/$reservationId",
  validateSearch: z.object({ extend: z.boolean().optional() }),
  component: ReservationDetailPage,
});

// --- object store, kubernetes, load balancers ------------------------------

export const containersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/object-store/containers",
  validateSearch: z.object({ create: z.boolean().optional() }),
  component: ContainersPage,
});

export const containerRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/object-store/containers/$container",
  component: ContainerPage,
});

export const containerFolderRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/object-store/containers/$container/$",
  component: ContainerPage,
});

export const clustersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/kubernetes/clusters",
  component: ClustersPage,
});

export const createClusterRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/kubernetes/clusters/new",
  component: CreateClusterPage,
});

export const clusterRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/kubernetes/clusters/$clusterId",
  validateSearch: tabSearch,
  component: ClusterDetailPage,
});

export const templatesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/kubernetes/cluster-templates",
  component: ClusterTemplatesPage,
});

export const templateRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/kubernetes/cluster-templates/$templateId",
  component: ClusterTemplateDetailPage,
});

export const loadBalancersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/load-balancers",
  component: LoadBalancersPage,
});

export const createLoadBalancerRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/load-balancers/new",
  component: CreateLoadBalancerPage,
});

export const loadBalancerRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/load-balancers/$lbId",
  validateSearch: tabSearch,
  component: LoadBalancerDetailPage,
});

export const listenerRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/load-balancers/$lbId/listeners/$listenerId",
  component: ListenerDetailPage,
});

export const poolRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/load-balancers/$lbId/pools/$poolId",
  component: PoolDetailPage,
});

// --- orchestration, dns, shares, databases ----------------------------------

export const stacksRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/orchestration/stacks",
  component: StacksPage,
});

export const launchStackRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/orchestration/stacks/new",
  component: LaunchStackPage,
});

export const stackRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/orchestration/stacks/$stackId",
  validateSearch: tabSearch,
  component: StackDetailPage,
});

export const resourceTypesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/orchestration/resource-types",
  component: ResourceTypesPage,
});

export const resourceTypeRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/orchestration/resource-types/$name",
  component: ResourceTypeDetailPage,
});

export const templateVersionsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/orchestration/template-versions",
  component: TemplateVersionsPage,
});

export const templateVersionRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/orchestration/template-versions/$version",
  component: TemplateVersionDetailPage,
});

export const zonesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/dns/zones",
  validateSearch: z.object({ create: z.boolean().optional() }),
  component: ZonesPage,
});

export const zoneRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/dns/zones/$zoneId",
  component: ZoneDetailPage,
});

const createFromSearch = z.object({
  create: z.boolean().optional(),
  snapshot: z.string().optional(),
});

export const sharesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/shares",
  validateSearch: createFromSearch,
  component: SharesPage,
});

export const shareRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/shares/$shareId",
  validateSearch: tabSearch,
  component: ShareDetailPage,
});

export const shareSnapshotsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/snapshots",
  component: ShareSnapshotsPage,
});

export const shareSnapshotRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/snapshots/$snapshotId",
  component: ShareSnapshotDetailPage,
});

export const securityServicesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/security-services",
  component: SecurityServicesPage,
});

export const securityServiceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/security-services/$serviceId",
  component: SecurityServiceDetailPage,
});

export const shareGroupsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/share-groups",
  validateSearch: createFromSearch,
  component: ShareGroupsPage,
});

export const shareGroupRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/share-groups/$groupId",
  component: ShareGroupDetailPage,
});

export const shareGroupSnapshotsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shares/share-group-snapshots",
  component: ShareGroupSnapshotsPage,
});

export const dbInstancesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/databases/instances",
  component: DbInstancesPage,
});

export const launchDbRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/databases/instances/new",
  validateSearch: z.object({ backup: z.string().optional() }),
  component: LaunchDbInstancePage,
});

export const dbInstanceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/databases/instances/$instanceId",
  // `log` opens a guest log's viewer (the Horizon log_contents redirect)
  validateSearch: z.object({
    tab: z.string().optional(),
    log: z.string().optional(),
  }),
  component: DbInstanceDetailPage,
});

export const dbBackupsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/databases/backups",
  validateSearch: z.object({
    create: z.boolean().optional(),
    instance: z.string().optional(),
  }),
  component: DbBackupsPage,
});

export const dbBackupRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/databases/backups/$backupId",
  component: DbBackupDetailPage,
});

export const dbConfigurationsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/databases/configuration-groups",
  component: DbConfigurationsPage,
});

export const dbConfigurationRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/databases/configuration-groups/$configurationId",
  validateSearch: tabSearch,
  component: DbConfigurationDetailPage,
});

// --- catch-all: Horizon redirects, then 404 --------------------------------

/**
 * Backend targets (every `download` row points under /api/) must be a full
 * document load; a client-side navigation would render the SPA's 404.
 */
export function isDocumentTarget(to: string): boolean {
  return to.startsWith("/api/");
}

export const catchAllRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  beforeLoad: ({ location }) => {
    const match = matchRedirect(location.pathname, location.searchStr);
    if (match?.status === 301) {
      throw redirect({
        href: match.to,
        ...(isDocumentTarget(match.to) ? { reloadDocument: true } : {}),
      });
    }
    return { gone: match?.status === 410 };
  },
  component: CatchAllPage,
});

function CatchAllPage() {
  const { gone } = catchAllRoute.useRouteContext();
  return <NotFoundPage gone={gone} />;
}

const routeTree = rootRoute.addChildren([
  authLayoutRoute.addChildren([loginRoute, signedOutRoute, termsRoute]),
  appLayoutRoute.addChildren([
    homeRoute,
    myDetailsRoute,
    switchRoute,
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
    volumesRoute,
    volumeCreateRoute,
    volumeRoute,
    snapshotsRoute,
    snapshotRoute,
    backupsRoute,
    backupRoute,
    apiAccessRoute,
    resetPasswordRoute,
    membersRoute,
    userLookupRoute,
    userDetailRoute,
    appCredentialsRoute,
    appCredentialRoute,
    credentialsRoute,
    usageTrendRoute,
    allocationUsageRoute,
    securityRisksRoute,
    reservationsRoute,
    createReservationRoute,
    reservationRoute,
    containersRoute,
    containerRoute,
    containerFolderRoute,
    clustersRoute,
    createClusterRoute,
    clusterRoute,
    templatesRoute,
    templateRoute,
    loadBalancersRoute,
    createLoadBalancerRoute,
    loadBalancerRoute,
    listenerRoute,
    poolRoute,
    stacksRoute,
    launchStackRoute,
    stackRoute,
    resourceTypesRoute,
    resourceTypeRoute,
    templateVersionsRoute,
    templateVersionRoute,
    zonesRoute,
    zoneRoute,
    sharesRoute,
    shareRoute,
    shareSnapshotsRoute,
    shareSnapshotRoute,
    securityServicesRoute,
    securityServiceRoute,
    shareGroupsRoute,
    shareGroupRoute,
    shareGroupSnapshotsRoute,
    dbInstancesRoute,
    launchDbRoute,
    dbInstanceRoute,
    dbBackupsRoute,
    dbBackupRoute,
    dbConfigurationsRoute,
    dbConfigurationRoute,
  ]),
  catchAllRoute,
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouteError,
    defaultPendingComponent: RoutePending,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
