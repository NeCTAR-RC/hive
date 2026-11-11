// Every page Hive builds (src/features/*/routes.tsx), with the heading it
// shows.
// Detail routes use the mocked API's seeded ids; the live smoke uses only
// the routes without one, since a real project has other ids.

export interface PageRoute {
  path: string;
  /** The page's level-1 heading. */
  h1: string;
  /** True when the path names a record seeded in src/mocks. */
  seeded?: boolean;
  /** True when the page needs the user lookup capability (the mock's
   * `helpdesk` session). */
  helpdesk?: boolean;
}

export const SIGNED_OUT_ROUTES: PageRoute[] = [
  { path: "/auth/login", h1: "Welcome to the Dashboard." },
  { path: "/auth/signed-out", h1: "You have signed out" },
  { path: "/terms", h1: "Terms of service" },
];

export const APP_ROUTES: PageRoute[] = [
  { path: "/account/my-details", h1: "My details" },
  { path: "/account/reset-password", h1: "Reset password" },
  { path: "/compute/overview", h1: "Overview" },
  { path: "/compute/instances", h1: "Instances" },
  { path: "/compute/instances/launch", h1: "Launch instance" },
  { path: "/compute/instances/i-web-1", h1: "web-1", seeded: true },
  { path: "/compute/images", h1: "Images" },
  {
    path: "/compute/images/img-ubuntu",
    h1: "NeCTAR Ubuntu 24.04 LTS (Noble) amd64",
    seeded: true,
  },
  { path: "/compute/key-pairs", h1: "Key pairs" },
  { path: "/compute/key-pairs/ada-laptop", h1: "ada-laptop", seeded: true },
  { path: "/compute/server-groups", h1: "Server groups" },
  { path: "/compute/server-groups/sg-1", h1: "web-tier", seeded: true },
  { path: "/reservations", h1: "Reservations" },
  { path: "/reservations/new", h1: "Create reservation" },
  { path: "/reservations/res-1", h1: "Reservation res-1", seeded: true },
  { path: "/storage/volumes", h1: "Volumes" },
  { path: "/storage/volumes/vol-1", h1: "web-data", seeded: true },
  { path: "/storage/snapshots", h1: "Volume snapshots" },
  {
    path: "/storage/snapshots/snap-1",
    h1: "web-data-before-upgrade",
    seeded: true,
  },
  { path: "/storage/backups", h1: "Volume backups" },
  { path: "/storage/backups/bak-1", h1: "web-data-nightly", seeded: true },
  { path: "/kubernetes/clusters", h1: "Clusters" },
  { path: "/kubernetes/clusters/new", h1: "Create cluster" },
  { path: "/kubernetes/clusters/c-1", h1: "samtest1", seeded: true },
  { path: "/kubernetes/cluster-templates", h1: "Cluster templates" },
  {
    path: "/kubernetes/cluster-templates/t-133",
    h1: "kubernetes-v1.33.4-ardctest-artm-calico-v5",
    seeded: true,
  },
  { path: "/network/topology", h1: "Network topology" },
  { path: "/network/networks", h1: "Networks" },
  { path: "/network/networks/net-private", h1: "private-net", seeded: true },
  { path: "/network/subnets/subnet-1", h1: "private-subnet", seeded: true },
  { path: "/network/ports/port-spare", h1: "spare-port", seeded: true },
  { path: "/network/routers", h1: "Routers" },
  { path: "/network/routers/r-1", h1: "default", seeded: true },
  { path: "/network/security-groups", h1: "Security groups" },
  {
    path: "/network/security-groups/secgroup-web",
    h1: "web",
    seeded: true,
  },
  { path: "/network/floating-ips", h1: "Floating IPs" },
  { path: "/network/port-forwardings", h1: "Port forwarding rules" },
  { path: "/network/trunks", h1: "Trunks" },
  { path: "/network/trunks/trunk-1", h1: "trunk-1", seeded: true },
  { path: "/load-balancers", h1: "Load balancers" },
  { path: "/load-balancers/new", h1: "Create load balancer" },
  { path: "/load-balancers/lb-1", h1: "web", seeded: true },
  { path: "/load-balancers/lb-1/listeners/l-1", h1: "http", seeded: true },
  { path: "/load-balancers/lb-1/pools/p-1", h1: "web-pool", seeded: true },
  { path: "/object-store/containers", h1: "Containers" },
  { path: "/object-store/containers/docs", h1: "docs", seeded: true },
  { path: "/object-store/containers/docs/notes", h1: "notes", seeded: true },
  { path: "/databases/instances", h1: "Database instances" },
  { path: "/databases/instances/new", h1: "Launch database instance" },
  { path: "/databases/instances/db-1", h1: "appdb", seeded: true },
  { path: "/databases/backups", h1: "Database backups" },
  { path: "/databases/backups/bk-1", h1: "nightly", seeded: true },
  { path: "/databases/configuration-groups", h1: "Configuration groups" },
  {
    path: "/databases/configuration-groups/cfg-1",
    h1: "tuned",
    seeded: true,
  },
  { path: "/usage/trend", h1: "Usage trend" },
  { path: "/usage/allocation", h1: "Allocation usage" },
  { path: "/orchestration/stacks", h1: "Stacks" },
  { path: "/orchestration/stacks/new", h1: "Launch stack" },
  { path: "/orchestration/stacks/stack-1", h1: "web-tier", seeded: true },
  { path: "/orchestration/resource-types", h1: "Resource types" },
  {
    path: "/orchestration/resource-types/OS::Nova::Server",
    h1: "OS::Nova::Server",
    seeded: true,
  },
  { path: "/orchestration/template-versions", h1: "Template versions" },
  {
    path: "/orchestration/template-versions/heat_template_version.2021-04-16",
    h1: "heat_template_version.2021-04-16",
    seeded: true,
  },
  { path: "/dns/zones", h1: "Zones" },
  { path: "/dns/zones/zone-1", h1: "example.org.", seeded: true },
  { path: "/shares/shares", h1: "Shares" },
  { path: "/shares/shares/share-1", h1: "datasets", seeded: true },
  { path: "/shares/snapshots", h1: "Share snapshots" },
  { path: "/shares/snapshots/ssnap-1", h1: "datasets-snap", seeded: true },
  { path: "/shares/security-services", h1: "Security services" },
  { path: "/shares/security-services/ss-1", h1: "corp-ad", seeded: true },
  { path: "/shares/share-groups", h1: "Share groups" },
  { path: "/shares/share-groups/sg-1", h1: "group-a", seeded: true },
  { path: "/shares/share-group-snapshots", h1: "Share group snapshots" },
  { path: "/api-access", h1: "API access" },
  { path: "/security/risks", h1: "Security risks" },
  { path: "/members", h1: "Project members" },
  { path: "/identity/user-lookup", h1: "User details", helpdesk: true },
  {
    path: "/identity/users/u2",
    h1: "Ann Example",
    seeded: true,
    helpdesk: true,
  },
  { path: "/identity/application-credentials", h1: "Application credentials" },
  {
    path: "/identity/application-credentials/ac-1",
    h1: "deploy-bot",
    seeded: true,
  },
  { path: "/identity/credentials", h1: "Credentials" },
];
