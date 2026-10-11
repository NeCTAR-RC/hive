// Mocked compute, network and API-access data and handlers for VITE_MOCK=1
// and the Playwright suite. The stores below are mutable so a create or
// delete in a test shows up in the following list.
import { http, HttpResponse } from "msw";
import type {
  AttachablePort,
  ComputeLimits,
  Flavor,
  Image,
  Instance,
  InstanceAction,
  InstanceDetail,
  InstancePort,
  InstanceVolume,
  KeyPair,
  LaunchOptions,
  LaunchRequest,
  Network,
  RuleCreate,
  SecurityGroup,
  SecurityGroupRule,
  ServerGroup,
} from "../lib/api/types";

const CLASSIC = "00000000-0000-0000-0000-000000000000";
const PROJECT = "p1";

let counter = 100;
const nextId = (prefix: string) => `${prefix}-${(counter += 1)}`;

export const flavors: Flavor[] = [
  {
    id: "f-small",
    name: "m3.small",
    vcpus: 2,
    ram_mb: 4096,
    disk_gb: 30,
    ephemeral_gb: 0,
    swap_mb: 0,
    is_public: true,
    flavor_class: "m3",
    su_rate: 0.5,
    is_preemptible: false,
    extra_specs: { "nectar:rate": "0.5", "flavor_class:name": "m3" },
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
    flavor_class: "m3",
    su_rate: 1,
    is_preemptible: false,
    extra_specs: { "nectar:rate": "1", "flavor_class:name": "m3" },
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
    extra_specs: { "nectar:rate": "0.1", "flavor_class:name": "preemptible" },
  },
];

function image(
  overrides: Partial<Image> & { id: string; name: string },
): Image {
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
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    protected: false,
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
    owner: PROJECT,
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
    owner: PROJECT,
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
    user_id: "u1",
    project_id: PROJECT,
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

export let keyPairs: KeyPair[] = [
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

export let serverGroups: ServerGroup[] = [
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

export let securityGroups: Required<SecurityGroup>[] = [
  {
    id: "secgroup-default",
    name: "default",
    description: "Default security group",
    project_id: PROJECT,
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
    project_id: PROJECT,
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
    project_id: "p-50",
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

export const limits: ComputeLimits = {
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
      floating_ips: [],
    },
  ],
};

const actionLog: InstanceAction[] = [
  {
    action: "create",
    request_id: "req-1111",
    user_id: "u1",
    start_time: "2026-10-01T02:00:00Z",
    message: null,
  },
  {
    action: "reboot",
    request_id: "req-2222",
    user_id: "u1",
    start_time: "2026-10-05T02:00:00Z",
    message: null,
  },
];

export const launchOptions = (): LaunchOptions => ({
  flavors,
  images: images
    .filter((i) => !i.is_snapshot)
    .map((i) => ({
      ...i,
      hidden_until_search: i.visibility === "community" && !i.is_owner,
    })),
  snapshots: images.filter((i) => i.is_snapshot),
  volumes: [
    {
      id: "vol-boot",
      name: "bootable-volume",
      size_gb: 20,
      availability_zone: "melbourne-qh2",
      status: "available",
      bootable: true,
    },
  ],
  volume_snapshots: [],
  networks,
  key_pairs: keyPairs.map(({ name, type, fingerprint }) => ({
    name,
    type,
    fingerprint,
  })),
  security_groups: securityGroups.map(withoutRules),
  availability_zones: [
    { name: "melbourne-qh2", available: true },
    { name: "monash-01", available: true },
    { name: "tasmania", available: false },
  ],
  server_groups: serverGroups.map(({ id, name, policy }) => ({
    id,
    name,
    policy,
  })),
  limits,
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

function withoutRules(group: Required<SecurityGroup>): SecurityGroup {
  const copy: SecurityGroup = { ...group };
  delete copy.rules;
  return copy;
}

const notFound = (message: string) =>
  HttpResponse.json(
    { error: "not_found", message, service: "nova" },
    { status: 404 },
  );

const accepted = () =>
  HttpResponse.json({ status: "accepted" }, { status: 202 });

function summary(detail: InstanceDetail): Instance {
  const copy: Partial<InstanceDetail> = { ...detail };
  delete copy.user_data;
  delete copy.os_ext_srv_attr;
  return copy as Instance;
}

export const computeHandlers = [
  // --- instances ---
  http.get("/api/compute/instances", () =>
    HttpResponse.json({
      items: instances.map(summary),
      next_marker: null,
      has_more: false,
    }),
  ),
  http.get("/api/compute/launch-options", () =>
    HttpResponse.json(launchOptions()),
  ),
  http.post("/api/compute/instances", async ({ request }) => {
    const body = (await request.json()) as LaunchRequest;
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
          availability_zone: body.availability_zone,
          flavor: flavors.find((f) => f.id === body.flavor_id) ?? flavors[0]!,
          key_name: body.key_name,
          security_groups: body.security_groups,
          addresses: [],
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          metadata: body.metadata,
        }),
      );
    }
    return HttpResponse.json({ ids, status: "accepted" }, { status: 202 });
  }),
  http.get("/api/compute/instances/:id", ({ params }) => {
    const found = instances.find((i) => i.id === params["id"]);
    return found ? HttpResponse.json(found) : notFound("instance not found");
  }),
  http.patch("/api/compute/instances/:id", async ({ params, request }) => {
    const found = instances.find((i) => i.id === params["id"]);
    if (!found) return notFound("instance not found");
    const body = (await request.json()) as {
      name?: string;
      description?: string;
    };
    if (body.name) found.name = body.name;
    if (body.description !== undefined) found.description = body.description;
    return HttpResponse.json(summary(found));
  }),
  http.delete("/api/compute/instances/:id", ({ params }) => {
    instances = instances.filter((i) => i.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/compute/instances/:id/volumes", ({ params }) =>
    HttpResponse.json({ items: instanceVolumes[String(params["id"])] ?? [] }),
  ),
  http.get("/api/compute/instances/:id/ports", ({ params }) =>
    HttpResponse.json({ items: instancePorts[String(params["id"])] ?? [] }),
  ),
  http.get("/api/compute/instances/:id/action-log", () =>
    HttpResponse.json({ items: actionLog }),
  ),
  http.get("/api/compute/instances/:id/console-output", () =>
    HttpResponse.json({
      output:
        "[    0.000000] Linux version 6.8.0 (mock)\n[    1.234567] cloud-init: done",
    }),
  ),
  http.post("/api/compute/instances/:id/console", () =>
    HttpResponse.json({
      url: "https://console.example.test/vnc_auto.html?token=mock",
      type: "novnc",
    }),
  ),
  http.get("/api/compute/instances/:id/resize-flavors", ({ params }) => {
    const found = instances.find((i) => i.id === params["id"]);
    return HttpResponse.json({
      items: flavors.filter(
        (f) => f.id !== found?.flavor?.id && !f.name.startsWith("p3."),
      ),
    });
  }),
  http.post(
    "/api/compute/instances/:id/actions/:action",
    async ({ params, request }) => {
      const found = instances.find((i) => i.id === params["id"]);
      if (!found) return notFound("instance not found");
      const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      switch (params["action"]) {
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
            flavors.find((f) => f.id === body["flavor_id"]) ?? found.flavor;
          break;
        case "confirm-resize":
        case "revert-resize":
          found.status = "ACTIVE";
          break;
        case "update-metadata":
          found.metadata = (body["metadata"] as Record<string, string>) ?? {};
          break;
        case "add-security-group":
          found.security_groups = [
            ...found.security_groups,
            String(body["security_group"]),
          ];
          break;
        case "remove-security-group":
          found.security_groups = found.security_groups.filter(
            (g) => g !== body["security_group"],
          );
          break;
        case "snapshot": {
          const id = nextId("snap");
          images.unshift(
            image({
              id,
              name: String(body["name"]),
              visibility: "private",
              owner: PROJECT,
              is_owner: true,
              is_snapshot: true,
              status: "queued",
              created_at: new Date().toISOString(),
            }),
          );
          return HttpResponse.json(
            { status: "accepted", image_id: id },
            { status: 202 },
          );
        }
        default:
          break;
      }
      return accepted();
    },
  ),

  // --- reference data ---
  http.get("/api/compute/flavors", () => HttpResponse.json({ items: flavors })),
  http.get("/api/compute/availability-zones", () =>
    HttpResponse.json({ items: launchOptions().availability_zones }),
  ),
  http.get("/api/compute/limits", () => HttpResponse.json(limits)),

  // --- images ---
  http.get("/api/compute/images", ({ request }) => {
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
    return HttpResponse.json({ items });
  }),
  http.post("/api/compute/images", async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      visibility?: Image["visibility"];
      min_disk: number;
      min_ram: number;
      protected: boolean;
      disk_format: string;
    };
    const created = image({
      id: nextId("img"),
      name: body.name,
      status: "queued",
      visibility: body.visibility ?? "private",
      owner: PROJECT,
      is_owner: true,
      size: null,
      min_disk: body.min_disk,
      min_ram: body.min_ram,
      protected: body.protected,
      disk_format: body.disk_format,
      created_at: new Date().toISOString(),
    });
    images.unshift(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.get("/api/compute/images/:id", ({ params }) => {
    const found = images.find((i) => i.id === params["id"]);
    return found ? HttpResponse.json(found) : notFound("image not found");
  }),
  http.put("/api/compute/images/:id/file", async ({ params, request }) => {
    const found = images.find((i) => i.id === params["id"]);
    if (!found) return notFound("image not found");
    const bytes = await request.arrayBuffer();
    found.size = bytes.byteLength;
    found.status = "active";
    return HttpResponse.json(found);
  }),
  http.patch("/api/compute/images/:id", async ({ params, request }) => {
    const found = images.find((i) => i.id === params["id"]);
    if (!found) return notFound("image not found");
    const body = (await request.json()) as Partial<Image>;
    Object.assign(found, body);
    return HttpResponse.json(found);
  }),
  http.delete("/api/compute/images/:id", ({ params }) => {
    images = images.filter((i) => i.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),

  // --- key pairs ---
  http.get("/api/compute/keypairs", () =>
    HttpResponse.json({
      items: keyPairs.map(({ name, type, fingerprint, public_key }) => ({
        name,
        type,
        fingerprint,
        public_key,
      })),
    }),
  ),
  http.post("/api/compute/keypairs", async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      public_key?: string;
      type?: "ssh" | "x509";
    };
    if (keyPairs.some((k) => k.name === body.name)) {
      return HttpResponse.json(
        { error: "conflict", message: "a key pair with that name exists" },
        { status: 409 },
      );
    }
    const created: KeyPair = {
      name: body.name,
      type: body.type ?? "ssh",
      fingerprint: "SHA256:bmV3bW9ja2ZpbmdlcnByaW50bmV3bW9ja2ZpbmdlcnByaW50",
      public_key:
        body.public_key ??
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGeneratedMockKey generated",
      created_at: new Date().toISOString(),
    };
    keyPairs.push(created);
    return HttpResponse.json(
      {
        ...created,
        private_key: body.public_key
          ? null
          : "-----BEGIN OPENSSH PRIVATE KEY-----\nmock\n-----END OPENSSH PRIVATE KEY-----\n",
      },
      { status: 201 },
    );
  }),
  http.get("/api/compute/keypairs/:name", ({ params }) => {
    const found = keyPairs.find(
      (k) => k.name === decodeURIComponent(String(params["name"])),
    );
    return found ? HttpResponse.json(found) : notFound("key pair not found");
  }),
  http.delete("/api/compute/keypairs/:name", ({ params }) => {
    keyPairs = keyPairs.filter(
      (k) => k.name !== decodeURIComponent(String(params["name"])),
    );
    return new HttpResponse(null, { status: 204 });
  }),

  // --- server groups ---
  http.get("/api/compute/server-groups", () =>
    HttpResponse.json({ items: serverGroups }),
  ),
  http.post("/api/compute/server-groups", async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      policy: ServerGroup["policy"];
    };
    const created: ServerGroup = {
      id: nextId("sg"),
      name: body.name,
      policy: body.policy,
      members: [],
    };
    serverGroups.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.delete("/api/compute/server-groups/:id", ({ params }) => {
    serverGroups = serverGroups.filter((g) => g.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),

  // --- network (networks, ports and the rest live in ./network) ---
  http.get("/api/network/security-group-presets", () =>
    HttpResponse.json({
      items: [
        { id: "all_icmp", name: "All ICMP", protocol: "icmp" },
        { id: "ssh", name: "SSH", protocol: "tcp", port: 22 },
        { id: "dns", name: "DNS", protocol: "tcp", port: 53 },
        { id: "http", name: "HTTP", protocol: "tcp", port: 80 },
        { id: "https", name: "HTTPS", protocol: "tcp", port: 443 },
        { id: "mysql", name: "MYSQL", protocol: "tcp", port: 3306 },
        { id: "postgresql", name: "PostgreSQL", protocol: "tcp", port: 5432 },
        { id: "rdp", name: "RDP", protocol: "tcp", port: 3389 },
        { id: "all_tcp", name: "All TCP", protocol: "tcp" },
        { id: "all_udp", name: "All UDP", protocol: "udp" },
      ],
      default_remote_cidr: "",
    }),
  ),
  http.get("/api/network/security-groups", () =>
    HttpResponse.json({
      items: securityGroups.map(withoutRules),
    }),
  ),
  http.post("/api/network/security-groups", async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      description: string;
    };
    const created: Required<SecurityGroup> = {
      id: nextId("secgroup"),
      name: body.name,
      description: body.description,
      project_id: PROJECT,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      rule_count: 0,
      rules: [],
    };
    securityGroups.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.get("/api/network/security-groups/:id", ({ params }) => {
    const found = securityGroups.find((g) => g.id === params["id"]);
    return found
      ? HttpResponse.json(found)
      : notFound("security group not found");
  }),
  http.patch(
    "/api/network/security-groups/:id",
    async ({ params, request }) => {
      const found = securityGroups.find((g) => g.id === params["id"]);
      if (!found) return notFound("security group not found");
      const body = (await request.json()) as {
        name?: string;
        description?: string;
      };
      if (body.name) found.name = body.name;
      if (body.description !== undefined) found.description = body.description;
      return HttpResponse.json(found);
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
      if (!found) return notFound("security group not found");
      const body = (await request.json()) as RuleCreate;
      if (!body.remote_ip_prefix && !body.remote_group_id) {
        return HttpResponse.json(
          {
            error: "bad_request",
            message: "a remote CIDR or a remote security group is required",
          },
          { status: 400 },
        );
      }
      const created = rule({
        id: nextId("r"),
        direction: body.direction,
        ethertype: body.ethertype,
        protocol: body.protocol ?? (body.preset ? "tcp" : null),
        port_range_min: body.port_range_min ?? null,
        port_range_max: body.port_range_max ?? null,
        remote_ip_prefix: body.remote_ip_prefix ?? null,
        remote_group_id: body.remote_group_id ?? null,
        description: body.description ?? "",
        open_to_the_world:
          body.remote_ip_prefix === "0.0.0.0/0" ||
          body.remote_ip_prefix === "::/0",
      });
      found.rules.push(created);
      found.rule_count = found.rules.length;
      return HttpResponse.json(created, { status: 201 });
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

  // --- API access ---
  http.get("/api/api-access/endpoints", () =>
    HttpResponse.json({
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
    HttpResponse.json({
      username: "researcher@example.edu",
      user_id: "u1",
      user_domain_id: "default",
      project_id: PROJECT,
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
