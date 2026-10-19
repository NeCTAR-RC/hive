// Shapes returned by the Hive backend. Kept by hand until the OpenAPI
// generation step lands; field names match the FastAPI responses.

export interface PublicConfig {
  site_name: string;
  env: "dev" | "test" | "prod";
  version: string;
  login_url: string;
  login_base_url: string;
  receiver_url: string;
  horizon_url: string;
  help_url: string;
  outage_base_url: string;
  ga_id: string | null;
  freshworks_widget_id: string | null;
  banner_url: string | null;
  trial_project_prefix: string;
}

export interface SessionProbe {
  authenticated: boolean;
  user_id?: string;
  project_id?: string | null;
  expires_at?: number;
  server_time: number;
  csrf_token?: string;
  login_url?: string;
}

export interface UserRef {
  id: string;
  name: string;
  domain_id: string | null;
}

export interface ProjectRef {
  id: string;
  name: string;
  domain_id: string | null;
  enabled: boolean;
}

export type ServiceKey =
  | "compute"
  | "volume"
  | "network"
  | "image"
  | "object-store"
  | "container-infra"
  | "load-balancer"
  | "orchestration"
  | "dns"
  | "share"
  | "database"
  | "reservation"
  | "security"
  | "rating"
  | "metric"
  | "allocations"
  | "account"
  | "ops";

export interface Me {
  user: UserRef;
  project: ProjectRef & { is_trial: boolean };
  roles: string[];
  projects: ProjectRef[];
  capabilities: {
    tenantmanager: boolean;
    user_lookup: boolean;
    services: Record<ServiceKey, boolean>;
  };
  session: { expires_at: number; server_time: number };
}

export interface ExternalId {
  idp: string | null;
  last_login: string | null;
}

export interface Affiliation {
  id: string;
  label: string;
}

export interface Profile {
  partial: boolean;
  error?: string;
  message?: string;
  id?: number | string;
  first_name?: string;
  surname?: string;
  displayname?: string;
  email?: string | null;
  organisation?: string | null;
  affiliation?: string | null;
  phone_number?: string | null;
  mobile_number?: string | null;
  orcid?: string | null;
  registered_at?: string | null;
  last_login?: string | null;
  terms_accepted_at?: string | null;
  expiry_status?: string | null;
  expiry_next_step?: string | null;
  external_ids?: ExternalId[];
  affiliations?: Affiliation[];
  orcid_url?: string;
  orcid_link_url?: string | null;
  orcid_unlink_url?: string | null;
  orcid_return_url?: string;
}

/** backend/hive/schemas/account.py `Affiliation`, for a zod `z.enum`. */
export const AFFILIATION_IDS = [
  "faculty",
  "student",
  "staff",
  "employee",
  "member",
  "affiliate",
  "alum",
  "library-walk-in",
] as const;

export type AffiliationId = (typeof AFFILIATION_IDS)[number];

export interface ProfileUpdateRequest {
  /**
   * One of AFFILIATION_IDS. Still `string` only because
   * features/account/MyDetailsPage.tsx validates with `z.string()`; tighten
   * to AffiliationId once it uses `z.enum(AFFILIATION_IDS)`.
   */
  affiliation: string;
  phone_number: string | null;
  mobile_number: string | null;
}

export interface PasswordReset {
  password: string;
  username: string;
}

export interface Outage {
  id: number;
  title: string;
  description: string | null;
  severity: number;
  scheduled: boolean;
  scheduled_display: string | null;
  status_display: string | null;
  start: string;
  end: string | null;
  planned_end: string | null;
  cancelled: boolean | null;
  url: string;
}

export interface OutagesResponse {
  items: Outage[];
  available: boolean;
  fetched_at: number | null;
}

export interface AllocationSummary {
  allocation: {
    id: number;
    project_id: string;
    project_name: string;
    project_description: string | null;
    status: string;
    status_display: string | null;
    start_date: string;
    end_date: string;
    bundle: string | null;
    allocation_home_display: string | null;
    national: boolean | null;
    managed: boolean | null;
  } | null;
  su_budget: number | null;
  su_used: number | null;
  quotas: Record<string, { quota: number | null; zone: string | null }>;
  is_trial: boolean;
  links: { new_request: string; my_requests: string };
  partial: boolean;
  errors: { source: string; error: string; message: string }[];
  fetched_at: number;
}

/** One CloudKitty summary row; the keys depend on the groupby. */
export interface UsageRow {
  begin?: string;
  end?: string;
  rate?: number | string | null;
  qty?: number | string | null;
  [key: string]: unknown;
}

export interface UsageSummary {
  begin: string;
  end: string;
  sum: number;
  data: UsageRow[];
  fetched_at: number;
}

export interface SecurityRiskType {
  id?: string;
  name?: string;
  display_name?: string | null;
  description?: string | null;
  help_url?: string | null;
}

export interface SecurityRisk {
  id: number | string;
  resource_id: string;
  resource_type: string;
  status?: string;
  ipaddress?: string | null;
  port?: number | null;
  type?: SecurityRiskType;
  first_seen?: string;
  last_seen?: string;
}

export interface RisksResponse {
  items: SecurityRisk[];
  available: boolean;
  fetched_at: number | null;
}

export interface NewsItem {
  title: string;
  link: string;
  published: string;
  summary: string;
  image: string | null;
}

export interface NewsResponse {
  items: NewsItem[];
  fetched_at: number;
}

export interface BannerItem {
  title?: string;
  description?: string;
  link?: string;
  link_text?: string;
  image?: string;
  color?: string;
}

// --- compute -----------------------------------------------------------------

export interface Paginated<T> {
  items: T[];
  next_marker: string | null;
  has_more: boolean;
}

export interface Items<T> {
  items: T[];
}

export interface Flavor {
  id: string;
  name: string;
  vcpus: number | null;
  ram_mb: number | null;
  disk_gb: number | null;
  ephemeral_gb: number | null;
  swap_mb: number;
  is_public: boolean;
  flavor_class: string | null;
  su_rate: number | null;
  is_preemptible: boolean;
  extra_specs: Record<string, string>;
}

export interface Address {
  network: string;
  addr: string;
  version: 4 | 6;
  type: "fixed" | "floating" | null;
  mac: string | null;
}

export interface InstanceFault {
  code: number | null;
  message: string | null;
  created: string | null;
}

export interface Instance {
  id: string;
  name: string;
  description: string | null;
  status: string;
  power_state: string;
  task_state: string | null;
  vm_state: string | null;
  availability_zone: string | null;
  created: string;
  updated: string;
  locked: boolean;
  host_id: string | null;
  key_name: string | null;
  progress: number | null;
  user_id: string;
  project_id: string;
  flavor: Flavor | null;
  image: { id: string; name: string | null } | null;
  boot_from_volume: boolean;
  addresses: Address[];
  security_groups: string[];
  volumes_attached: string[];
  metadata: Record<string, string>;
  fault: InstanceFault | null;
  server_group_ids: string[];
}

export interface InstanceDetail extends Instance {
  user_data: string | null;
  os_ext_srv_attr: { instance_name: string | null; hostname: string | null };
}

export interface InstanceVolume {
  id: string;
  device: string | null;
  name: string;
  size_gb: number | null;
  status: string | null;
  bootable: boolean;
  volume_type: string | null;
}

export interface InstancePort {
  id: string;
  network_id: string;
  mac_address: string | null;
  status: string | null;
  fixed_ips: { ip: string; subnet_id: string }[];
  security_groups: string[];
  port_security_enabled: boolean | null;
  floating_ips: { id: string; address: string }[];
}

export interface InstanceAction {
  action: string;
  request_id: string;
  user_id: string | null;
  start_time: string;
  message: string | null;
}

export interface AvailabilityZone {
  name: string;
  available: boolean;
}

export interface Image {
  id: string;
  name: string | null;
  status: string;
  visibility: "private" | "shared" | "public" | "community";
  owner: string | null;
  is_owner: boolean;
  is_snapshot: boolean;
  size: number | null;
  disk_format: string | null;
  container_format: string | null;
  min_disk: number | null;
  min_ram: number | null;
  created_at: string | null;
  updated_at: string | null;
  protected: boolean;
  os_distro: string | null;
  os_version: string | null;
  tags: string[];
  properties: Record<string, unknown>;
  /** Launch options only: other projects' community images start hidden. */
  hidden_until_search?: boolean;
}

export interface KeyPair {
  name: string;
  type: "ssh" | "x509" | null;
  fingerprint: string | null;
  public_key: string | null;
  created_at?: string | null;
  /** Only ever present once, in the create response. */
  private_key?: string | null;
}

export type ServerGroupPolicy =
  "affinity" | "anti-affinity" | "soft-affinity" | "soft-anti-affinity";

export interface ServerGroup {
  id: string;
  name: string;
  policy: ServerGroupPolicy;
  members: string[];
}

/** Nova absolute limits; the fields the overview shows. */
export interface ComputeLimits {
  maxTotalInstances?: number;
  totalInstancesUsed?: number;
  maxTotalCores?: number;
  totalCoresUsed?: number;
  maxTotalRAMSize?: number;
  totalRAMUsed?: number;
  maxTotalKeypairs?: number;
  maxServerGroups?: number;
  totalServerGroupsUsed?: number;
  maxServerGroupMembers?: number;
  maxServerMeta?: number;
  [key: string]: number | undefined;
}

export interface LaunchVolume {
  id: string;
  name: string;
  size_gb: number | null;
  availability_zone: string | null;
  status: string;
  bootable: boolean;
}

export interface LaunchVolumeSnapshot {
  id: string;
  name: string;
  size_gb: number | null;
  status: string;
  volume_id: string | null;
}

export interface LaunchOptions {
  flavors: Flavor[] | null;
  images: Image[] | null;
  snapshots: Image[] | null;
  volumes: LaunchVolume[] | null;
  volume_snapshots: LaunchVolumeSnapshot[] | null;
  networks: Network[] | null;
  key_pairs: Pick<KeyPair, "name" | "type" | "fingerprint">[] | null;
  security_groups: SecurityGroup[] | null;
  availability_zones: AvailabilityZone[] | null;
  server_groups: Pick<ServerGroup, "id" | "name" | "policy">[] | null;
  limits: ComputeLimits | null;
  errors: Record<string, { error: string; message: string }>;
  defaults: {
    create_volume: boolean;
    config_drive: boolean;
    network_ports: boolean;
    classic_network_id: string | null;
    preemptible_notice: string;
  };
}

export type LaunchSourceType =
  "image" | "snapshot" | "volume" | "volume_snapshot";

export interface LaunchRequest {
  name: string;
  count: number;
  source: { type: LaunchSourceType; id: string };
  flavor_id: string;
  availability_zone: string;
  networks: string[];
  ports: string[];
  security_groups: string[];
  key_name: string | null;
  user_data: string | null;
  metadata: Record<string, string>;
  description: string | null;
  server_group_id: string | null;
  delete_volume_on_termination: boolean;
}

export interface LaunchResult {
  ids: string[];
  status: string;
}

export interface ActionResult {
  status: string;
  image_id?: string | null;
}

// --- network -------------------------------------------------------------------

export interface Subnet {
  id: string;
  name: string | null;
  cidr: string | null;
  ip_version: 4 | 6 | null;
  gateway_ip: string | null;
  enable_dhcp: boolean | null;
}

export interface Network {
  id: string;
  name: string;
  description: string;
  status: string | null;
  admin_state_up: boolean | null;
  is_shared: boolean;
  is_external: boolean;
  is_classic: boolean;
  is_project: boolean;
  project_id: string | null;
  mtu: number | null;
  port_security_enabled: boolean | null;
  availability_zones: string[];
  tags: string[];
  subnets: Subnet[];
  created_at: string | null;
  updated_at: string | null;
}

export interface AllocationPool {
  start: string;
  end: string;
}

export interface HostRoute {
  destination: string;
  nexthop: string;
}

export interface SubnetDetail extends Subnet {
  network_id: string | null;
  project_id: string | null;
  allocation_pools: AllocationPool[];
  dns_nameservers: string[];
  host_routes: HostRoute[];
  subnetpool_id: string | null;
  ipv6_address_mode: string | null;
  ipv6_ra_mode: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface FixedIp {
  ip_address: string | null;
  subnet_id: string | null;
}

export interface Port {
  id: string;
  name: string;
  description: string;
  network_id: string | null;
  network_name: string | null;
  project_id: string | null;
  status: string | null;
  admin_state_up: boolean | null;
  mac_address: string | null;
  device_id: string;
  device_owner: string;
  device_type: string | null;
  fixed_ips: FixedIp[];
  security_groups: string[];
  port_security_enabled: boolean | null;
  vnic_type: string | null;
  trunk_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface NetworkDetail extends Network {
  subnets: SubnetDetail[];
  ports: Port[];
}

export interface RouterGateway {
  network_id: string | null;
  network_name: string | null;
  enable_snat: boolean | null;
  fixed_ips: FixedIp[];
}

export interface Router {
  id: string;
  name: string;
  description: string;
  status: string | null;
  admin_state_up: boolean | null;
  project_id: string | null;
  external_gateway: RouterGateway | null;
  routes: HostRoute[];
  availability_zones: string[];
  created_at: string | null;
  updated_at: string | null;
}

export type RouterInterfaceKind = "gateway" | "interface" | "ha" | "other";

export interface RouterInterface extends Port {
  kind: RouterInterfaceKind;
}

export interface RouterDetail extends Router {
  interfaces: RouterInterface[];
}

/** A subnet a router may take an interface on, with its network named. */
export interface InterfaceCandidate extends Subnet {
  network_id: string | null;
  network_name: string | null;
}

export interface FloatingIp {
  id: string;
  floating_ip_address: string | null;
  floating_network_id: string | null;
  pool_name: string | null;
  fixed_ip_address: string | null;
  port_id: string | null;
  router_id: string | null;
  status: string | null;
  description: string;
  dns_name: string;
  dns_domain: string;
  instance_id: string | null;
  instance_name: string | null;
  instance_type: string | null;
  port_forwarding_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface FloatingIpTarget {
  /** `<port id>_<address>`, unique per address. */
  id: string;
  port_id: string;
  ip_address: string;
  instance_id: string | null;
  instance_name: string | null;
  name: string;
}

export interface PortForwarding {
  id: string;
  floating_ip_id: string | null;
  floating_ip_address: string | null;
  protocol: string;
  external_port: string;
  internal_port: string;
  internal_ip_address: string | null;
  internal_port_id: string | null;
  description: string;
}

export interface TrunkSubport {
  port_id: string | null;
  port_name: string | null;
  segmentation_type: string | null;
  segmentation_id: number | null;
}

export interface Trunk {
  id: string;
  name: string;
  description: string;
  status: string | null;
  admin_state_up: boolean | null;
  project_id: string | null;
  port_id: string | null;
  port_name: string | null;
  sub_ports: TrunkSubport[];
  subport_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface TrunkOptions {
  parents: Port[];
  subports: Port[];
}

export interface NetworkExtensions {
  port_forwarding: boolean;
  trunk: boolean;
  dns_integration: boolean;
  extraroute: boolean;
  network_availability_zone: boolean;
  router_availability_zone: boolean;
  subnet_allocation: boolean;
  port_security: boolean;
}

export type NetworkQuota = Record<
  string,
  { used: number; reserved: number; limit: number } | undefined
>;

export interface SubnetPool {
  id: string;
  name: string;
  prefixes: string[];
  ip_version: number | null;
  min_prefixlen: number | null;
  max_prefixlen: number | null;
  default_prefixlen: number | null;
}

export interface NetworkOptions {
  extensions: NetworkExtensions | null;
  availability_zones: { network: string[]; router: string[] } | null;
  subnetpools: SubnetPool[] | null;
  floating_networks: { id: string; name: string }[] | null;
  quota: NetworkQuota | null;
  default_dns_nameservers: string[];
  enable_ipv6: boolean;
  errors: Record<string, { error: string; message: string }>;
}

export interface TopologyRouter {
  id: string;
  name: string;
  status: string | null;
  admin_state_up: boolean | null;
  external_network_id: string | null;
}

export interface TopologyPort {
  id: string;
  name: string;
  network_id: string | null;
  device_id: string;
  device_owner: string;
  status: string | null;
  fixed_ips: FixedIp[];
}

export interface TopologyServer {
  id: string;
  name: string;
  status: string | null;
}

export interface Topology {
  networks: Network[];
  routers: TopologyRouter[];
  ports: TopologyPort[];
  servers: TopologyServer[];
}

export interface SubnetFields {
  name?: string;
  cidr?: string;
  ip_version?: 4 | 6;
  gateway_ip?: string;
  no_gateway?: boolean;
  enable_dhcp?: boolean;
  allocation_pools?: AllocationPool[];
  dns_nameservers?: string[];
  host_routes?: HostRoute[];
  subnetpool_id?: string;
  prefixlen?: number;
}

export interface NetworkCreateRequest {
  name?: string;
  admin_state_up?: boolean;
  mtu?: number;
  availability_zone_hints?: string[];
  subnet?: SubnetFields;
}

export interface SubnetCreateRequest extends SubnetFields {
  network_id: string;
}

export interface SubnetUpdateRequest {
  name?: string;
  gateway_ip?: string;
  no_gateway?: boolean;
  enable_dhcp?: boolean;
  allocation_pools?: AllocationPool[];
  dns_nameservers?: string[];
  host_routes?: HostRoute[];
}

export interface PortCreateRequest {
  network_id: string;
  name?: string;
  admin_state_up?: boolean;
  device_id?: string;
  device_owner?: string;
  subnet_id?: string;
  fixed_ip?: string;
  mac_address?: string;
  port_security_enabled?: boolean;
  security_groups?: string[];
}

export interface PortUpdateRequest {
  name?: string;
  admin_state_up?: boolean;
  port_security_enabled?: boolean;
  security_groups?: string[];
}

export interface RouterCreateRequest {
  name?: string;
  admin_state_up?: boolean;
  external_network_id?: string;
  availability_zone_hints?: string[];
}

export interface AddInterfaceRequest {
  subnet_id: string;
  ip_address?: string;
}

export interface AddInterfaceResult {
  status: string;
  port_id: string | null;
  subnet_id: string;
  ip_address: string | null;
}

export interface FloatingIpAllocateRequest {
  floating_network_id: string;
  floating_ip_address?: string;
  description?: string;
  dns_domain?: string;
  dns_name?: string;
}

export interface PortForwardingRequest {
  protocol: "tcp" | "udp";
  internal_port_id: string;
  internal_ip_address: string;
  internal_port: string;
  external_port: string;
  description?: string;
}

export interface TrunkSubportRequest {
  port_id: string;
  segmentation_type: "vlan" | "inherit";
  segmentation_id?: number;
}

export interface TrunkCreateRequest {
  name?: string;
  description?: string;
  admin_state_up?: boolean;
  port_id: string;
  sub_ports: TrunkSubportRequest[];
}

export interface AttachablePort {
  id: string;
  name: string;
  network_id: string | null;
  network_name: string | null;
  mac_address: string | null;
  fixed_ips: string[];
  status: string | null;
}

export interface SecurityGroupRule {
  id: string;
  direction: "ingress" | "egress";
  ethertype: "IPv4" | "IPv6";
  protocol: string | null;
  port_range_min: number | null;
  port_range_max: number | null;
  remote_ip_prefix: string | null;
  remote_group_id: string | null;
  description: string;
  open_to_the_world: boolean;
}

export interface SecurityGroup {
  id: string;
  name: string;
  description: string;
  project_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  rule_count: number;
  rules?: SecurityGroupRule[];
}

export interface RulePreset {
  id: string;
  name: string;
  protocol: string;
  port?: number;
}

export interface RulePresets {
  items: RulePreset[];
  default_remote_cidr: string;
}

export interface RuleCreate {
  direction: "ingress" | "egress";
  ethertype: "IPv4" | "IPv6";
  preset?: string | null;
  protocol?: string | null;
  port_range_min?: number | null;
  port_range_max?: number | null;
  remote_ip_prefix?: string | null;
  remote_group_id?: string | null;
  description?: string;
}

// --- volumes ------------------------------------------------------------------

export interface VolumeAttachment {
  id: string | null;
  server_id: string | null;
  device: string | null;
  attached_at: string | null;
}

export interface Volume {
  id: string;
  name: string;
  description: string | null;
  size_gb: number | null;
  status: string;
  volume_type: string | null;
  availability_zone: string | null;
  bootable: boolean;
  encrypted: boolean;
  multiattach: boolean;
  attachments: VolumeAttachment[];
  snapshot_id: string | null;
  source_volume_id: string | null;
  image: { id: string; name: string | null } | null;
  group_id: string | null;
  metadata: Record<string, string>;
  created_at: string | null;
  updated_at: string | null;
  /** Null when the listing did not check. */
  has_snapshots: boolean | null;
}

export interface VolumeSnapshot {
  id: string;
  name: string;
  description: string | null;
  size_gb: number | null;
  status: string;
  volume_id: string | null;
  volume_name: string | null;
  progress: string | null;
  group_snapshot_id: string | null;
  metadata: Record<string, string>;
  created_at: string | null;
  updated_at: string | null;
}

export interface VolumeBackup {
  id: string;
  name: string;
  description: string | null;
  size_gb: number | null;
  status: string;
  availability_zone: string | null;
  volume_id: string | null;
  volume_name: string | null;
  snapshot_id: string | null;
  snapshot_name: string | null;
  container: string | null;
  is_incremental: boolean;
  has_dependent_backups: boolean;
  data_timestamp: string | null;
  fail_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface VolumeType {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  /** Zones the type is limited to; null means any zone. */
  zones: string[] | null;
}

export type VolumeLimits = Record<string, number | undefined>;

export interface VolumeOptionImage {
  id: string;
  name: string | null;
  size: number | null;
  min_disk: number;
  disk_format: string | null;
  is_snapshot: boolean;
}

export interface VolumeOptions {
  availability_zones: AvailabilityZone[];
  volume_types: VolumeType[];
  has_zoned_types: boolean;
  images: VolumeOptionImage[];
  snapshots: VolumeSnapshot[];
  volumes: Volume[];
  limits: VolumeLimits;
  errors: Record<string, { error: string; message: string }>;
}

export type VolumeSourceType = "image" | "snapshot" | "volume";

export interface VolumeCreateRequest {
  name?: string;
  description?: string;
  size: number;
  availability_zone?: string;
  volume_type?: string;
  source?: { type: VolumeSourceType; id: string };
}

export interface VolumeUpdateRequest {
  name?: string;
  description?: string;
  bootable?: boolean;
}

export interface SnapshotCreateRequest {
  volume_id: string;
  name?: string;
  description?: string;
}

export interface BackupCreateRequest {
  volume_id: string;
  name: string;
  description?: string;
  container?: string;
  snapshot_id?: string;
  incremental?: boolean;
}

export interface RestoreRequest {
  volume_id?: string;
  name?: string;
  availability_zone?: string;
  volume_type?: string;
}

export interface RestoreResult {
  status: string;
  backup_id: string;
  volume_id: string | null;
  new_volume: boolean;
  volume?: Volume;
}

// --- Nectar panels (members, lookup, credentials, usage, reservations) --------

export interface UserSearchResult {
  id: string;
  displayname: string;
  email: string | null;
}

export interface MemberRow {
  id: string;
  user_id: string;
  name: string;
  role_id: string | null;
  role_name: string;
  is_self: boolean;
  can_remove: boolean;
}

export interface RoleChoice {
  id: string;
  name: string;
}

export interface MembersResponse {
  items: MemberRow[];
  roles: RoleChoice[];
}

export interface MemberAddRequest {
  email: string;
  role_id: string;
}

export interface AppCredRole {
  id: string | null;
  name: string | null;
  domain_id: string | null;
}

export interface AccessRule {
  service?: string;
  method?: string;
  path?: string;
}

export interface ApplicationCredential {
  id: string;
  name: string;
  description: string | null;
  project_id: string | null;
  expires_at: string | null;
  unrestricted: boolean;
  roles: AppCredRole[];
  access_rules: AccessRule[];
  /** Only on the create response, never again. */
  secret?: string | null;
}

export interface ApplicationCredentialOptions {
  roles: string[];
  default_expiration_date: string;
  auth_url: string;
  region: string;
}

export interface ApplicationCredentialCreateRequest {
  name: string;
  description?: string;
  secret?: string;
  expiration_date?: string;
  expiration_time?: string;
  roles: string[];
  access_rules?: string;
  unrestricted: boolean;
}

export interface Ec2Credential {
  access: string;
  secret: string;
  project_id: string;
}

export interface Ec2Response {
  credential: Ec2Credential | null;
  created: boolean;
}

export type CredentialType = "totp" | "ec2" | "cert";

export interface Credential {
  id: string;
  type: string;
  project_id: string | null;
  blob: string;
}

export interface CredentialCreateRequest {
  type: CredentialType;
  blob: string;
  project_id?: string | null;
}

export interface UsageOptions {
  data_from: string;
  default_begin: string;
  default_end: string;
}

export interface UsageInstance {
  id: string;
  name: string;
  rate: number;
  qty: number | null;
  begin: string | null;
  end: string | null;
  display_name: string | null;
  availability_zone: string | null;
  flavor_name: string | null;
  started_at: string | null;
  ended_at: string | null;
}

export interface MostUsed {
  count: number;
  items: { name: string; rate: number }[];
  other: number;
}

export interface UsageInstancesResponse {
  begin: string;
  end: string;
  sum: number;
  items: UsageInstance[];
  most_used: MostUsed;
  partial: boolean;
  errors: { source: string; error: string; message: string }[];
  fetched_at: number;
}

export interface BurnDownPoint {
  date: string;
  value: number | null;
}

export interface AllocationUsage {
  available: boolean;
  reason?: string;
  allocation: AllocationSummary["allocation"];
  su_budget: number | null;
  su_used?: number;
  su_remaining?: number;
  total_hours?: number;
  today?: string;
  day_budget?: number | null;
  on_track?: number | null;
  budget_tracking?: number | null;
  at_risk?: boolean;
  cumulative?: BurnDownPoint[];
  guide?: { date: string; value: number }[];
  partial: boolean;
  errors: { source: string; error: string; message: string }[];
  fetched_at: number;
}

export interface ReservationFlavor {
  id: string | null;
  name: string | null;
  description: string | null;
  category: string | null;
  availability_zone: string | null;
  vcpu: number | null;
  memory_mb: number | null;
  disk_gb: number | null;
  ephemeral_gb: number | null;
  max_length_hours: number | null;
  max_days: number;
  rate: number | null;
  is_public: boolean | null;
  active: boolean | null;
  slots: number | null;
  start: string | null;
  end: string | null;
}

export interface ReservationLimits {
  max_hours: number | null;
  hours_used: number;
  hours_left: number | null;
  max_days: number | null;
  days_used: number;
  days_left: number | null;
  max_reservations: number | null;
  reservations_used: number;
  reservations_left: number | null;
  can_create: boolean;
}

export type ReservationStatus =
  "PENDING_CREATE" | "ALLOCATED" | "ACTIVE" | "COMPLETE" | "ERROR";

export type ReservationAction = "launch" | "extend" | "calendar" | "delete";

export interface Reservation {
  id: string;
  status: ReservationStatus | string;
  status_help: string;
  status_reason: string | null;
  start: string | null;
  end: string | null;
  created_at: string | null;
  instance_count: number | null;
  compute_flavor: string | null;
  flavor: ReservationFlavor;
  actions: ReservationAction[];
  calendar?: { google: string; outlook: string; outlook_personal: string };
  detail_url?: string;
}

export interface ReservationsResponse {
  items: Reservation[];
  limits: ReservationLimits;
}

export interface MaintenanceWindow {
  id: string | null;
  start: string | null;
  end: string | null;
  note: string | null;
  flavors: { id: string | null; name: string | null }[];
}

export interface ReservationOptions {
  limits: ReservationLimits;
  flavors: ReservationFlavor[];
  categories: string[];
  availability_zones: string[];
  maintenance_windows: MaintenanceWindow[];
  su_used: number | null;
  su_budget: number | null;
  today: string;
}

export interface FreeSlot {
  flavor_id: string;
  start: string | null;
  end: string | null;
  /** The whole UTC days the slot can be reserved for, inclusive. */
  first_day: string;
  last_day: string;
}

export interface SlotsResponse {
  start: string;
  end: string;
  flavors: ReservationFlavor[];
  slots: FreeSlot[];
}

export interface ReservationCreateRequest {
  flavor_id: string;
  start: string;
  end: string;
}

export interface ExtendWindow {
  available: boolean;
  eligible_days: number;
  min_end?: string;
  max_end: string | null;
}

// --- object store --------------------------------------------------------------

export interface StorePolicy {
  name: string;
  default: boolean;
}

export interface StoreInfo {
  upload_mode: "tempurl" | "proxy";
  max_file_size: number | null;
  segment_bytes: number;
  proxy_max_bytes: number;
  slo: boolean;
  bulk_delete: number | null;
  policies: StorePolicy[];
  account: {
    container_count: number;
    object_count: number;
    bytes: number;
    quota_containers: string | null;
    quota_bytes: string | null;
  };
  public_url: string;
}

export interface Container {
  name: string;
  object_count: number;
  bytes: number;
  public_url: string;
}

/** `truncated` is true when the account holds more containers than the
 * backend lists. */
export interface ContainersResponse {
  items: Container[];
  truncated: boolean;
}

export interface ContainerDetail extends Container {
  is_public: boolean;
  read_acl: string | null;
  storage_policy: string | null;
  cors_origin: string | null;
  metadata: Record<string, string>;
  timestamp: string | null;
}

export interface StoreObject {
  name: string;
  basename: string;
  is_folder: boolean;
  bytes: number;
  content_type: string | null;
  hash: string | null;
  last_modified: string | null;
}

export interface ObjectListing {
  container: string;
  prefix: string;
  items: StoreObject[];
  has_more: boolean;
  next_marker: string | null;
}

export interface ObjectDetail {
  name: string;
  container: string;
  orig_filename: string | null;
  bytes: number;
  content_type: string | null;
  hash: string | null;
  last_modified: string | null;
  timestamp: string | null;
  is_slo: boolean;
  manifest: string | null;
  metadata: Record<string, string>;
}

export interface UploadSegment {
  offset: number;
  length: number;
  path: string;
  url: string;
}

export interface UploadPlanObject {
  name: string;
  size: number;
  url: string | null;
  manifest: boolean;
  segments: UploadSegment[] | null;
}

export interface UploadPlan {
  mode: "tempurl" | "proxy";
  expires_in?: number;
  max_bytes?: number;
  objects: UploadPlanObject[];
}

export interface ContainerCreateRequest {
  name: string;
  is_public: boolean;
  storage_policy?: string;
}

export interface CopyObjectRequest {
  dest_container: string;
  dest_name: string;
}

export interface DeleteObjectsResult {
  deleted: number;
  failed: string[];
}

// --- kubernetes ----------------------------------------------------------------

export interface ClusterTemplate {
  id: string;
  name: string;
  coe: string | null;
  image_id: string | null;
  flavor_id: string | null;
  master_flavor_id: string | null;
  keypair_id: string | null;
  network_driver: string | null;
  external_network_id: string | null;
  fixed_network: string | null;
  fixed_subnet: string | null;
  dns_nameserver: string | null;
  master_lb_enabled: boolean | null;
  floating_ip_enabled: boolean | null;
  tls_disabled: boolean | null;
  public: boolean | null;
  hidden: boolean | null;
  server_type: string | null;
  cluster_distro: string | null;
  volume_driver: string | null;
  docker_storage_driver: string | null;
  docker_volume_size: number | null;
  registry_enabled: boolean | null;
  labels: Record<string, string>;
  kubernetes_version: string | null;
  availability_zone: string | null;
  template_version: string | null;
  upgrade_targets: string[];
  created_at: string | null;
  updated_at: string | null;
}

export type ClusterAction =
  "config" | "certificate" | "sign" | "upgrade" | "nodegroups" | "delete";

export interface Cluster {
  id: string;
  name: string;
  status: string | null;
  status_reason: string | null;
  health_status: string | null;
  health_status_reason: Record<string, string> | string | null;
  master_count: number | null;
  node_count: number | null;
  coe_version: string | null;
  cluster_template_id: string | null;
  template_name: string | null;
  keypair: string | null;
  api_address: string | null;
  master_addresses: string[];
  node_addresses: string[];
  master_flavor_id: string | null;
  flavor_id: string | null;
  create_timeout: number | null;
  labels: Record<string, string>;
  availability_zone: string | null;
  network_driver: string | null;
  kubernetes_version: string | null;
  upgrade_targets: string[];
  stack_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  actions: ClusterAction[];
}

export interface ClusterQuota {
  clusters: number | null;
  nodes: number | null;
  hard_limit: number;
}

export interface ClustersResponse {
  items: Cluster[];
  quota: ClusterQuota;
}

export interface TemplateCombination {
  kubernetes_version: string;
  availability_zone: string;
  network_driver: string;
  template_id: string;
}

export interface ClusterFlavor {
  name: string | null;
  vcpus: number | null;
  ram_mb: number | null;
  disk_gb: number | null;
}

export interface ClusterOptions {
  versions: string[];
  availability_zones: string[];
  network_drivers: string[];
  combinations: TemplateCombination[];
  templates: ClusterTemplate[];
  flavors: ClusterFlavor[];
  control_plane_sizes: number[];
  quota: ClusterQuota;
}

export interface ClusterCreateRequest {
  name: string;
  cluster_template_id: string;
  master_count: number;
  master_flavor_id: string;
  node_count: number;
  flavor_id: string;
  etcd_volume_size?: number;
  etcd_volume_type?: string;
}

export interface UpgradeTarget {
  template_id: string;
  name: string;
  kubernetes_version: string | null;
}

export interface UpgradeOptions {
  cluster_id: string;
  can_upgrade: boolean;
  current_version: string | null;
  targets: UpgradeTarget[];
}

export interface NodeTaint {
  key: string;
  value: string;
  effect: string;
}

export interface NodeGroup {
  id: string;
  name: string;
  role: string | null;
  is_default: boolean;
  status: string | null;
  status_reason: string | null;
  flavor_id: string | null;
  image_id: string | null;
  node_count: number | null;
  min_node_count: number | null;
  max_node_count: number | null;
  node_addresses: string[];
  labels: Record<string, string>;
  auto_scaling: boolean;
  node_labels: Record<string, string>;
  node_taints: NodeTaint[];
  created_at: string | null;
  updated_at: string | null;
}

export interface NodeGroupsResponse {
  items: NodeGroup[];
  can_change: boolean;
  cluster_status: string | null;
}

export interface NodeGroupCreateRequest {
  name: string;
  flavor_id: string;
  node_count: number;
  autoscaling: boolean;
  min_node_count?: number;
  max_node_count?: number;
  boot_volume_size?: number;
  boot_volume_type?: string;
  node_labels?: string;
  node_taints?: string;
}

export interface ClusterConfig {
  name: string | null;
  api_address: string;
  kubeconfig: string;
  key: string | null;
  ca: string | null;
  cert: string | null;
}

// --- load balancers --------------------------------------------------------------

export interface LoadBalancer {
  id: string;
  name: string | null;
  description: string | null;
  provisioning_status: string | null;
  operating_status: string | null;
  admin_state_up: boolean | null;
  vip_address: string | null;
  vip_port_id: string | null;
  vip_subnet_id: string | null;
  vip_network_id: string | null;
  provider: string | null;
  flavor_id: string | null;
  availability_zone: string | null;
  listeners: string[];
  pools: string[];
  floating_ip: { id: string; address: string } | null;
  created_at: string | null;
  updated_at: string | null;
  can_delete: boolean;
  is_transitional: boolean;
  chain?: ChainState | null;
}

export interface ChainState {
  steps: string[];
  done: string[];
  error: string | null;
  started: number;
}

export interface Listener {
  id: string;
  name: string | null;
  description: string | null;
  protocol: string;
  protocol_port: number;
  provisioning_status: string | null;
  operating_status: string | null;
  admin_state_up: boolean | null;
  connection_limit: number | null;
  default_pool_id: string | null;
  loadbalancer_id: string | null;
  timeout_client_data: number | null;
  timeout_member_connect: number | null;
  timeout_member_data: number | null;
  timeout_tcp_inspect: number | null;
  allowed_cidrs: string[];
  insert_headers: Record<string, string>;
  default_tls_container_ref: string | null;
  sni_container_refs: string[];
  tls_ciphers: string | null;
  l7policies: string[];
  created_at: string | null;
  updated_at: string | null;
}

export interface Member {
  id: string;
  name: string | null;
  address: string;
  protocol_port: number;
  subnet_id: string | null;
  weight: number | null;
  backup: boolean | null;
  monitor_address: string | null;
  monitor_port: number | null;
  provisioning_status: string | null;
  operating_status: string | null;
  admin_state_up: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Pool {
  id: string;
  name: string | null;
  description: string | null;
  protocol: string | null;
  lb_algorithm: string | null;
  provisioning_status: string | null;
  operating_status: string | null;
  admin_state_up: boolean | null;
  session_persistence: { type: string; cookie_name?: string | null } | null;
  tls_enabled: boolean | null;
  tls_ciphers: string | null;
  healthmonitor_id: string | null;
  listeners: string[];
  loadbalancer_id: string | null;
  members: string[];
  member_rows?: Member[];
  created_at: string | null;
  updated_at: string | null;
}

export interface HealthMonitor {
  id: string;
  name: string | null;
  type: string;
  delay: number | null;
  timeout: number | null;
  max_retries: number | null;
  max_retries_down: number | null;
  http_method: string | null;
  url_path: string | null;
  expected_codes: string | null;
  provisioning_status: string | null;
  operating_status: string | null;
  admin_state_up: boolean | null;
  pools: string[];
  created_at: string | null;
  updated_at: string | null;
}

export interface L7Rule {
  id: string;
  type: string;
  compare_type: string;
  key: string | null;
  value: string;
  invert: boolean | null;
  provisioning_status: string | null;
  operating_status: string | null;
  admin_state_up: boolean | null;
}

export interface L7Policy {
  id: string;
  name: string | null;
  description: string | null;
  action: string;
  position: number | null;
  redirect_url: string | null;
  redirect_pool_id: string | null;
  redirect_prefix: string | null;
  listener_id: string | null;
  provisioning_status: string | null;
  operating_status: string | null;
  admin_state_up: boolean | null;
  rules: string[];
  rule_rows?: L7Rule[];
  created_at: string | null;
  updated_at: string | null;
}

export interface LoadBalancerTree {
  load_balancer: LoadBalancer;
  chain: ChainState | null;
  listeners: Listener[];
  pools: Pool[];
  monitors: HealthMonitor[];
  l7policies: L7Policy[];
}

export interface LbSubnet {
  id: string;
  name: string | null;
  cidr: string | null;
  network_id: string | null;
  network_name: string | null;
  ip_version: number | null;
}

export interface LbInstance {
  id: string;
  name: string | null;
  status: string | null;
  addresses: { address: string; subnet_id: string }[];
}

export interface LoadBalancerOptions {
  subnets: LbSubnet[];
  flavors: { id: string; name: string; description: string | null }[];
  availability_zones: { name: string; description: string | null }[];
  quota: Record<string, number>;
  instances: LbInstance[];
  listener_protocols: string[];
  pool_protocols: string[];
  algorithms: string[];
  persistence_types: string[];
  monitor_types: string[];
  http_methods: string[];
  l7_actions: string[];
  l7_rule_types: string[];
  l7_compare_types: string[];
}

export interface ListenerSpec {
  name?: string;
  description?: string;
  protocol: string;
  protocol_port: number;
  connection_limit?: number;
  timeout_client_data?: number;
  timeout_member_connect?: number;
  timeout_member_data?: number;
  timeout_tcp_inspect?: number;
  allowed_cidrs?: string[];
  insert_headers?: Record<string, boolean>;
  default_tls_container_ref?: string;
  sni_container_refs?: string[];
  tls_ciphers?: string;
  default_pool_id?: string;
  admin_state_up?: boolean;
}

export interface PoolSpec {
  name?: string;
  description?: string;
  protocol?: string;
  lb_algorithm: string;
  session_persistence?: {
    type?: string | null;
    cookie_name?: string | null;
  } | null;
  tls_enabled?: boolean;
  tls_ciphers?: string;
  admin_state_up?: boolean;
}

export interface MemberSpec {
  name?: string;
  address: string;
  subnet_id?: string;
  protocol_port: number;
  weight?: number;
  monitor_address?: string;
  monitor_port?: number;
  backup?: boolean;
  admin_state_up?: boolean;
}

export interface MonitorSpec {
  name?: string;
  type: string;
  delay?: number;
  timeout?: number;
  max_retries?: number;
  max_retries_down?: number;
  http_method?: string;
  url_path?: string;
  expected_codes?: string;
  admin_state_up?: boolean;
}

export interface LoadBalancerCreateRequest {
  name?: string;
  description?: string;
  vip_subnet_id: string;
  vip_address?: string;
  flavor_id?: string;
  availability_zone?: string;
  admin_state_up?: boolean;
  listener?: ListenerSpec;
  pool?: PoolSpec;
  members?: MemberSpec[];
  monitor?: MonitorSpec;
}

export interface L7PolicySpec {
  name?: string;
  description?: string;
  action: string;
  redirect_url?: string;
  redirect_pool_id?: string;
  redirect_prefix?: string;
  position?: number;
  admin_state_up?: boolean;
}

export interface L7RuleSpec {
  type: string;
  compare_type: string;
  key?: string;
  value: string;
  invert?: boolean;
  admin_state_up?: boolean;
}

/** PATCH /api/load-balancers/listeners/{id} (`ListenerUpdate`). An omitted
 * key is left unchanged; `default_pool_id: null` detaches the pool. */
export interface ListenerUpdate {
  name?: string;
  description?: string;
  connection_limit?: number;
  timeout_client_data?: number;
  timeout_member_connect?: number;
  timeout_member_data?: number;
  timeout_tcp_inspect?: number;
  allowed_cidrs?: string[];
  insert_headers?: Record<string, boolean>;
  default_tls_container_ref?: string;
  sni_container_refs?: string[];
  tls_ciphers?: string | null;
  default_pool_id?: string | null;
  admin_state_up?: boolean;
}

/** PATCH /api/load-balancers/pools/{id} (`PoolUpdate`);
 * `session_persistence: null` turns persistence off. */
export interface PoolUpdate {
  name?: string;
  description?: string;
  lb_algorithm?: string;
  session_persistence?: { type: string; cookie_name?: string } | null;
  tls_enabled?: boolean;
  tls_ciphers?: string | null;
  admin_state_up?: boolean;
}

/** PATCH /api/load-balancers/pools/{pool}/members/{id} (`MemberUpdate`);
 * null monitor fields clear the alternate monitor address. */
export interface MemberUpdate {
  name?: string;
  weight?: number;
  monitor_address?: string | null;
  monitor_port?: number | null;
  backup?: boolean;
  admin_state_up?: boolean;
}

// --- orchestration (Heat) ------------------------------------------------------

export interface Stack {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  status_reason: string | null;
  creation_time: string | null;
  updated_time: string | null;
  deletion_time: string | null;
  timeout_mins: number | null;
  disable_rollback: boolean | null;
  tags: string[];
  parent: string | null;
  stack_owner: string | null;
  is_transitional: boolean;
  actions: string[];
}

export interface StackOutput {
  key: string | null;
  value: unknown;
  description: string | null;
  error: string | null;
}

export interface StackDetail extends Stack {
  parameters: Record<string, unknown>;
  outputs: StackOutput[];
  capabilities: string[];
  notification_topics: string[];
  template_description: string | null;
}

export interface StackResource {
  name: string | null;
  logical_id: string | null;
  physical_id: string | null;
  type: string | null;
  status: string | null;
  status_reason: string | null;
  updated_time: string | null;
  creation_time: string | null;
  required_by: string[];
  is_transitional: boolean;
  attributes: Record<string, unknown> | null;
  description: string | null;
}

export interface StackEvent {
  id: string | null;
  resource_name: string | null;
  logical_id: string | null;
  physical_id: string | null;
  status: string | null;
  status_reason: string | null;
  event_time: string | null;
}

export interface StackTemplate {
  template: Record<string, unknown>;
  template_yaml: string;
  environment: Record<string, unknown>;
  environment_yaml: string;
}

export interface ParameterSpec {
  name: string;
  type:
    "string" | "number" | "comma_delimited_list" | "json" | "boolean" | string;
  label: string;
  description: string;
  group: string | null;
  default: unknown;
  no_echo: boolean;
  required: boolean;
  allowed_values: string[] | null;
  allowed_pattern: string | null;
  min_length: number | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  custom_constraint: string | null;
  constraint_description: string | null;
}

export interface TemplateValidation {
  description: string | null;
  parameters: ParameterSpec[];
}

export interface TemplateSource {
  template?: string;
  template_url?: string;
  environment?: string;
  files?: Record<string, string>;
}

export interface StackCreateRequest extends TemplateSource {
  name: string;
  parameters: Record<string, unknown>;
  timeout_mins: number;
  rollback: boolean;
  tags?: string[];
}

export interface StackUpdateRequest extends TemplateSource {
  parameters: Record<string, unknown>;
  timeout_mins?: number;
  rollback?: boolean;
  existing?: boolean;
}

export interface ResourceTypeSummary {
  name: string | null;
  description: string | null;
}

export interface ResourceTypeDetail {
  name: string;
  attributes: Record<string, { description?: string; type?: string }>;
  properties: Record<string, Record<string, unknown>>;
  support_status: Record<string, unknown> | null;
  template: Record<string, unknown>;
  template_yaml: string;
}

export interface TemplateVersion {
  version: string;
  type: string;
  aliases?: string[];
}

export interface TemplateFunction {
  functions: string;
  description: string;
}

// --- dns (Designate) -----------------------------------------------------------

export interface Zone {
  id: string;
  name: string;
  type: string | null;
  email: string | null;
  ttl: number | null;
  serial: number | null;
  description: string | null;
  status: string | null;
  action: string | null;
  masters: string[];
  shared: boolean;
  created_at: string | null;
  updated_at: string | null;
  is_transitional: boolean;
}

export interface ZonesResponse extends Items<Zone> {
  quota: Record<string, number>;
  record_types: string[];
}

export interface ZoneCreateRequest {
  name: string;
  email: string;
  ttl?: number;
  description?: string;
  type?: "PRIMARY" | "SECONDARY";
  masters?: string[];
}

export interface RecordSet {
  id: string;
  zone_id: string | null;
  name: string | null;
  type: string | null;
  ttl: number | null;
  description: string | null;
  records: string[];
  status: string | null;
  action: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_transitional: boolean;
  can_edit: boolean;
}

export interface RecordSetsResponse extends Items<RecordSet> {
  zone: Zone;
}

export interface RecordSetCreateRequest {
  name: string;
  type: string;
  records: string[];
  ttl?: number;
  description?: string;
}

// --- shares (Manila) -----------------------------------------------------------

export interface ShareType {
  id: string;
  name: string | null;
  description: string | null;
  is_public: boolean;
  driver_handles_share_servers: boolean;
  snapshot_support: boolean;
  extra_specs: Record<string, string>;
}

export interface ShareOptions {
  protocols: string[];
  share_types: ShareType[];
  availability_zones: string[];
  snapshots: {
    id: string;
    name: string | null;
    size: number;
    share_id: string;
  }[];
  share_groups: {
    id: string;
    name: string | null;
    availability_zone: string | null;
  }[];
  share_group_types: {
    id: string;
    name: string | null;
    share_types: string[];
    group_specs: Record<string, string>;
  }[];
  quota: Record<string, number>;
  can_create: boolean;
  create_reason: string | null;
  can_snapshot: boolean;
  snapshot_reason: string | null;
  access_types: string[];
  access_levels: string[];
  security_service_types: string[];
  /** Share id to the one snapshot revert accepts (the newest). */
  newest_snapshot_ids: Record<string, string>;
}

export interface Share {
  id: string;
  name: string | null;
  description: string | null;
  size: number | null;
  status: string | null;
  protocol: string | null;
  is_public: boolean;
  share_type: string | null;
  share_type_id: string | null;
  availability_zone: string | null;
  share_group_id: string | null;
  snapshot_id: string | null;
  metadata: Record<string, string>;
  created_at: string | null;
  snapshot_support: boolean;
  revert_to_snapshot_support: boolean;
  mount_snapshot_support: boolean;
  has_snapshot: boolean;
  is_transitional: boolean;
  actions: string[];
}

export interface ShareAccessRule {
  id: string;
  access_type: string | null;
  access_to: string | null;
  access_level: string | null;
  state: string | null;
  access_key: string | null;
  metadata: Record<string, string>;
  created_at: string | null;
  updated_at: string | null;
}

export interface ShareDetail extends Share {
  host: string | null;
  task_state: string | null;
  export_locations: {
    path: string | null;
    preferred: boolean;
    id: string | null;
  }[];
  access_rules: ShareAccessRule[];
  /** The one snapshot revert accepts (the newest), or null. */
  newest_snapshot_id: string | null;
}

export interface SharesResponse extends Items<Share> {
  quota: Record<string, number>;
  can_create: boolean;
  create_reason: string | null;
}

export interface ShareCreateRequest {
  name: string;
  description?: string;
  protocol: string;
  size: number;
  share_type: string;
  availability_zone?: string;
  snapshot_id?: string;
  share_group_id?: string;
  metadata?: string;
  is_public?: boolean;
}

export interface ShareAccessResponse extends Items<ShareAccessRule> {
  share: Share;
  can_add: boolean;
}

export interface ShareSnapshot {
  id: string;
  name: string | null;
  description: string | null;
  size: number | null;
  status: string | null;
  share_id: string | null;
  share_name: string | null;
  share_proto: string | null;
  share_size: number | null;
  created_at: string | null;
  is_transitional: boolean;
  actions: string[];
}

export interface ShareSnapshotDetail extends ShareSnapshot {
  mount_snapshot_support: boolean;
  export_locations?: { path?: string; is_admin_only?: boolean; id?: string }[];
  access_rules?: {
    id: string;
    access_type?: string;
    access_to?: string;
    state?: string;
  }[];
}

export interface ShareSnapshotsResponse extends Items<ShareSnapshot> {
  quota: Record<string, number>;
}

export interface SecurityService {
  id: string;
  name: string | null;
  description: string | null;
  type: string | null;
  type_label: string | null;
  dns_ip: string | null;
  ou: string | null;
  server: string | null;
  domain: string | null;
  user: string | null;
  status: string | null;
  created_at: string | null;
}

/** backend/hive/schemas/shares.py `SecurityServiceCreate.type`. */
export type SecurityServiceType = "active_directory" | "ldap" | "kerberos";

/** POST /api/shares/security-services (`SecurityServiceCreate`). */
export interface SecurityServiceCreateRequest {
  name: string;
  type: SecurityServiceType;
  dns_ip: string;
  server: string;
  domain: string;
  ou?: string | null;
  user?: string | null;
  password?: string | null;
  description?: string | null;
}

/** PATCH /api/shares/security-services/{id} (`SecurityServiceUpdate`). */
export interface SecurityServiceUpdateRequest {
  name?: string | null;
  dns_ip?: string | null;
  server?: string | null;
  domain?: string | null;
  ou?: string | null;
  user?: string | null;
  password?: string | null;
  description?: string | null;
}

/**
 * @deprecated The pre-split loose shape, kept only until
 * features/shares/api.ts moves to SecurityServiceCreateRequest and
 * SecurityServiceUpdateRequest.
 */
export interface SecurityServiceRequest {
  name: string;
  type?: string;
  dns_ip?: string;
  server?: string;
  domain?: string;
  ou?: string;
  user?: string;
  password?: string;
  description?: string;
}

export interface ShareGroup {
  id: string;
  name: string | null;
  description: string | null;
  status: string | null;
  availability_zone: string | null;
  share_group_type_id: string | null;
  share_types: string[];
  source_share_group_snapshot_id: string | null;
  consistent_snapshot_support: string | null;
  created_at: string | null;
  is_transitional: boolean;
  actions: string[];
}

export interface ShareGroupDetail extends ShareGroup {
  share_types_detail: { id: string; name: string | null }[];
  members: Share[];
}

export interface ShareGroupSnapshot {
  id: string;
  name: string | null;
  description: string | null;
  status: string | null;
  share_group_id: string | null;
  share_group_name: string | null;
  created_at: string | null;
  members: unknown[];
  is_transitional: boolean;
  actions: string[];
}

// --- databases (Trove) ---------------------------------------------------------

export interface DbFlavor {
  id: string | null;
  name: string | null;
  ram: number | null;
  vcpus: number | null;
  disk: number | null;
  ephemeral: number | null;
}

export interface DatastoreOption {
  datastore: string | null;
  datastore_id: string | null;
  version: string | null;
  version_id: string | null;
  label: string;
}

export interface DbQuota {
  max_instances: number | null;
  max_backups: number | null;
  max_volumes: number | null;
  max_ram: number | null;
}

export interface DbInstance {
  id: string;
  name: string | null;
  status: string | null;
  status_kind: "ok" | "error" | "transitional" | "unknown";
  operating_status: string | null;
  datastore: string | null;
  datastore_version: string | null;
  flavor_id: string | null;
  flavor_name: string | null;
  ram: number | null;
  hostname: string | null;
  addresses: string[];
  volume_size: number | null;
  volume_used: number | null;
  region: string | null;
  created: string | null;
  updated: string | null;
  configuration: { id: string; name?: string | null } | DbConfiguration | null;
  replica_of: unknown;
  replicas: unknown[];
  is_transitional: boolean;
  actions: string[];
}

export interface DbInstanceDetail extends DbInstance {
  allowed_cidrs: string[];
  is_public: boolean;
  addresses_detail: { type?: string; address?: string }[];
  availability_zone: string | null;
  fault: { message?: string; details?: string; created?: string } | null;
  service_status_updated: string | null;
  port: number | null;
  cidr_warning: string | null;
}

export interface DbInstancesResponse extends Items<DbInstance> {
  quota: DbQuota;
}

export interface DbOptions {
  datastores: DatastoreOption[];
  flavors: DbFlavor[];
  flavors_by_version: Record<string, DbFlavor[]>;
  availability_zones: string[];
  networks: { id: string; name: string | null; classic: boolean }[];
  configurations: DbConfiguration[];
  backups: DbBackup[];
  quota: DbQuota;
  default_cidr: string;
}

export interface DbLaunchRequest {
  name: string;
  flavor: string;
  volume: number;
  datastore: string;
  version: string;
  network_id: string;
  availability_zone?: string;
  allowed_cidrs: string[];
  databases?: string;
  user?: string;
  password?: string;
  host?: string;
  configuration?: string;
  backup_id?: string;
}

export interface DbUser {
  name: string | null;
  host: string;
  databases: string[];
}

export interface DbBackup {
  id: string;
  name: string | null;
  description: string | null;
  status: string | null;
  status_kind: "ok" | "error" | "transitional" | "unknown";
  datastore: string | null;
  datastore_version: string | null;
  instance_id: string | null;
  instance_name: string | null;
  parent_id: string | null;
  incremental: boolean;
  size: number | null;
  location: string | null;
  created: string | null;
  updated: string | null;
  is_transitional: boolean;
  can_restore: boolean;
}

export interface DbBackupDetail extends DbBackup {
  instance_status?: string | null;
  parent_name?: string | null;
}

export interface DbBackupsResponse extends Items<DbBackup> {
  quota: DbQuota;
  instances: { id: string; name: string | null }[];
}

export interface DbConfiguration {
  id: string;
  name: string | null;
  description: string | null;
  datastore: string | null;
  datastore_version: string | null;
  datastore_version_id: string | null;
  values: Record<string, unknown>;
  created: string | null;
  updated: string | null;
}

export interface DbParameterSpec {
  name: string | null;
  type: string | null;
  min: number | null;
  max: number | null;
  restart_required: boolean;
}

export interface DbConfigurationDetail extends DbConfiguration {
  instances: { id: string; name: string | null }[];
  parameters: DbParameterSpec[];
}

export interface DbConfigurationsResponse extends Items<DbConfiguration> {
  datastores: DatastoreOption[];
}

export interface DbResizeFlavors extends Items<DbFlavor> {
  current: string | null;
  datastore: string | null;
  datastore_version: string | null;
}

export interface DbConfigDefault {
  name: string;
  value: string | number | boolean | null;
}

export interface DbLog {
  name: string | null;
  type: string | null;
  status: string | null;
  status_kind: "ok" | "error" | "warning" | "unknown";
  published: number;
  pending: number;
  container: string | null;
  prefix: string | null;
  metafile: string | null;
  actions: string[];
}

export interface DbLogContents {
  name: string;
  lines: number;
  text: string;
  partial: boolean;
  truncated: boolean;
  parts: number;
  published: number;
}
