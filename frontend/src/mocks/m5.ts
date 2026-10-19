// Mocked API for the object store, Kubernetes and load balancer panels.
import { http, HttpResponse } from "msw";
import type {
  Cluster,
  ClusterTemplate,
  Container,
  HealthMonitor,
  L7Policy,
  Listener,
  LoadBalancer,
  Member,
  NodeGroup,
  Pool,
  StoreObject,
} from "../lib/api/types";

// --- object store --------------------------------------------------------------

let containers: Container[] = [
  {
    name: "docs",
    object_count: 3,
    bytes: 4096,
    public_url: "https://store.test/v1/AUTH_p1/docs",
  },
  {
    name: "backups",
    object_count: 0,
    bytes: 0,
    public_url: "https://store.test/v1/AUTH_p1/backups",
  },
];
const publicContainers = new Set<string>(["docs"]);
let objects: Record<string, StoreObject[]> = {
  docs: [
    {
      name: "notes/",
      basename: "notes",
      is_folder: true,
      bytes: 0,
      content_type: "application/directory",
      hash: null,
      last_modified: null,
    },
    {
      name: "readme.txt",
      basename: "readme.txt",
      is_folder: false,
      bytes: 1024,
      content_type: "text/plain",
      hash: "abc",
      last_modified: "2026-10-09T01:00:00.000000",
    },
    {
      name: "notes/todo.txt",
      basename: "todo.txt",
      is_folder: false,
      bytes: 3072,
      content_type: "text/plain",
      hash: "def",
      last_modified: "2026-10-08T01:00:00.000000",
    },
  ],
  backups: [],
};

function listing(container: string, path: string) {
  const prefix = path ? `${path.replace(/^\/+|\/+$/g, "")}/` : "";
  const items = (objects[container] ?? [])
    .filter((o) => o.name.startsWith(prefix) && o.name !== prefix)
    .filter(
      (o) => !o.name.slice(prefix.length).replace(/\/$/, "").includes("/"),
    )
    .map((o) => ({
      ...o,
      basename: o.name.slice(prefix.length).replace(/\/$/, ""),
    }));
  return { container, prefix, items, has_more: false, next_marker: null };
}

// --- kubernetes ----------------------------------------------------------------

const template: ClusterTemplate = {
  id: "t-133",
  name: "kubernetes-v1.33.4-ardctest-artm-calico-v5",
  coe: "kubernetes",
  image_id: "img-1",
  flavor_id: "m3.small",
  master_flavor_id: "m3.small",
  keypair_id: null,
  network_driver: "calico",
  external_network_id: "ardctest-artm",
  fixed_network: null,
  fixed_subnet: null,
  dns_nameserver: "1.1.1.1",
  master_lb_enabled: true,
  floating_ip_enabled: false,
  tls_disabled: false,
  public: true,
  hidden: false,
  server_type: "vm",
  cluster_distro: "ubuntu",
  volume_driver: null,
  docker_storage_driver: "overlay2",
  docker_volume_size: null,
  registry_enabled: false,
  labels: { availability_zone: "ardctest-artm", upgrade_targets: "t-134" },
  kubernetes_version: "1.33.4",
  availability_zone: "ardctest-artm",
  template_version: "5",
  upgrade_targets: ["t-134"],
  created_at: "2026-08-28T22:23:54+00:00",
  updated_at: null,
};
const target: ClusterTemplate = {
  ...template,
  id: "t-134",
  name: "kubernetes-v1.34.0-ardctest-artm-calico-v1",
  kubernetes_version: "1.34.0",
  template_version: "1",
  upgrade_targets: [],
  labels: { availability_zone: "ardctest-artm" },
};
const auckland: ClusterTemplate = {
  ...template,
  id: "t-auck",
  name: "kubernetes-v1.33.4-aucklandtest-cilium-v2",
  network_driver: "cilium",
  availability_zone: "aucklandtest",
  master_lb_enabled: false,
  template_version: "2",
  upgrade_targets: [],
  labels: { availability_zone: "aucklandtest" },
};

let clusters: Cluster[] = [
  {
    id: "c-1",
    name: "samtest1",
    status: "CREATE_COMPLETE",
    status_reason: null,
    health_status: "HEALTHY",
    health_status_reason: { api: "ok" },
    master_count: 1,
    node_count: 2,
    coe_version: "v1.33.4",
    cluster_template_id: "t-133",
    template_name: template.name,
    keypair: null,
    api_address: "https://10.0.0.5:6443",
    master_addresses: ["10.0.0.5"],
    node_addresses: ["10.0.0.6", "10.0.0.7"],
    master_flavor_id: "m3.small",
    flavor_id: "m3.small",
    create_timeout: 60,
    labels: { availability_zone: "ardctest-artm", upgrade_targets: "t-134" },
    availability_zone: "ardctest-artm",
    network_driver: "calico",
    kubernetes_version: "v1.33.4",
    upgrade_targets: ["t-134"],
    stack_id: "samtest1-x",
    created_at: "2026-06-02T11:07:24",
    updated_at: null,
    actions: [
      "config",
      "certificate",
      "sign",
      "upgrade",
      "nodegroups",
      "delete",
    ],
  },
];
let nodeGroups: NodeGroup[] = [
  {
    id: "ng-m",
    name: "default-master",
    role: "master",
    is_default: true,
    status: "CREATE_COMPLETE",
    status_reason: null,
    flavor_id: "m3.small",
    image_id: "img-1",
    node_count: 1,
    min_node_count: 1,
    max_node_count: null,
    node_addresses: ["10.0.0.5"],
    labels: {},
    auto_scaling: false,
    node_labels: {},
    node_taints: [],
    created_at: null,
    updated_at: null,
  },
  {
    id: "ng-w",
    name: "default-worker",
    role: "worker",
    is_default: true,
    status: "CREATE_COMPLETE",
    status_reason: null,
    flavor_id: "m3.small",
    image_id: "img-1",
    node_count: 2,
    min_node_count: 1,
    max_node_count: null,
    node_addresses: ["10.0.0.6", "10.0.0.7"],
    labels: {},
    auto_scaling: false,
    node_labels: {},
    node_taints: [],
    created_at: null,
    updated_at: null,
  },
];

// --- load balancers --------------------------------------------------------------

let loadBalancers: LoadBalancer[] = [
  {
    id: "lb-1",
    name: "web",
    description: "Web front end",
    provisioning_status: "ACTIVE",
    operating_status: "ONLINE",
    admin_state_up: true,
    vip_address: "192.168.1.10",
    vip_port_id: "port-vip",
    vip_subnet_id: "subnet-1",
    vip_network_id: "private-net",
    provider: "ovn",
    flavor_id: null,
    availability_zone: "ardctest-artm",
    listeners: ["l-1"],
    pools: ["p-1"],
    floating_ip: null,
    created_at: "2026-06-02T11:07:24",
    updated_at: null,
    can_delete: true,
    is_transitional: false,
  },
];
let listeners: Listener[] = [
  {
    id: "l-1",
    name: "http",
    description: null,
    protocol: "HTTP",
    protocol_port: 80,
    provisioning_status: "ACTIVE",
    operating_status: "ONLINE",
    admin_state_up: true,
    connection_limit: -1,
    default_pool_id: "p-1",
    loadbalancer_id: "lb-1",
    timeout_client_data: 50000,
    timeout_member_connect: 5000,
    timeout_member_data: 50000,
    timeout_tcp_inspect: 0,
    allowed_cidrs: [],
    insert_headers: { "X-Forwarded-For": "true" },
    default_tls_container_ref: null,
    sni_container_refs: [],
    tls_ciphers: null,
    l7policies: ["pol-1"],
    created_at: null,
    updated_at: null,
  },
];
let members: Member[] = [
  {
    id: "m-1",
    name: "web-1",
    address: "192.168.1.20",
    protocol_port: 80,
    subnet_id: "subnet-1",
    weight: 1,
    backup: false,
    monitor_address: null,
    monitor_port: null,
    provisioning_status: "ACTIVE",
    operating_status: "ONLINE",
    admin_state_up: true,
    created_at: null,
    updated_at: null,
  },
];
let pools: Pool[] = [
  {
    id: "p-1",
    name: "web-pool",
    description: null,
    protocol: "HTTP",
    lb_algorithm: "ROUND_ROBIN",
    provisioning_status: "ACTIVE",
    operating_status: "ONLINE",
    admin_state_up: true,
    session_persistence: null,
    tls_enabled: false,
    tls_ciphers: null,
    healthmonitor_id: "hm-1",
    listeners: ["l-1"],
    loadbalancer_id: "lb-1",
    members: ["m-1"],
    created_at: null,
    updated_at: null,
  },
];
let monitors: HealthMonitor[] = [
  {
    id: "hm-1",
    name: null,
    type: "HTTP",
    delay: 5,
    timeout: 5,
    max_retries: 3,
    max_retries_down: 3,
    http_method: "GET",
    url_path: "/healthz",
    expected_codes: "200",
    provisioning_status: "ACTIVE",
    operating_status: "ONLINE",
    admin_state_up: true,
    pools: ["p-1"],
    created_at: null,
    updated_at: null,
  },
];
let policies: L7Policy[] = [
  {
    id: "pol-1",
    name: "block-admin",
    description: null,
    action: "REJECT",
    position: 1,
    redirect_url: null,
    redirect_pool_id: null,
    redirect_prefix: null,
    listener_id: "l-1",
    provisioning_status: "ACTIVE",
    operating_status: "ONLINE",
    admin_state_up: true,
    rules: ["r-1"],
    created_at: null,
    updated_at: null,
  },
];

function tree(lbId: string) {
  const lb = loadBalancers.find((l) => l.id === lbId);
  if (!lb) return null;
  return {
    load_balancer: lb,
    chain: null,
    listeners: listeners.filter((l) => l.loadbalancer_id === lbId),
    pools: pools
      .filter((p) => p.loadbalancer_id === lbId)
      .map((p) => ({
        ...p,
        member_rows: members.filter((m) => p.members.includes(m.id)),
      })),
    monitors: monitors.filter((m) =>
      m.pools.some((pid) =>
        pools.some((p) => p.id === pid && p.loadbalancer_id === lbId),
      ),
    ),
    l7policies: policies.filter((p) =>
      listeners.some(
        (l) => l.id === p.listener_id && l.loadbalancer_id === lbId,
      ),
    ),
  };
}

export const m5Handlers = [
  // object store
  http.get("/api/object-store/info", () =>
    HttpResponse.json({
      upload_mode: "tempurl",
      max_file_size: 5368709120,
      segment_bytes: 1073741824,
      proxy_max_bytes: 5368709120,
      slo: true,
      bulk_delete: 1000,
      policies: [{ name: "default-placement", default: true }],
      account: {
        container_count: containers.length,
        object_count: 3,
        bytes: 4096,
        quota_containers: "1000",
        quota_bytes: null,
      },
      public_url: "https://store.test/v1/AUTH_p1",
    }),
  ),
  http.get("/api/object-store/containers", () =>
    HttpResponse.json({ items: containers, truncated: false }),
  ),
  http.post("/api/object-store/containers", async ({ request }) => {
    const body = (await request.json()) as { name: string; is_public: boolean };
    if (containers.some((c) => c.name === body.name)) {
      return HttpResponse.json(
        {
          error: "conflict",
          message: `A container named "${body.name}" already exists.`,
        },
        { status: 409 },
      );
    }
    const created = {
      name: body.name,
      object_count: 0,
      bytes: 0,
      public_url: `https://store.test/v1/AUTH_p1/${body.name}`,
    };
    containers = [...containers, created];
    objects[body.name] = [];
    if (body.is_public) publicContainers.add(body.name);
    return HttpResponse.json(
      {
        ...created,
        is_public: body.is_public,
        read_acl: null,
        storage_policy: "default-placement",
        cors_origin: null,
        metadata: {},
        timestamp: null,
      },
      { status: 201 },
    );
  }),
  http.get("/api/object-store/containers/:container", ({ params }) => {
    const found = containers.find((c) => c.name === params["container"]);
    if (!found)
      return HttpResponse.json(
        { error: "not_found", message: "not found" },
        { status: 404 },
      );
    return HttpResponse.json({
      ...found,
      is_public: publicContainers.has(found.name),
      read_acl: null,
      storage_policy: "default-placement",
      cors_origin: null,
      metadata: {},
      timestamp: null,
    });
  }),
  http.patch(
    "/api/object-store/containers/:container",
    async ({ params, request }) => {
      const body = (await request.json()) as { is_public?: boolean };
      const name = String(params["container"]);
      if (body.is_public) publicContainers.add(name);
      else if (body.is_public === false) publicContainers.delete(name);
      const found = containers.find((c) => c.name === name)!;
      return HttpResponse.json({
        ...found,
        is_public: publicContainers.has(name),
        read_acl: null,
        storage_policy: "default-placement",
        cors_origin: null,
        metadata: {},
        timestamp: null,
      });
    },
  ),
  http.delete("/api/object-store/containers/:container", ({ params }) => {
    const name = String(params["container"]);
    if ((objects[name] ?? []).length > 0) {
      return HttpResponse.json(
        {
          error: "conflict",
          message: "The container must be empty before it can be deleted.",
        },
        { status: 409 },
      );
    }
    containers = containers.filter((c) => c.name !== name);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(
    "/api/object-store/containers/:container/objects",
    ({ params, request }) =>
      HttpResponse.json(
        listing(
          String(params["container"]),
          new URL(request.url).searchParams.get("path") ?? "",
        ),
      ),
  ),
  http.post(
    "/api/object-store/containers/:container/folders",
    async ({ params, request }) => {
      const body = (await request.json()) as { path: string };
      const name = `${body.path.replace(/^\/+|\/+$/g, "")}/`;
      const list = objects[String(params["container"])] ?? [];
      list.push({
        name,
        basename: name,
        is_folder: true,
        bytes: 0,
        content_type: "application/directory",
        hash: null,
        last_modified: null,
      });
      objects = { ...objects, [String(params["container"])]: list };
      return HttpResponse.json({ name, is_folder: true }, { status: 201 });
    },
  ),
  http.post(
    "/api/object-store/containers/:container/upload-plan",
    async ({ request }) => {
      const body = (await request.json()) as {
        objects: { name: string; size: number }[];
      };
      return HttpResponse.json({
        mode: "proxy",
        max_bytes: 5368709120,
        objects: body.objects.map((o) => ({
          ...o,
          url: null,
          manifest: false,
          segments: null,
        })),
      });
    },
  ),
  http.put(
    "/api/object-store/containers/:container/objects/*",
    async ({ params, request }) => {
      const container = String(params["container"]);
      const name = decodeURIComponent(
        new URL(request.url).pathname.split("/objects/")[1] ?? "",
      );
      const bytes = (await request.arrayBuffer()).byteLength;
      const list = (objects[container] ?? []).filter((o) => o.name !== name);
      list.push({
        name,
        basename: name,
        is_folder: false,
        bytes,
        content_type: request.headers.get("content-type"),
        hash: "new",
        last_modified: new Date().toISOString(),
      });
      objects = { ...objects, [container]: list };
      return HttpResponse.json({ name, etag: "new" }, { status: 201 });
    },
  ),
  http.post(
    "/api/object-store/containers/:container/delete",
    async ({ params, request }) => {
      const body = (await request.json()) as { names: string[] };
      const container = String(params["container"]);
      const before = objects[container] ?? [];
      const after = before.filter(
        (o) =>
          !body.names.some(
            (n) => o.name === n || (n.endsWith("/") && o.name.startsWith(n)),
          ),
      );
      objects = { ...objects, [container]: after };
      return HttpResponse.json({
        deleted: before.length - after.length,
        failed: [],
      });
    },
  ),
  http.get(
    "/api/object-store/containers/:container/objects/*",
    ({ params, request }) => {
      const url = new URL(request.url);
      const rest = url.pathname.split("/objects/")[1] ?? "";
      if (rest.endsWith("/metadata")) {
        const name = decodeURIComponent(rest.slice(0, -"/metadata".length));
        const found = (objects[String(params["container"])] ?? []).find(
          (o) => o.name === name,
        );
        return HttpResponse.json({
          name,
          container: params["container"],
          orig_filename: null,
          bytes: found?.bytes ?? 0,
          content_type: found?.content_type ?? null,
          hash: found?.hash ?? null,
          last_modified: found?.last_modified ?? null,
          timestamp: null,
          is_slo: false,
          manifest: null,
          metadata: { owner: "ada" },
        });
      }
      return new HttpResponse("mock file contents", {
        headers: { "Content-Type": "text/plain" },
      });
    },
  ),
  http.post(
    "/api/object-store/containers/:container/objects/*",
    async ({ params, request }) => {
      const rest = new URL(request.url).pathname.split("/objects/")[1] ?? "";
      if (rest.endsWith("/copy")) {
        const body = (await request.json()) as {
          dest_container: string;
          dest_name: string;
        };
        const list = objects[body.dest_container] ?? [];
        list.push({
          name: body.dest_name,
          basename: body.dest_name,
          is_folder: false,
          bytes: 1024,
          content_type: "text/plain",
          hash: "copy",
          last_modified: new Date().toISOString(),
        });
        objects = { ...objects, [body.dest_container]: list };
        return HttpResponse.json(
          { container: body.dest_container, name: body.dest_name },
          { status: 201 },
        );
      }
      return HttpResponse.json(
        {
          name: decodeURIComponent(rest.replace(/\/manifest$/, "")),
          bytes: 0,
          is_slo: true,
          container: params["container"],
        },
        { status: 201 },
      );
    },
  ),

  // kubernetes
  http.get("/api/kubernetes/clusters", () =>
    HttpResponse.json({
      items: clusters,
      quota: { clusters: clusters.length, nodes: 3, hard_limit: 10 },
    }),
  ),
  http.get("/api/kubernetes/clusters/options", () =>
    HttpResponse.json({
      versions: ["1.34.0", "1.33.4"],
      availability_zones: ["ardctest-artm", "aucklandtest"],
      network_drivers: ["calico", "cilium"],
      combinations: [
        {
          kubernetes_version: "1.33.4",
          availability_zone: "ardctest-artm",
          network_driver: "calico",
          template_id: "t-133",
        },
        {
          kubernetes_version: "1.34.0",
          availability_zone: "ardctest-artm",
          network_driver: "calico",
          template_id: "t-134",
        },
        {
          kubernetes_version: "1.33.4",
          availability_zone: "aucklandtest",
          network_driver: "cilium",
          template_id: "t-auck",
        },
      ],
      templates: [target, template, auckland],
      flavors: [
        { name: "m3.small", vcpus: 2, ram_mb: 4096, disk_gb: 30 },
        { name: "m3.medium", vcpus: 4, ram_mb: 8192, disk_gb: 30 },
      ],
      control_plane_sizes: [1, 3, 5, 7],
      quota: { clusters: clusters.length, nodes: 3, hard_limit: 10 },
    }),
  ),
  http.post("/api/kubernetes/clusters", async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      cluster_template_id: string;
      master_count: number;
      node_count: number;
    };
    const created: Cluster = {
      ...clusters[0]!,
      id: `c-${clusters.length + 1}`,
      name: body.name,
      status: "CREATE_IN_PROGRESS",
      health_status: null,
      master_count: body.master_count,
      node_count: body.node_count,
      api_address: null,
      actions: ["config", "certificate", "sign"],
    };
    clusters = [...clusters, created];
    return HttpResponse.json(
      { id: created.id, name: created.name },
      { status: 202 },
    );
  }),
  http.get("/api/kubernetes/clusters/:id/upgrade-options", ({ params }) =>
    HttpResponse.json({
      cluster_id: params["id"],
      can_upgrade: true,
      current_version: "v1.33.4",
      targets: [
        {
          template_id: "t-134",
          name: target.name,
          kubernetes_version: "1.34.0",
        },
      ],
    }),
  ),
  http.post("/api/kubernetes/clusters/:id/upgrade", ({ params }) => {
    clusters = clusters.map((c) =>
      c.id === params["id"]
        ? {
            ...c,
            status: "UPDATE_IN_PROGRESS",
            actions: ["config", "certificate", "sign"],
          }
        : c,
    );
    return HttpResponse.json(
      { id: params["id"], status: "UPDATE_IN_PROGRESS" },
      { status: 202 },
    );
  }),
  http.get("/api/kubernetes/clusters/:id/config", ({ params }) =>
    HttpResponse.json({
      name: clusters.find((c) => c.id === params["id"])?.name ?? "cluster",
      api_address: "https://10.0.0.5:6443",
      kubeconfig: "apiVersion: v1\nkind: Config\n",
      key: "-----BEGIN RSA PRIVATE KEY-----\nmock\n-----END RSA PRIVATE KEY-----\n",
      ca: "-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----\n",
      cert: "-----BEGIN CERTIFICATE-----\ncert\n-----END CERTIFICATE-----\n",
    }),
  ),
  http.post("/api/kubernetes/clusters/:id/sign", () =>
    HttpResponse.json({
      pem: "-----BEGIN CERTIFICATE-----\nsigned\n-----END CERTIFICATE-----\n",
    }),
  ),
  http.get("/api/kubernetes/clusters/:id/nodegroups", ({ params }) =>
    HttpResponse.json({
      items: nodeGroups,
      can_change:
        clusters.find((c) => c.id === params["id"])?.status ===
        "CREATE_COMPLETE",
      cluster_status:
        clusters.find((c) => c.id === params["id"])?.status ?? null,
    }),
  ),
  http.post("/api/kubernetes/clusters/:id/nodegroups", async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      flavor_id: string;
      node_count: number;
      node_labels?: string;
    };
    const created: NodeGroup = {
      ...nodeGroups[1]!,
      id: `ng-${nodeGroups.length + 1}`,
      name: body.name,
      is_default: false,
      status: "CREATE_IN_PROGRESS",
      flavor_id: body.flavor_id,
      node_count: body.node_count,
      node_labels: Object.fromEntries(
        (body.node_labels ?? "")
          .split(",")
          .filter(Boolean)
          .map((pair) => pair.split("=") as [string, string]),
      ),
    };
    nodeGroups = [...nodeGroups, created];
    return HttpResponse.json(created, { status: 202 });
  }),
  http.post(
    "/api/kubernetes/clusters/:id/nodegroups/:ng/resize",
    async ({ params, request }) => {
      const body = (await request.json()) as { node_count: number };
      nodeGroups = nodeGroups.map((g) =>
        g.id === params["ng"]
          ? { ...g, node_count: body.node_count, status: "UPDATE_IN_PROGRESS" }
          : g,
      );
      return HttpResponse.json(
        { id: params["ng"], node_count: body.node_count },
        { status: 202 },
      );
    },
  ),
  http.put(
    "/api/kubernetes/clusters/:id/nodegroups/:ng/autoscaling",
    ({ params }) =>
      HttpResponse.json(nodeGroups.find((g) => g.id === params["ng"])),
  ),
  http.put("/api/kubernetes/clusters/:id/nodegroups/:ng/labels", ({ params }) =>
    HttpResponse.json(nodeGroups.find((g) => g.id === params["ng"])),
  ),
  http.delete("/api/kubernetes/clusters/:id/nodegroups/:ng", ({ params }) => {
    nodeGroups = nodeGroups.filter((g) => g.id !== params["ng"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/kubernetes/clusters/:id", ({ params }) => {
    const found = clusters.find((c) => c.id === params["id"]);
    return found
      ? HttpResponse.json(found)
      : HttpResponse.json(
          { error: "not_found", message: "not found" },
          { status: 404 },
        );
  }),
  http.delete("/api/kubernetes/clusters/:id", ({ params }) => {
    clusters = clusters.filter((c) => c.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/kubernetes/cluster-templates", () =>
    HttpResponse.json({ items: [target, template, auckland] }),
  ),
  http.get("/api/kubernetes/cluster-templates/:id", ({ params }) => {
    const found = [target, template, auckland].find(
      (t) => t.id === params["id"],
    );
    return found
      ? HttpResponse.json(found)
      : HttpResponse.json(
          { error: "not_found", message: "not found" },
          { status: 404 },
        );
  }),

  // load balancers
  http.get("/api/load-balancers", () =>
    HttpResponse.json({ items: loadBalancers }),
  ),
  http.get("/api/load-balancers/options", () =>
    HttpResponse.json({
      subnets: [
        {
          id: "subnet-1",
          name: "private-subnet",
          cidr: "192.168.1.0/24",
          network_id: "private-net",
          network_name: "private",
          ip_version: 4,
        },
      ],
      flavors: [
        {
          id: "f-1",
          name: "default",
          description: "Default octavia loadbalancer flavor",
        },
      ],
      availability_zones: [{ name: "ardctest-artm", description: "" }],
      quota: { load_balancer: 22, listener: 100, member: 200, pool: 100 },
      instances: [
        {
          id: "i-db-1",
          name: "db-1",
          status: "ACTIVE",
          addresses: [{ address: "192.168.1.30", subnet_id: "subnet-1" }],
        },
      ],
      listener_protocols: [
        "HTTP",
        "TCP",
        "TERMINATED_HTTPS",
        "HTTPS",
        "UDP",
        "SCTP",
      ],
      pool_protocols: [
        "HTTP",
        "HTTPS",
        "PROXY",
        "PROXYV2",
        "TCP",
        "UDP",
        "SCTP",
      ],
      algorithms: ["LEAST_CONNECTIONS", "ROUND_ROBIN", "SOURCE_IP"],
      persistence_types: ["SOURCE_IP", "HTTP_COOKIE", "APP_COOKIE"],
      monitor_types: [
        "HTTP",
        "HTTPS",
        "PING",
        "TCP",
        "TLS-HELLO",
        "UDP-CONNECT",
        "SCTP",
      ],
      http_methods: [
        "GET",
        "HEAD",
        "POST",
        "PUT",
        "DELETE",
        "TRACE",
        "OPTIONS",
        "PATCH",
        "CONNECT",
      ],
      l7_actions: [
        "REJECT",
        "REDIRECT_TO_URL",
        "REDIRECT_TO_POOL",
        "REDIRECT_PREFIX",
      ],
      l7_rule_types: ["HOST_NAME", "PATH", "FILE_TYPE", "HEADER", "COOKIE"],
      l7_compare_types: [
        "REGEX",
        "EQUAL_TO",
        "STARTS_WITH",
        "ENDS_WITH",
        "CONTAINS",
      ],
    }),
  ),
  http.post("/api/load-balancers", async ({ request }) => {
    const body = (await request.json()) as {
      name?: string;
      vip_subnet_id: string;
      listener?: { protocol: string; protocol_port: number };
    };
    const created: LoadBalancer = {
      ...loadBalancers[0]!,
      id: `lb-${loadBalancers.length + 1}`,
      name: body.name ?? null,
      provisioning_status: "PENDING_CREATE",
      operating_status: "OFFLINE",
      vip_address: "192.168.1.11",
      listeners: [],
      pools: [],
      can_delete: false,
      is_transitional: true,
    };
    loadBalancers = [...loadBalancers, created];
    setTimeout(() => {
      loadBalancers = loadBalancers.map((lb) =>
        lb.id === created.id
          ? {
              ...lb,
              provisioning_status: "ACTIVE",
              operating_status: "ONLINE",
              can_delete: true,
              is_transitional: false,
            }
          : lb,
      );
    }, 1500);
    return HttpResponse.json(created, { status: 202 });
  }),
  http.get("/api/load-balancers/l7policies/:id", ({ params }) => {
    const found = policies.find((p) => p.id === params["id"]);
    return found
      ? HttpResponse.json({
          ...found,
          rule_rows: [
            {
              id: "r-1",
              type: "PATH",
              compare_type: "STARTS_WITH",
              key: null,
              value: "/admin",
              invert: false,
              provisioning_status: "ACTIVE",
              operating_status: "ONLINE",
              admin_state_up: true,
            },
          ],
        })
      : HttpResponse.json(
          { error: "not_found", message: "not found" },
          { status: 404 },
        );
  }),
  http.post("/api/load-balancers/l7policies", async ({ request }) => {
    const body = (await request.json()) as L7Policy & { listener_id: string };
    const created: L7Policy = {
      ...policies[0]!,
      ...body,
      id: `pol-${policies.length + 1}`,
      rules: [],
      provisioning_status: "PENDING_CREATE",
    };
    policies = [...policies, created];
    return HttpResponse.json(created, { status: 202 });
  }),
  http.post("/api/load-balancers/l7policies/:id/rules", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      { id: "r-new", ...body, provisioning_status: "PENDING_CREATE" },
      { status: 202 },
    );
  }),
  http.delete(
    "/api/load-balancers/l7policies/:id/rules/:rule",
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.delete("/api/load-balancers/l7policies/:id", ({ params }) => {
    policies = policies.filter((p) => p.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.patch(
    "/api/load-balancers/l7policies/:id",
    async ({ params, request }) => {
      const body = (await request.json()) as Partial<L7Policy>;
      policies = policies.map((p) =>
        p.id === params["id"] ? { ...p, ...body } : p,
      );
      return HttpResponse.json(policies.find((p) => p.id === params["id"]));
    },
  ),
  http.post("/api/load-balancers/listeners", async ({ request }) => {
    const body = (await request.json()) as Listener & {
      loadbalancer_id: string;
    };
    const created: Listener = {
      ...listeners[0]!,
      ...body,
      id: `l-${listeners.length + 1}`,
      default_pool_id: body.default_pool_id ?? null,
      l7policies: [],
      provisioning_status: "PENDING_CREATE",
      insert_headers: {},
      allowed_cidrs: body.allowed_cidrs ?? [],
    };
    listeners = [...listeners, created];
    loadBalancers = loadBalancers.map((lb) =>
      lb.id === body.loadbalancer_id
        ? { ...lb, listeners: [...lb.listeners, created.id] }
        : lb,
    );
    return HttpResponse.json(created, { status: 202 });
  }),
  http.patch(
    "/api/load-balancers/listeners/:id",
    async ({ params, request }) => {
      const body = (await request.json()) as Partial<Listener>;
      listeners = listeners.map((l) =>
        l.id === params["id"]
          ? { ...l, ...body, insert_headers: l.insert_headers }
          : l,
      );
      return HttpResponse.json(listeners.find((l) => l.id === params["id"]));
    },
  ),
  http.delete("/api/load-balancers/listeners/:id", ({ params }) => {
    listeners = listeners.filter((l) => l.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("/api/load-balancers/pools", async ({ request }) => {
    const body = (await request.json()) as Pool & {
      loadbalancer_id: string;
      listener_id?: string;
    };
    const created: Pool = {
      ...pools[0]!,
      ...body,
      id: `p-${pools.length + 1}`,
      members: [],
      healthmonitor_id: null,
      listeners: body.listener_id ? [body.listener_id] : [],
      provisioning_status: "PENDING_CREATE",
    };
    pools = [...pools, created];
    return HttpResponse.json(created, { status: 202 });
  }),
  http.patch("/api/load-balancers/pools/:id", async ({ params, request }) => {
    const body = (await request.json()) as Partial<Pool>;
    pools = pools.map((p) => (p.id === params["id"] ? { ...p, ...body } : p));
    return HttpResponse.json(pools.find((p) => p.id === params["id"]));
  }),
  http.delete("/api/load-balancers/pools/:id", ({ params }) => {
    pools = pools.filter((p) => p.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.patch(
    "/api/load-balancers/pools/:pool/members/:id",
    async ({ params, request }) => {
      const body = (await request.json()) as Partial<Member>;
      members = members.map((m) =>
        m.id === params["id"] ? { ...m, ...body } : m,
      );
      return HttpResponse.json(members.find((m) => m.id === params["id"]));
    },
  ),
  http.delete("/api/load-balancers/pools/:pool/members/:id", ({ params }) => {
    members = members.filter((m) => m.id !== params["id"]);
    pools = pools.map((p) => ({
      ...p,
      members: p.members.filter((id) => id !== params["id"]),
    }));
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("/api/load-balancers/monitors", async ({ request }) => {
    const body = (await request.json()) as HealthMonitor & { pool_id: string };
    const created: HealthMonitor = {
      ...monitors[0]!,
      ...body,
      id: `hm-${monitors.length + 1}`,
      pools: [body.pool_id],
      provisioning_status: "PENDING_CREATE",
    };
    monitors = [...monitors, created];
    pools = pools.map((p) =>
      p.id === body.pool_id ? { ...p, healthmonitor_id: created.id } : p,
    );
    return HttpResponse.json(created, { status: 202 });
  }),
  http.patch(
    "/api/load-balancers/monitors/:id",
    async ({ params, request }) => {
      const body = (await request.json()) as Partial<HealthMonitor>;
      monitors = monitors.map((m) =>
        m.id === params["id"] ? { ...m, ...body } : m,
      );
      return HttpResponse.json(monitors.find((m) => m.id === params["id"]));
    },
  ),
  http.delete("/api/load-balancers/monitors/:id", ({ params }) => {
    monitors = monitors.filter((m) => m.id !== params["id"]);
    pools = pools.map((p) =>
      p.healthmonitor_id === params["id"]
        ? { ...p, healthmonitor_id: null }
        : p,
    );
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/load-balancers/:id/tree", ({ params }) => {
    const found = tree(String(params["id"]));
    return found
      ? HttpResponse.json(found)
      : HttpResponse.json(
          { error: "not_found", message: "not found" },
          { status: 404 },
        );
  }),
  http.post("/api/load-balancers/:id/floating-ip", ({ params }) => {
    loadBalancers = loadBalancers.map((lb) =>
      lb.id === params["id"]
        ? { ...lb, floating_ip: { id: "fip-2", address: "203.0.113.9" } }
        : lb,
    );
    return HttpResponse.json({ id: "fip-2" });
  }),
  http.delete("/api/load-balancers/:id/floating-ip", ({ params }) => {
    loadBalancers = loadBalancers.map((lb) =>
      lb.id === params["id"] ? { ...lb, floating_ip: null } : lb,
    );
    return HttpResponse.json({ id: "fip-1" });
  }),
  http.put("/api/load-balancers/:id/pools/:pool/members", () =>
    HttpResponse.json({ items: members }),
  ),
  http.post(
    "/api/load-balancers/:id/pools/:pool/members",
    async ({ params, request }) => {
      const body = (await request.json()) as Member;
      const created: Member = {
        ...members[0]!,
        ...body,
        id: `m-${members.length + 1}`,
        provisioning_status: "PENDING_CREATE",
      };
      members = [...members, created];
      pools = pools.map((p) =>
        p.id === params["pool"]
          ? { ...p, members: [...p.members, created.id] }
          : p,
      );
      return HttpResponse.json(created, { status: 202 });
    },
  ),
  http.get("/api/load-balancers/:id", ({ params }) => {
    const found = loadBalancers.find((lb) => lb.id === params["id"]);
    return found
      ? HttpResponse.json({ ...found, chain: null })
      : HttpResponse.json(
          { error: "not_found", message: "not found" },
          { status: 404 },
        );
  }),
  http.patch("/api/load-balancers/:id", async ({ params, request }) => {
    const body = (await request.json()) as Partial<LoadBalancer>;
    loadBalancers = loadBalancers.map((lb) =>
      lb.id === params["id"] ? { ...lb, ...body } : lb,
    );
    return HttpResponse.json(
      loadBalancers.find((lb) => lb.id === params["id"]),
    );
  }),
  http.delete("/api/load-balancers/:id", ({ params }) => {
    loadBalancers = loadBalancers.filter((lb) => lb.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
];
