// Mocked API for the Kubernetes panels: cluster templates, clusters and
// node groups.
// The in-memory state is the backend for one page load; handlers change
// it in place, so a create or delete shows up in the following list.
import { http, HttpResponse } from "msw";
import type {
  Cluster,
  ClusterTemplate,
  NodeGroup,
} from "../../lib/api/types/kubernetes";
import { notFound, readBody, type Reply } from "../http";
import {
  clusterCreateBody,
  nodeGroupCreateBody,
  nodeGroupResizeBody,
} from "./schemas";

const template: ClusterTemplate = {
  id: "t-133",
  name: "kubernetes-v1.33.4-ardctest-artm-calico-v5",
  coe: "kubernetes",
  image_id: "img-ubuntu",
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
    image_id: "img-ubuntu",
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
    image_id: "img-ubuntu",
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

export const kubernetesHandlers = [
  http.get("/api/kubernetes/clusters", () =>
    HttpResponse.json<Reply<"/api/kubernetes/clusters", "get">>({
      items: clusters,
      quota: { clusters: clusters.length, nodes: 3, hard_limit: 10 },
    }),
  ),
  http.get("/api/kubernetes/clusters/options", () =>
    HttpResponse.json<Reply<"/api/kubernetes/clusters/options", "get">>({
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
    const body = await readBody(request, clusterCreateBody);
    const created: Cluster = {
      ...clusters[0]!,
      id: `c-${clusters.length + 1}`,
      name: body.name,
      status: "CREATE_IN_PROGRESS",
      health_status: null,
      master_count: body.master_count,
      node_count: body.node_count,
      api_address: null,
      // Magnum accepts a delete while the cluster is being created.
      actions: ["config", "certificate", "sign", "delete"],
    };
    clusters = [...clusters, created];
    return HttpResponse.json<Reply<"/api/kubernetes/clusters", "post">>(
      { id: created.id, name: created.name },
      { status: 202 },
    );
  }),
  http.get("/api/kubernetes/clusters/:id/upgrade-options", ({ params }) =>
    HttpResponse.json<
      Reply<"/api/kubernetes/clusters/{cluster_id}/upgrade-options", "get">
    >({
      cluster_id: String(params["id"]),
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
    return HttpResponse.json<
      Reply<"/api/kubernetes/clusters/{cluster_id}/upgrade", "post">
    >(
      { id: String(params["id"]), status: "UPDATE_IN_PROGRESS" },
      { status: 202 },
    );
  }),
  http.get("/api/kubernetes/clusters/:id/config", ({ params }) =>
    HttpResponse.json<
      Reply<"/api/kubernetes/clusters/{cluster_id}/config", "get">
    >({
      name: clusters.find((c) => c.id === params["id"])?.name ?? "cluster",
      api_address: "https://10.0.0.5:6443",
      kubeconfig: "apiVersion: v1\nkind: Config\n",
      key: "-----BEGIN RSA PRIVATE KEY-----\nmock\n-----END RSA PRIVATE KEY-----\n",
      ca: "-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----\n",
      cert: "-----BEGIN CERTIFICATE-----\ncert\n-----END CERTIFICATE-----\n",
    }),
  ),
  http.get("/api/kubernetes/clusters/:id/ca.pem", ({ params }) =>
    clusters.some((c) => c.id === params["id"])
      ? new HttpResponse(
          "-----BEGIN CERTIFICATE-----\nMIIBmock\n-----END CERTIFICATE-----\n",
          {
            headers: {
              "Content-Type": "application/x-pem-file",
              "Content-Disposition": 'attachment; filename="ca.pem"',
            },
          },
        )
      : notFound(),
  ),
  http.post("/api/kubernetes/clusters/:id/sign", () =>
    HttpResponse.json<
      Reply<"/api/kubernetes/clusters/{cluster_id}/sign", "post">
    >({
      pem: "-----BEGIN CERTIFICATE-----\nsigned\n-----END CERTIFICATE-----\n",
    }),
  ),
  http.get("/api/kubernetes/clusters/:id/nodegroups", ({ params }) =>
    HttpResponse.json<
      Reply<"/api/kubernetes/clusters/{cluster_id}/nodegroups", "get">
    >({
      items: nodeGroups,
      can_change:
        clusters.find((c) => c.id === params["id"])?.status ===
        "CREATE_COMPLETE",
      cluster_status:
        clusters.find((c) => c.id === params["id"])?.status ?? null,
    }),
  ),
  http.get("/api/kubernetes/clusters/:id/nodegroups/:ng", ({ params }) => {
    const found = nodeGroups.find((g) => g.id === params["ng"]);
    return found
      ? HttpResponse.json<
          Reply<
            "/api/kubernetes/clusters/{cluster_id}/nodegroups/{nodegroup_id}",
            "get"
          >
        >(found)
      : notFound("node group not found", "magnum");
  }),
  http.post("/api/kubernetes/clusters/:id/nodegroups", async ({ request }) => {
    const body = await readBody(request, nodeGroupCreateBody);
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
    return HttpResponse.json<
      Reply<"/api/kubernetes/clusters/{cluster_id}/nodegroups", "post">
    >(created, { status: 202 });
  }),
  http.post(
    "/api/kubernetes/clusters/:id/nodegroups/:ng/resize",
    async ({ params, request }) => {
      const body = await readBody(request, nodeGroupResizeBody);
      nodeGroups = nodeGroups.map((g) =>
        g.id === params["ng"]
          ? { ...g, node_count: body.node_count, status: "UPDATE_IN_PROGRESS" }
          : g,
      );
      return HttpResponse.json<
        Reply<
          "/api/kubernetes/clusters/{cluster_id}/nodegroups/{nodegroup_id}/resize",
          "post"
        >
      >(
        { id: String(params["ng"]), node_count: body.node_count },
        { status: 202 },
      );
    },
  ),
  http.put(
    "/api/kubernetes/clusters/:id/nodegroups/:ng/autoscaling",
    ({ params }) =>
      HttpResponse.json<
        Reply<
          "/api/kubernetes/clusters/{cluster_id}/nodegroups/{nodegroup_id}/autoscaling",
          "put"
        >
      >(nodeGroups.find((g) => g.id === params["ng"])),
  ),
  http.put("/api/kubernetes/clusters/:id/nodegroups/:ng/labels", ({ params }) =>
    HttpResponse.json<
      Reply<
        "/api/kubernetes/clusters/{cluster_id}/nodegroups/{nodegroup_id}/labels",
        "put"
      >
    >(nodeGroups.find((g) => g.id === params["ng"])),
  ),
  http.delete("/api/kubernetes/clusters/:id/nodegroups/:ng", ({ params }) => {
    nodeGroups = nodeGroups.filter((g) => g.id !== params["ng"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/kubernetes/clusters/:id", ({ params }) => {
    const found = clusters.find((c) => c.id === params["id"]);
    return found
      ? HttpResponse.json<
          Reply<"/api/kubernetes/clusters/{cluster_id}", "get">
        >(found)
      : notFound();
  }),
  http.delete("/api/kubernetes/clusters/:id", ({ params }) => {
    clusters = clusters.filter((c) => c.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/kubernetes/cluster-templates", () =>
    HttpResponse.json<Reply<"/api/kubernetes/cluster-templates", "get">>({
      items: [target, template, auckland],
    }),
  ),
  http.get("/api/kubernetes/cluster-templates/:id", ({ params }) => {
    const found = [target, template, auckland].find(
      (t) => t.id === params["id"],
    );
    return found
      ? HttpResponse.json<
          Reply<"/api/kubernetes/cluster-templates/{template_id}", "get">
        >(found)
      : notFound();
  }),
];
