// Mocked API for the compute panels (instances, flavors, images, key
// pairs, server groups), security groups and API access.
// The in-memory state is the backend for one page load; handlers change
// it in place, so a create or delete shows up in the following list.
import { http, HttpResponse } from "msw";
import type {
  ComputeLimits,
  Flavor,
  FlavorClass,
  Image,
  Instance,
  InstanceAction,
  InstanceDetail,
  InstancePort,
  InstanceVolume,
  KeyPairCreated,
  KeyPairDetail,
  LaunchOptions,
  ServerGroup,
} from "../../lib/api/types/compute";
import type {
  AttachablePort,
  Network,
  RulePreset,
  SecurityGroup,
  SecurityGroupDetail,
  SecurityGroupRule,
} from "../../lib/api/types/network";
import { nextId, PROJECT_ID, USER_ID } from "../ids";
import { apiError, notFound, readBody, type Reply } from "../http";
import {
  launchVolumes,
  launchVolumeSnapshots,
  volumeTypes,
} from "../volumes/handlers";
import {
  imageCreateBody,
  instanceActionBody,
  imageUpdateBody,
  instanceUpdateBody,
  keyPairCreateBody,
  launchBody,
  ruleCreateBody,
  securityGroupCreateBody,
  securityGroupUpdateBody,
  serverGroupCreateBody,
} from "./schemas";

const CLASSIC = "00000000-0000-0000-0000-000000000000";

/**
 * The flavours, with the `flavor_class:name` values Nectar's flavours carry
 * (backend/hive/nectar/flavors.py, FLAVOR_CLASSES), one with no class and
 * the Blazar flavour of the mock reservation res-1 (mocks/nectar). The
 * first three are the seeded instances' flavours.
 */
const flavors: Flavor[] = [
  {
    id: "f-small",
    name: "m3.small",
    vcpus: 2,
    ram_mb: 4096,
    disk_gb: 30,
    ephemeral_gb: 0,
    swap_mb: 0,
    is_public: true,
    flavor_class: "standard-v3",
    su_rate: 0.5,
    is_preemptible: false,
    is_reservation: false,
    reservation_id: null,
    extra_specs: { "nectar:rate": "0.5", "flavor_class:name": "standard-v3" },
  },
  {
    id: "f-medium",
    name: "m3.medium",
    vcpus: 4,
    ram_mb: 8192,
    disk_gb: 30,
    ephemeral_gb: 0,
    swap_mb: 0,
    is_public: true,
    flavor_class: "standard-v3",
    su_rate: 1,
    is_preemptible: false,
    is_reservation: false,
    reservation_id: null,
    extra_specs: { "nectar:rate": "1", "flavor_class:name": "standard-v3" },
  },
  {
    id: "f-pre",
    name: "p3.small",
    vcpus: 2,
    ram_mb: 4096,
    disk_gb: 30,
    ephemeral_gb: 0,
    swap_mb: 0,
    is_public: true,
    flavor_class: "preemptible",
    su_rate: 0.1,
    is_preemptible: true,
    is_reservation: false,
    reservation_id: null,
    extra_specs: { "nectar:rate": "0.1", "flavor_class:name": "preemptible" },
  },
  {
    id: "f-tiny",
    name: "t3.xsmall",
    vcpus: 1,
    ram_mb: 1024,
    disk_gb: 10,
    ephemeral_gb: 0,
    swap_mb: 0,
    is_public: true,
    flavor_class: "tiny-v3",
    su_rate: 0.25,
    is_preemptible: false,
    is_reservation: false,
    reservation_id: null,
    extra_specs: { "nectar:rate": "0.25", "flavor_class:name": "tiny-v3" },
  },
  // No flavour class: the wizard lists it under "Other".
  {
    id: "f-test",
    name: "test.large",
    vcpus: 8,
    ram_mb: 8192,
    disk_gb: 30,
    ephemeral_gb: 0,
    swap_mb: 0,
    is_public: true,
    flavor_class: null,
    su_rate: 0.134,
    is_preemptible: false,
    is_reservation: false,
    reservation_id: null,
    extra_specs: { "nectar:rate": "0.134" },
  },
  // Blazar copies the source flavour's specs and adds the reservation's.
  {
    id: "r-f1",
    name: "reservation:r-f1",
    vcpus: 16,
    ram_mb: 16384,
    disk_gb: 10,
    ephemeral_gb: 0,
    swap_mb: 0,
    is_public: false,
    flavor_class: "standard-v3",
    su_rate: 5.562,
    is_preemptible: false,
    is_reservation: true,
    reservation_id: "r-f1",
    extra_specs: {
      "nectar:rate": "5.562",
      "flavor_class:name": "standard-v3",
      "aggregate_instance_extra_specs:reservation": "r-f1",
    },
  },
];

/** An image; it was last updated when it was created unless told otherwise. */
function image(
  overrides: Partial<Image> & { id: string; name: string },
): Image {
  const created = overrides.created_at ?? "2026-09-01T00:00:00Z";
  return {
    status: "active",
    visibility: "public",
    owner: "p-nectar",
    is_owner: false,
    is_snapshot: false,
    size: 650_000_000,
    disk_format: "qcow2",
    container_format: "bare",
    min_disk: 0,
    min_ram: 0,
    created_at: created,
    updated_at: created,
    protected: false,
    checksum: "6f2c1d9e8a7b4c3d2e1f0a9b8c7d6e5f",
    os_distro: null,
    os_version: null,
    tags: [],
    properties: {},
    ...overrides,
  };
}

export let images: Image[] = [
  image({
    id: "img-ubuntu",
    name: "NeCTAR Ubuntu 24.04 LTS (Noble) amd64",
    os_distro: "ubuntu",
    os_version: "24.04",
    min_disk: 10,
    protected: true,
    properties: { default_user: "ubuntu" },
  }),
  image({
    id: "img-rocky",
    name: "NeCTAR Rocky Linux 9",
    os_distro: "rocky",
    min_disk: 10,
    protected: true,
  }),
  image({
    id: "img-mine",
    name: "my-webserver-image",
    visibility: "private",
    owner: PROJECT_ID,
    is_owner: true,
    size: 2_100_000_000,
    created_at: "2026-10-01T03:00:00Z",
  }),
  image({
    id: "img-community",
    name: "community-bioinformatics",
    visibility: "community",
    owner: "p-other",
    size: 4_000_000_000,
  }),
  image({
    id: "snap-1",
    name: "web-1-snapshot",
    visibility: "private",
    owner: PROJECT_ID,
    is_owner: true,
    is_snapshot: true,
    size: 1_500_000_000,
    created_at: "2026-10-05T03:00:00Z",
  }),
];

function instance(
  overrides: Partial<InstanceDetail> & { id: string; name: string },
): InstanceDetail {
  return {
    description: null,
    status: "ACTIVE",
    power_state: "RUNNING",
    task_state: null,
    vm_state: "active",
    availability_zone: "melbourne-qh2",
    created: "2026-10-01T02:00:00Z",
    updated: "2026-10-08T02:00:00Z",
    locked: false,
    host_id: "e4d909c290d0fb1ca068ffaddf22cbd0",
    key_name: "ada-laptop",
    progress: 0,
    user_id: USER_ID,
    project_id: PROJECT_ID,
    flavor: flavors[0]!,
    image: { id: "img-ubuntu", name: "NeCTAR Ubuntu 24.04 LTS (Noble) amd64" },
    boot_from_volume: false,
    addresses: [
      {
        network: "classic",
        addr: "203.0.113.10",
        version: 4,
        type: "fixed",
        mac: "fa:16:3e:00:00:01",
      },
    ],
    security_groups: ["default", "web"],
    volumes_attached: [],
    metadata: {},
    fault: null,
    server_group_ids: [],
    user_data: null,
    os_ext_srv_attr: { instance_name: "instance-00000001", hostname: "web-1" },
    ...overrides,
  };
}

export let instances: InstanceDetail[] = [
  instance({
    id: "i-web-1",
    name: "web-1",
    description: "Production web server",
    metadata: { role: "web" },
    volumes_attached: ["vol-1"],
    server_group_ids: ["sg-1"],
  }),
  instance({
    id: "i-db-1",
    name: "db-1",
    status: "SHUTOFF",
    power_state: "SHUTDOWN",
    vm_state: "stopped",
    flavor: flavors[1]!,
    addresses: [
      {
        network: "classic",
        addr: "203.0.113.11",
        version: 4,
        type: "fixed",
        mac: "fa:16:3e:00:00:02",
      },
      {
        network: "private-net",
        addr: "10.0.0.5",
        version: 4,
        type: "fixed",
        mac: "fa:16:3e:00:00:03",
      },
      // Floating IP fip-1 in the network mock, on the private port.
      {
        network: "private-net",
        addr: "203.0.113.100",
        version: 4,
        type: "floating",
        mac: "fa:16:3e:00:00:03",
      },
    ],
    security_groups: ["default"],
    created: "2026-09-20T02:00:00Z",
  }),
  instance({
    id: "i-worker-1",
    name: "worker-1",
    status: "ERROR",
    power_state: "NO STATE",
    vm_state: "error",
    flavor: flavors[2]!,
    key_name: null,
    addresses: [],
    fault: {
      code: 500,
      message: "No valid host was found.",
      created: "2026-10-07T02:00:00Z",
    },
    created: "2026-10-07T02:00:00Z",
  }),
];

let keyPairs: KeyPairDetail[] = [
  {
    name: "ada-laptop",
    type: "ssh",
    fingerprint: "SHA256:0bHxZbJvWpyX4fDl1vTqYQK2aW1q0G7lR9sKk8qzVfU",
    public_key:
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPaRhG2mockmockmockmockmockmockmockmockmockmock ada@laptop",
    created_at: "2026-08-01T00:00:00Z",
  },
  {
    name: "ci-deploy",
    type: "ssh",
    fingerprint: "SHA256:QmFzZTY0bW9ja2ZpbmdlcnByaW50Zm9ydGVzdGluZw",
    public_key:
      "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQmockmockmockmock ci@deploy",
    created_at: "2026-09-01T00:00:00Z",
  },
];

let serverGroups: ServerGroup[] = [
  {
    id: "sg-1",
    name: "web-tier",
    policy: "anti-affinity",
    members: ["i-web-1"],
  },
];

function rule(
  overrides: Partial<SecurityGroupRule> & { id: string },
): SecurityGroupRule {
  return {
    direction: "ingress",
    ethertype: "IPv4",
    protocol: "tcp",
    port_range_min: null,
    port_range_max: null,
    remote_ip_prefix: null,
    remote_group_id: null,
    description: "",
    open_to_the_world: false,
    ...overrides,
  };
}

let securityGroups: SecurityGroupDetail[] = [
  {
    id: "secgroup-default",
    name: "default",
    description: "Default security group",
    project_id: PROJECT_ID,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    rule_count: 2,
    rules: [
      rule({ id: "r-1", direction: "egress", protocol: null }),
      rule({
        id: "r-2",
        direction: "egress",
        ethertype: "IPv6",
        protocol: null,
      }),
    ],
  },
  {
    id: "secgroup-web",
    name: "web",
    description: "Web traffic",
    project_id: PROJECT_ID,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    rule_count: 3,
    rules: [
      rule({
        id: "r-3",
        port_range_min: 80,
        port_range_max: 80,
        remote_ip_prefix: "0.0.0.0/0",
        open_to_the_world: true,
        description: "HTTP",
      }),
      rule({
        id: "r-4",
        port_range_min: 443,
        port_range_max: 443,
        remote_ip_prefix: "0.0.0.0/0",
        open_to_the_world: true,
        description: "HTTPS",
      }),
      rule({
        id: "r-5",
        port_range_min: 22,
        port_range_max: 22,
        remote_ip_prefix: "203.0.113.0/24",
        description: "SSH from the office",
      }),
    ],
  },
];

export const networks: Network[] = [
  {
    id: CLASSIC,
    name: "classic",
    description: "",
    status: "ACTIVE",
    admin_state_up: true,
    is_shared: true,
    is_external: false,
    is_classic: true,
    is_project: false,
    project_id: "admin",
    mtu: 1500,
    port_security_enabled: true,
    availability_zones: [],
    tags: ["nectar:bootable"],
    subnets: [],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: null,
  },
  {
    id: "net-private",
    name: "private-net",
    description: "",
    status: "ACTIVE",
    admin_state_up: true,
    is_shared: false,
    is_external: false,
    is_classic: false,
    is_project: true,
    project_id: PROJECT_ID,
    mtu: 1450,
    port_security_enabled: true,
    availability_zones: [],
    tags: [],
    subnets: [
      {
        id: "subnet-1",
        name: "private-subnet",
        cidr: "10.0.0.0/24",
        ip_version: 4,
        gateway_ip: "10.0.0.1",
        enable_dhcp: true,
      },
    ],
    created_at: "2026-08-01T00:00:00Z",
    updated_at: null,
  },
];

export const ports: AttachablePort[] = [
  {
    id: "port-spare",
    name: "spare-port",
    network_id: "net-private",
    network_name: "private-net",
    mac_address: "fa:16:3e:00:00:99",
    fixed_ips: ["10.0.0.20"],
    status: "DOWN",
  },
];

const limits: ComputeLimits = {
  maxTotalInstances: 10,
  totalInstancesUsed: 3,
  maxTotalCores: 32,
  totalCoresUsed: 8,
  maxTotalRAMSize: 65536,
  totalRAMUsed: 16384,
  maxTotalKeypairs: 100,
  maxServerGroups: 10,
  totalServerGroupsUsed: 1,
};

const instanceVolumes: Record<string, InstanceVolume[]> = {
  "i-web-1": [
    {
      id: "vol-1",
      device: "/dev/vdb",
      name: "web-data",
      size_gb: 50,
      status: "in-use",
      bootable: false,
      volume_type: "standard",
    },
  ],
};

const instancePorts: Record<string, InstancePort[]> = {
  "i-web-1": [
    {
      id: "port-web-1",
      network_id: CLASSIC,
      mac_address: "fa:16:3e:00:00:01",
      status: "ACTIVE",
      fixed_ips: [{ ip: "203.0.113.10", subnet_id: "subnet-classic" }],
      security_groups: ["secgroup-default", "secgroup-web"],
      port_security_enabled: true,
      floating_ips: [],
    },
  ],
  "i-db-1": [
    {
      id: "port-db-1",
      network_id: CLASSIC,
      mac_address: "fa:16:3e:00:00:02",
      status: "DOWN",
      fixed_ips: [{ ip: "203.0.113.11", subnet_id: "subnet-classic" }],
      security_groups: ["secgroup-default"],
      port_security_enabled: true,
      floating_ips: [],
    },
    {
      id: "port-db-2",
      network_id: "net-private",
      mac_address: "fa:16:3e:00:00:03",
      status: "DOWN",
      fixed_ips: [{ ip: "10.0.0.5", subnet_id: "subnet-1" }],
      security_groups: ["secgroup-default"],
      port_security_enabled: true,
      floating_ips: [{ id: "fip-1", address: "203.0.113.100" }],
    },
  ],
};

const actionLog: InstanceAction[] = [
  {
    action: "create",
    request_id: "req-1111",
    user_id: USER_ID,
    start_time: "2026-10-01T02:00:00Z",
    message: null,
  },
  {
    action: "reboot",
    request_id: "req-2222",
    user_id: USER_ID,
    start_time: "2026-10-05T02:00:00Z",
    message: null,
  },
];

/**
 * The classes among the mock flavours, as the backend reports them
 * (backend/hive/nectar/flavors.py, flavor_classes): the described classes
 * in table order, without the reservation and classless flavours, which
 * the wizard groups itself.
 */
const flavorClasses: FlavorClass[] = [
  {
    id: "standard-v3",
    title: "Balanced (m3)",
    description:
      "Suited to most workloads, with 2 GB of RAM per vCPU and a 30 GB root disk.",
    count: 2,
  },
  {
    id: "tiny-v3",
    title: "Tiny (t3)",
    description:
      "A great choice for testing, prototyping and simple workloads, with 1 GB of RAM per vCPU and a 10 GB root disk.",
    count: 1,
  },
  {
    id: "preemptible",
    title: "Preemptible (p3)",
    description:
      "Extra compute for a short period at a quarter of the SU cost of the matching m3 flavour; instances are stopped within 24 hours and may be stopped at any time.",
    count: 1,
  },
];

export const launchOptions = (): LaunchOptions => ({
  flavors,
  flavor_classes: flavorClasses,
  images: images
    .filter((i) => !i.is_snapshot)
    .map((i) => ({
      ...i,
      hidden_until_search: i.visibility === "community" && !i.is_owner,
    })),
  snapshots: images.filter((i) => i.is_snapshot),
  volumes: launchVolumes(),
  volume_snapshots: launchVolumeSnapshots(),
  networks,
  key_pairs: keyPairs.map(({ name, type, fingerprint, public_key }) => ({
    name,
    type,
    fingerprint,
    public_key,
  })),
  security_groups: securityGroups.map(withoutRules),
  availability_zones: [
    { name: "melbourne-qh2", available: true },
    { name: "monash-01", available: true },
    { name: "tasmania", available: false },
  ],
  server_groups: serverGroups.map(({ id, name, policy, members }) => ({
    id,
    name,
    policy,
    members,
  })),
  limits,
  volume_types: volumeTypes,
  has_zoned_types: volumeTypes.some((t) => t.zones),
  errors: {},
  defaults: {
    create_volume: false,
    config_drive: false,
    network_ports: false,
    classic_network_id: CLASSIC,
    preemptible_notice:
      "Preemptible instances have a maximum lifetime of 24 hours and may be stopped at any time.",
  },
});

/**
 * The rule presets, as the backend sends them (backend/hive/nectar/secgroups.py
 * PRESETS); a rule created from one gets its protocol and port from it.
 */
const RULE_PRESETS: RulePreset[] = [
  { id: "all_icmp", name: "All ICMP", protocol: "icmp" },
  { id: "ssh", name: "SSH", protocol: "tcp", port: 22 },
  { id: "dns", name: "DNS", protocol: "tcp", port: 53 },
  { id: "http", name: "HTTP", protocol: "tcp", port: 80 },
  { id: "https", name: "HTTPS", protocol: "tcp", port: 443 },
  { id: "ms_sql", name: "MS SQL", protocol: "tcp", port: 1433 },
  { id: "mysql", name: "MYSQL", protocol: "tcp", port: 3306 },
  { id: "postgresql", name: "PostgreSQL", protocol: "tcp", port: 5432 },
  { id: "rdp", name: "RDP", protocol: "tcp", port: 3389 },
  { id: "all_tcp", name: "All TCP", protocol: "tcp" },
  { id: "all_udp", name: "All UDP", protocol: "udp" },
];

/**
 * The protocol and port range of a rule request, as the backend's
 * `apply_preset` fills them: a preset replaces both, a preset without a
 * port opens every port, and otherwise the request's own values stand.
 */
function ruleTarget(body: {
  preset?: string | null | undefined;
  protocol?: string | null | undefined;
  port_range_min?: number | null | undefined;
  port_range_max?: number | null | undefined;
}): Pick<SecurityGroupRule, "protocol" | "port_range_min" | "port_range_max"> {
  const preset = RULE_PRESETS.find((p) => p.id === body.preset);
  if (preset) {
    return {
      protocol: preset.protocol,
      port_range_min: preset.port ?? null,
      port_range_max: preset.port ?? null,
    };
  }
  return {
    protocol: body.protocol ?? null,
    port_range_min: body.port_range_min ?? null,
    port_range_max: body.port_range_max ?? null,
  };
}

/** A copy of `record` without `key`. */
function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

/** A security group as the list shows it, without its rules. */
function withoutRules(group: SecurityGroupDetail): SecurityGroup {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    project_id: group.project_id,
    created_at: group.created_at,
    updated_at: group.updated_at,
    rule_count: group.rule_count,
  };
}

/** Snapshot images and when Glance "finishes" them, for the polling flow. */
const snapshotsReadyAt = new Map<string, number>();
const SNAPSHOT_MS = 2000;

/** Marks snapshots whose upload time has passed as active. */
function settleSnapshots() {
  const now = Date.now();
  for (const [id, readyAt] of snapshotsReadyAt) {
    if (readyAt > now) continue;
    const found = images.find((i) => i.id === id);
    if (found) found.status = "active";
    snapshotsReadyAt.delete(id);
  }
}

function summary(detail: InstanceDetail): Instance {
  const copy: Partial<InstanceDetail> = { ...detail };
  delete copy.user_data;
  delete copy.os_ext_srv_attr;
  return copy as Instance;
}

export const computeHandlers = [
  // A `hive_mock_page_size` cookie caps the page, so tests can see a
  // project with more instances than one page holds.
  http.get("/api/compute/instances", ({ cookies }) => {
    const size = Number(cookies["hive_mock_page_size"]) || instances.length;
    const page = instances.slice(0, size);
    return HttpResponse.json<Reply<"/api/compute/instances", "get">>({
      items: page.map(summary),
      next_marker:
        page.length < instances.length ? (page.at(-1)?.id ?? null) : null,
      has_more: page.length < instances.length,
    });
  }),
  http.get("/api/compute/launch-options", () =>
    HttpResponse.json<Reply<"/api/compute/launch-options", "get">>(
      launchOptions(),
    ),
  ),
  http.post("/api/compute/instances", async ({ request }) => {
    const body = await readBody(request, launchBody);
    const flavor = flavors.find((f) => f.id === body.flavor_id) ?? flavors[0]!;
    // The backend drops the zone for a reservation flavour, whose reserved
    // hosts decide where it runs.
    const zone = flavor.is_reservation ? null : body.availability_zone;
    const ids: string[] = [];
    for (let n = 0; n < body.count; n += 1) {
      const id = nextId("i");
      ids.push(id);
      instances.unshift(
        instance({
          id,
          name: body.count > 1 ? `${body.name}-${n + 1}` : body.name,
          status: "BUILD",
          power_state: "NO STATE",
          task_state: "scheduling",
          vm_state: "building",
          // Nova's scheduler picks a zone when the launch names none.
          availability_zone: zone ?? "melbourne-qh2",
          flavor,
          key_name: body.key_name,
          security_groups: body.security_groups,
          addresses: [],
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          metadata: body.metadata,
        }),
      );
    }
    return HttpResponse.json<Reply<"/api/compute/instances", "post">>(
      { ids, status: "accepted" },
      { status: 202 },
    );
  }),
  http.get("/api/compute/instances/:id", ({ params }) => {
    const found = instances.find((i) => i.id === params["id"]);
    return found
      ? HttpResponse.json<Reply<"/api/compute/instances/{server_id}", "get">>(
          found,
        )
      : notFound("instance not found", "nova");
  }),
  http.patch("/api/compute/instances/:id", async ({ params, request }) => {
    const found = instances.find((i) => i.id === params["id"]);
    if (!found) return notFound("instance not found", "nova");
    const body = await readBody(request, instanceUpdateBody);
    if (body.name) found.name = body.name;
    if (body.description !== undefined) found.description = body.description;
    return HttpResponse.json<
      Reply<"/api/compute/instances/{server_id}", "patch">
    >(summary(found));
  }),
  http.delete("/api/compute/instances/:id", ({ params }) => {
    instances = instances.filter((i) => i.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/compute/instances/:id/volumes", ({ params }) =>
    HttpResponse.json<
      Reply<"/api/compute/instances/{server_id}/volumes", "get">
    >({ items: instanceVolumes[String(params["id"])] ?? [] }),
  ),
  http.get("/api/compute/instances/:id/ports", ({ params }) =>
    HttpResponse.json<Reply<"/api/compute/instances/{server_id}/ports", "get">>(
      { items: instancePorts[String(params["id"])] ?? [] },
    ),
  ),
  http.get("/api/compute/instances/:id/action-log", () =>
    HttpResponse.json<
      Reply<"/api/compute/instances/{server_id}/action-log", "get">
    >({ items: actionLog }),
  ),
  http.get("/api/compute/instances/:id/password", ({ params }) =>
    instances.some((i) => i.id === params["id"])
      ? HttpResponse.json<
          Reply<"/api/compute/instances/{server_id}/password", "get">
        >({
          // Nova keeps the password encrypted with the instance's key pair.
          encrypted_password: "bW9jay1lbmNyeXB0ZWQtcGFzc3dvcmQ=",
        })
      : notFound("instance not found", "nova"),
  ),
  http.get("/api/compute/instances/:id/console-output", () =>
    HttpResponse.json<
      Reply<"/api/compute/instances/{server_id}/console-output", "get">
    >({
      output:
        "[    0.000000] Linux version 6.8.0 (mock)\n[    1.234567] cloud-init: done",
    }),
  ),
  http.post("/api/compute/instances/:id/console", () =>
    HttpResponse.json<
      Reply<"/api/compute/instances/{server_id}/console", "post">
    >({
      url: "https://console.example.test/vnc_auto.html?token=mock",
      type: "novnc",
    }),
  ),
  http.get("/api/compute/instances/:id/resize-flavors", ({ params }) => {
    const found = instances.find((i) => i.id === params["id"]);
    return HttpResponse.json<
      Reply<"/api/compute/instances/{server_id}/resize-flavors", "get">
    >({
      items: flavors.filter(
        (f) => f.id !== found?.flavor?.id && !f.name.startsWith("p3."),
      ),
    });
  }),
  http.post(
    "/api/compute/instances/:id/actions",
    async ({ params, request }) => {
      const found = instances.find((i) => i.id === params["id"]);
      if (!found) return notFound("instance not found", "nova");
      const body = await readBody(request, instanceActionBody);
      switch (body.action) {
        case "start":
          found.status = "ACTIVE";
          found.power_state = "RUNNING";
          break;
        case "stop":
          found.status = "SHUTOFF";
          found.power_state = "SHUTDOWN";
          break;
        case "reboot":
          found.task_state = "rebooting";
          break;
        case "lock":
          found.locked = true;
          break;
        case "unlock":
          found.locked = false;
          break;
        case "resize":
          found.status = "VERIFY_RESIZE";
          found.flavor =
            flavors.find((f) => f.id === body.flavor_id) ?? found.flavor;
          break;
        case "confirm-resize":
        case "revert-resize":
        case "unrescue":
          found.status = "ACTIVE";
          break;
        case "rescue":
          found.status = "RESCUE";
          break;
        case "update-metadata":
          found.metadata = body.metadata;
          break;
        case "add-security-group":
          found.security_groups = [
            ...found.security_groups,
            body.security_group,
          ];
          break;
        case "remove-security-group":
          found.security_groups = found.security_groups.filter(
            (g) => g !== body.security_group,
          );
          break;
        case "snapshot": {
          const id = nextId("snap");
          images.unshift(
            image({
              id,
              name: body.name,
              visibility: "private",
              owner: PROJECT_ID,
              is_owner: true,
              is_snapshot: true,
              status: "queued",
              checksum: null,
              created_at: new Date().toISOString(),
            }),
          );
          snapshotsReadyAt.set(id, Date.now() + SNAPSHOT_MS);
          return HttpResponse.json<
            Reply<"/api/compute/instances/{server_id}/actions", "post">
          >({ status: "accepted", image_id: id }, { status: 202 });
        }
        default:
          break;
      }
      return HttpResponse.json<
        Reply<"/api/compute/instances/{server_id}/actions", "post">
      >({ status: "accepted", image_id: null }, { status: 202 });
    },
  ),

  http.get("/api/compute/flavors", () =>
    HttpResponse.json<Reply<"/api/compute/flavors", "get">>({ items: flavors }),
  ),
  http.get("/api/compute/availability-zones", () =>
    HttpResponse.json<Reply<"/api/compute/availability-zones", "get">>({
      items: launchOptions().availability_zones ?? [],
    }),
  ),
  http.get("/api/compute/limits", () =>
    HttpResponse.json<Reply<"/api/compute/limits", "get">>(limits),
  ),

  http.get("/api/compute/images", ({ request }) => {
    settleSnapshots();
    const url = new URL(request.url);
    const visibility = url.searchParams.get("visibility");
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const snapshots = url.searchParams.get("snapshots") === "true";
    const items = images.filter((i) => {
      if (i.is_snapshot !== snapshots) return false;
      if (visibility && i.visibility !== visibility) return false;
      if (q && !(i.name ?? "").toLowerCase().includes(q)) return false;
      if (i.visibility === "community" && !i.is_owner && !q) return false;
      return true;
    });
    return HttpResponse.json<Reply<"/api/compute/images", "get">>({ items });
  }),
  http.post("/api/compute/images", async ({ request }) => {
    const body = await readBody(request, imageCreateBody);
    const created = image({
      id: nextId("img"),
      name: body.name,
      status: "queued",
      checksum: null,
      visibility: body.visibility ?? "private",
      owner: PROJECT_ID,
      is_owner: true,
      size: null,
      min_disk: body.min_disk,
      min_ram: body.min_ram,
      protected: body.protected,
      disk_format: body.disk_format,
      created_at: new Date().toISOString(),
    });
    images.unshift(created);
    return HttpResponse.json<Reply<"/api/compute/images", "post">>(created, {
      status: 201,
    });
  }),
  http.get("/api/compute/images/:id", ({ params }) => {
    settleSnapshots();
    const found = images.find((i) => i.id === params["id"]);
    return found
      ? HttpResponse.json<Reply<"/api/compute/images/{image_id}", "get">>(found)
      : notFound("image not found", "nova");
  }),
  http.put("/api/compute/images/:id/file", async ({ params, request }) => {
    const found = images.find((i) => i.id === params["id"]);
    if (!found) return notFound("image not found", "nova");
    const bytes = await request.arrayBuffer();
    found.size = bytes.byteLength;
    found.status = "active";
    return HttpResponse.json<
      Reply<"/api/compute/images/{image_id}/file", "put">
    >(found);
  }),
  http.patch("/api/compute/images/:id", async ({ params, request }) => {
    const found = images.find((i) => i.id === params["id"]);
    if (!found) return notFound("image not found", "nova");
    const { properties, ...fields } = await readBody(request, imageUpdateBody);
    Object.assign(found, fields);
    // As the backend's JSON patch: a value sets the property, null removes it.
    for (const [key, value] of Object.entries(properties ?? {})) {
      if (value === null) found.properties = omit(found.properties, key);
      else found.properties = { ...found.properties, [key]: value };
    }
    found.updated_at = new Date().toISOString();
    return HttpResponse.json<Reply<"/api/compute/images/{image_id}", "patch">>(
      found,
    );
  }),
  http.delete("/api/compute/images/:id", ({ params }) => {
    images = images.filter((i) => i.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/compute/keypairs", () =>
    HttpResponse.json<Reply<"/api/compute/keypairs", "get">>({
      items: keyPairs.map(({ name, type, fingerprint, public_key }) => ({
        name,
        type,
        fingerprint,
        public_key,
      })),
    }),
  ),
  http.post("/api/compute/keypairs", async ({ request }) => {
    const body = await readBody(request, keyPairCreateBody);
    if (keyPairs.some((k) => k.name === body.name)) {
      return apiError(409, "conflict", "a key pair with that name exists");
    }
    const created: KeyPairDetail = {
      name: body.name,
      type: body.type ?? "ssh",
      fingerprint: "SHA256:bmV3bW9ja2ZpbmdlcnByaW50bmV3bW9ja2ZpbmdlcnByaW50",
      public_key:
        body.public_key ??
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGeneratedMockKey generated",
      created_at: new Date().toISOString(),
    };
    keyPairs.push(created);
    const reply: KeyPairCreated = {
      name: created.name,
      type: created.type,
      fingerprint: created.fingerprint,
      public_key: created.public_key,
      private_key: body.public_key
        ? null
        : "-----BEGIN OPENSSH PRIVATE KEY-----\nmock\n-----END OPENSSH PRIVATE KEY-----\n",
    };
    return HttpResponse.json<Reply<"/api/compute/keypairs", "post">>(reply, {
      status: 201,
    });
  }),
  http.get("/api/compute/keypairs/:name", ({ params }) => {
    const found = keyPairs.find(
      (k) => k.name === decodeURIComponent(String(params["name"])),
    );
    return found
      ? HttpResponse.json<Reply<"/api/compute/keypairs/{name}", "get">>(found)
      : notFound("key pair not found", "nova");
  }),
  http.delete("/api/compute/keypairs/:name", ({ params }) => {
    keyPairs = keyPairs.filter(
      (k) => k.name !== decodeURIComponent(String(params["name"])),
    );
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/compute/server-groups", () =>
    HttpResponse.json<Reply<"/api/compute/server-groups", "get">>({
      items: serverGroups,
    }),
  ),
  http.post("/api/compute/server-groups", async ({ request }) => {
    const body = await readBody(request, serverGroupCreateBody);
    const created: ServerGroup = {
      id: nextId("sg"),
      name: body.name,
      policy: body.policy,
      members: [],
    };
    serverGroups.push(created);
    return HttpResponse.json<Reply<"/api/compute/server-groups", "post">>(
      created,
      { status: 201 },
    );
  }),
  http.delete("/api/compute/server-groups/:id", ({ params }) => {
    serverGroups = serverGroups.filter((g) => g.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/network/security-group-presets", () =>
    HttpResponse.json<Reply<"/api/network/security-group-presets", "get">>({
      items: RULE_PRESETS,
      default_remote_cidr: "",
    }),
  ),
  http.get("/api/network/security-groups", () =>
    HttpResponse.json<Reply<"/api/network/security-groups", "get">>({
      items: securityGroups.map(withoutRules),
    }),
  ),
  http.post("/api/network/security-groups", async ({ request }) => {
    const body = await readBody(request, securityGroupCreateBody);
    const created: SecurityGroupDetail = {
      id: nextId("secgroup"),
      name: body.name,
      description: body.description,
      project_id: PROJECT_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      rule_count: 0,
      rules: [],
    };
    securityGroups.push(created);
    return HttpResponse.json<Reply<"/api/network/security-groups", "post">>(
      created,
      { status: 201 },
    );
  }),
  http.get("/api/network/security-groups/:id", ({ params }) => {
    const found = securityGroups.find((g) => g.id === params["id"]);
    return found
      ? HttpResponse.json<
          Reply<"/api/network/security-groups/{group_id}", "get">
        >(found)
      : notFound("security group not found", "nova");
  }),
  http.patch(
    "/api/network/security-groups/:id",
    async ({ params, request }) => {
      const found = securityGroups.find((g) => g.id === params["id"]);
      if (!found) return notFound("security group not found", "nova");
      const body = await readBody(request, securityGroupUpdateBody);
      if (body.name) found.name = body.name;
      if (body.description !== undefined) found.description = body.description;
      return HttpResponse.json<
        Reply<"/api/network/security-groups/{group_id}", "patch">
      >(found);
    },
  ),
  http.delete("/api/network/security-groups/:id", ({ params }) => {
    securityGroups = securityGroups.filter((g) => g.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(
    "/api/network/security-groups/:id/rules",
    async ({ params, request }) => {
      const found = securityGroups.find((g) => g.id === params["id"]);
      if (!found) return notFound("security group not found", "nova");
      const body = await readBody(request, ruleCreateBody);
      if (!body.remote_ip_prefix && !body.remote_group_id) {
        return apiError(
          400,
          "bad_request",
          "a remote CIDR or a remote security group is required",
        );
      }
      const created = rule({
        id: nextId("r"),
        direction: body.direction,
        ethertype: body.ethertype,
        ...ruleTarget(body),
        remote_ip_prefix: body.remote_ip_prefix ?? null,
        remote_group_id: body.remote_group_id ?? null,
        description: body.description ?? "",
        open_to_the_world:
          body.remote_ip_prefix === "0.0.0.0/0" ||
          body.remote_ip_prefix === "::/0",
      });
      found.rules.push(created);
      found.rule_count = found.rules.length;
      return HttpResponse.json<
        Reply<"/api/network/security-groups/{group_id}/rules", "post">
      >(created, { status: 201 });
    },
  ),
  http.delete(
    "/api/network/security-groups/:id/rules/:ruleId",
    ({ params }) => {
      const found = securityGroups.find((g) => g.id === params["id"]);
      if (found) {
        found.rules = found.rules.filter((r) => r.id !== params["ruleId"]);
        found.rule_count = found.rules.length;
      }
      return new HttpResponse(null, { status: 204 });
    },
  ),

  http.get("/api/api-access/endpoints", () =>
    HttpResponse.json<Reply<"/api/api-access/endpoints", "get">>({
      items: [
        {
          type: "identity",
          name: "keystone",
          url: "https://identity.rctest.nectar.org.au/v3/",
          region: "Melbourne",
        },
        {
          type: "compute",
          name: "nova",
          url: "https://nova.rctest.nectar.org.au/v2.1/",
          region: "Melbourne",
        },
        {
          type: "image",
          name: "glance",
          url: "https://image.rctest.nectar.org.au/",
          region: "Melbourne",
        },
        {
          type: "network",
          name: "neutron",
          url: "https://network.rctest.nectar.org.au/",
          region: "Melbourne",
        },
        {
          type: "volumev3",
          name: "cinderv3",
          url: "https://volume.rctest.nectar.org.au/v3/p1",
          region: "Melbourne",
        },
      ],
    }),
  ),
  http.get("/api/api-access/credentials", () =>
    HttpResponse.json<Reply<"/api/api-access/credentials", "get">>({
      username: "researcher@example.edu",
      user_id: USER_ID,
      user_domain_id: "default",
      project_id: PROJECT_ID,
      project_name: "research-project",
      project_domain_id: "default",
      auth_url: "https://identity.rctest.nectar.org.au/v3",
      region: "Melbourne",
    }),
  ),
  http.get(
    "/api/api-access/openrc",
    () =>
      new HttpResponse(
        "#!/usr/bin/env bash\nexport OS_AUTH_URL=https://identity.rctest.nectar.org.au/v3\n",
        {
          headers: {
            "Content-Type": "text/x-shellscript",
            "Content-Disposition":
              'attachment; filename="research-project-openrc.sh"',
          },
        },
      ),
  ),
  http.get(
    "/api/api-access/clouds.yaml",
    () =>
      new HttpResponse(
        "clouds:\n  openstack:\n    auth:\n      auth_url: https://identity.rctest.nectar.org.au/v3\n",
        {
          headers: {
            "Content-Type": "application/x-yaml",
            "Content-Disposition": 'attachment; filename="clouds.yaml"',
          },
        },
      ),
  ),
];
