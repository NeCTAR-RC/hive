// Code-based route tree. Two layouts: `auth` (no shell) and `app` (the full
// shell, which requires a live session). The catch-all applies the Horizon
// redirect map before giving up with a 404.
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
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
import { HomePage } from "../features/home/HomePage";
import { MyDetailsPage } from "../features/account/MyDetailsPage";
import { TermsPage } from "../features/terms/TermsPage";
import { NotFoundPage } from "../features/NotFoundPage";
import { OverviewPage } from "../features/compute/overview/OverviewPage";
import { InstancesPage } from "../features/compute/instances/InstancesPage";
import { InstanceDetailPage } from "../features/compute/instances/InstanceDetailPage";
import { LaunchPage } from "../features/compute/instances/LaunchPage";
import { ImagesPage } from "../features/compute/images/ImagesPage";
import { ImageDetailPage } from "../features/compute/images/ImageDetailPage";
import { KeyPairsPage } from "../features/compute/keypairs/KeyPairsPage";
import { KeyPairDetailPage } from "../features/compute/keypairs/KeyPairDetailPage";
import { ServerGroupsPage } from "../features/compute/servergroups/ServerGroupsPage";
import { ServerGroupDetailPage } from "../features/compute/servergroups/ServerGroupDetailPage";
import { SecurityGroupsPage } from "../features/network/securitygroups/SecurityGroupsPage";
import { SecurityGroupDetailPage } from "../features/network/securitygroups/SecurityGroupDetailPage";
import { NetworksPage } from "../features/network/networks/NetworksPage";
import { NetworkDetailPage } from "../features/network/networks/NetworkDetailPage";
import { SubnetDetailPage } from "../features/network/networks/SubnetDetailPage";
import { PortDetailPage } from "../features/network/networks/PortDetailPage";
import { RoutersPage } from "../features/network/routers/RoutersPage";
import { RouterDetailPage } from "../features/network/routers/RouterDetailPage";
import { FloatingIpsPage } from "../features/network/floatingips/FloatingIpsPage";
import { PortForwardingsPage } from "../features/network/floatingips/PortForwardingsPage";
import { TrunksPage } from "../features/network/trunks/TrunksPage";
import { TrunkDetailPage } from "../features/network/trunks/TrunkDetailPage";
import { TopologyPage } from "../features/network/topology/TopologyPage";
import { ApiAccessPage } from "../features/apiaccess/ApiAccessPage";
import { VolumesPage } from "../features/volumes/volumes/VolumesPage";
import { VolumeDetailPage } from "../features/volumes/volumes/VolumeDetailPage";
import { SnapshotsPage } from "../features/volumes/snapshots/SnapshotsPage";
import { SnapshotDetailPage } from "../features/volumes/snapshots/SnapshotDetailPage";
import { BackupsPage } from "../features/volumes/backups/BackupsPage";
import { BackupDetailPage } from "../features/volumes/backups/BackupDetailPage";
import { ResetPasswordPage } from "../features/account/ResetPasswordPage";
import { MembersPage } from "../features/identity/members/MembersPage";
import { UserLookupPage } from "../features/identity/lookup/UserLookupPage";
import { UserDetailPage } from "../features/identity/lookup/UserDetailPage";
import { ApplicationCredentialsPage } from "../features/identity/appcreds/ApplicationCredentialsPage";
import { ApplicationCredentialDetailPage } from "../features/identity/appcreds/ApplicationCredentialDetailPage";
import { CredentialsPage } from "../features/identity/credentials/CredentialsPage";
import { UsageTrendPage } from "../features/usage/UsageTrendPage";
import { AllocationUsagePage } from "../features/usage/AllocationUsagePage";
import { SecurityRisksPage } from "../features/security/SecurityRisksPage";
import { ReservationsPage } from "../features/reservations/ReservationsPage";
import { CreateReservationPage } from "../features/reservations/CreateReservationPage";
import { ReservationDetailPage } from "../features/reservations/ReservationDetailPage";
import { ContainersPage } from "../features/objectstore/ContainersPage";
import { ContainerPage } from "../features/objectstore/ContainerPage";
import { ClustersPage } from "../features/kubernetes/ClustersPage";
import { CreateClusterPage } from "../features/kubernetes/CreateClusterPage";
import { ClusterDetailPage } from "../features/kubernetes/ClusterDetailPage";
import { ClusterTemplatesPage } from "../features/kubernetes/ClusterTemplatesPage";
import { ClusterTemplateDetailPage } from "../features/kubernetes/ClusterTemplateDetailPage";
import { LoadBalancersPage } from "../features/loadbalancers/LoadBalancersPage";
import { CreateLoadBalancerPage } from "../features/loadbalancers/CreateLoadBalancerPage";
import { LoadBalancerDetailPage } from "../features/loadbalancers/LoadBalancerDetailPage";
import { ListenerDetailPage } from "../features/loadbalancers/ListenerDetailPage";
import { PoolDetailPage } from "../features/loadbalancers/PoolDetailPage";
import { StacksPage } from "../features/orchestration/StacksPage";
import { LaunchStackPage } from "../features/orchestration/LaunchStackPage";
import { StackDetailPage } from "../features/orchestration/StackDetailPage";
import { ResourceTypesPage } from "../features/orchestration/ResourceTypesPage";
import { ResourceTypeDetailPage } from "../features/orchestration/ResourceTypeDetailPage";
import {
  TemplateVersionDetailPage,
  TemplateVersionsPage,
} from "../features/orchestration/TemplateVersionsPage";
import { ZonesPage } from "../features/dns/ZonesPage";
import { ZoneDetailPage } from "../features/dns/ZoneDetailPage";
import { SharesPage } from "../features/shares/SharesPage";
import { ShareDetailPage } from "../features/shares/ShareDetailPage";
import {
  SnapshotDetailPage as ShareSnapshotDetailPage,
  SnapshotsPage as ShareSnapshotsPage,
} from "../features/shares/SnapshotsPage";
import {
  SecurityServiceDetailPage,
  SecurityServicesPage,
} from "../features/shares/SecurityServicesPage";
import {
  ShareGroupDetailPage,
  ShareGroupSnapshotsPage,
  ShareGroupsPage,
} from "../features/shares/ShareGroupsPage";
import { DbInstancesPage } from "../features/databases/InstancesPage";
import { LaunchDbInstancePage } from "../features/databases/LaunchInstancePage";
import { DbInstanceDetailPage } from "../features/databases/InstanceDetailPage";
import {
  DbBackupDetailPage,
  DbBackupsPage,
} from "../features/databases/BackupsPage";
import {
  DbConfigurationDetailPage,
  DbConfigurationsPage,
} from "../features/databases/ConfigurationsPage";

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

// Horizon's /auth/switch/<id>/ equivalent: switch, then go home.
const switchRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/auth/switch/$projectId",
  loader: async ({ params, context }) => {
    await apiFetch("/api/session/project", {
      method: "POST",
      json: { project_id: params.projectId },
    });
    context.queryClient.clear();
    throw redirect({ to: "/" });
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

export const securityGroupsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/security-groups",
  component: SecurityGroupsPage,
});

export const securityGroupRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/network/security-groups/$groupId",
  component: SecurityGroupDetailPage,
});

const listSearch = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
});

const createSearch = z.object({
  q: z.string().optional(),
  create: z.boolean().optional(),
});

const tabSearch = z.object({ tab: z.string().optional() });

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
  validateSearch: tabSearch,
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

const catchAllRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  beforeLoad: ({ location }) => {
    const match = matchRedirect(location.pathname, location.searchStr);
    if (match?.status === 301) {
      throw redirect({ href: match.to });
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
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
