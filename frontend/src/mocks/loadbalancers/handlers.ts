// Mocked API for the load balancer panels: load balancers, listeners,
// pools, members, health monitors and L7 policies.
// The in-memory state is the backend for one page load; handlers change
// it in place, so a create or delete shows up in the following list.
import { http, HttpResponse } from "msw";
import type { FloatingIp } from "../../lib/api/types/network";
import type {
  HealthMonitor,
  L7Policy,
  L7Rule,
  Listener,
  LoadBalancer,
  Member,
  Pool,
  PoolSpec,
} from "../../lib/api/types/loadbalancers";
import { apiError, notFound, readBody, type Reply } from "../http";
import {
  l7PolicyCreateBody,
  l7PolicyUpdateBody,
  l7RuleCreateBody,
  l7RuleUpdateBody,
  listenerCreateBody,
  listenerUpdateBody,
  loadBalancerCreateBody,
  loadBalancerUpdateBody,
  memberCreateBody,
  memberUpdateBody,
  monitorCreateBody,
  monitorUpdateBody,
  poolCreateBody,
  poolUpdateBody,
} from "./schemas";

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
  {
    // Busy and staying busy, so a page can show a load balancer that takes
    // no changes without racing a timer.
    id: "lb-2",
    name: "rebuilding",
    description: "Being rebuilt",
    provisioning_status: "PENDING_UPDATE",
    operating_status: "ONLINE",
    admin_state_up: true,
    vip_address: "192.168.1.12",
    vip_port_id: "port-vip-2",
    vip_subnet_id: "subnet-1",
    vip_network_id: "private-net",
    provider: "ovn",
    flavor_id: null,
    availability_zone: "ardctest-artm",
    listeners: [],
    pools: [],
    floating_ip: null,
    created_at: "2026-06-03T09:00:00",
    updated_at: null,
    can_delete: false,
    is_transitional: true,
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

/** Each policy's rules, by policy id; a policy not listed has none. */
let rulesByPolicy: Record<string, L7Rule[]> = {
  "pol-1": [
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
};

/** A policy's rules. */
function rulesOf(policyId: string): L7Rule[] {
  return rulesByPolicy[policyId] ?? [];
}

/** Stores a policy's new rules and keeps its rule ids in step. */
function setRules(policyId: string, rules: L7Rule[]) {
  rulesByPolicy = { ...rulesByPolicy, [policyId]: rules };
  policies = policies.map((p) =>
    p.id === policyId ? { ...p, rules: rules.map((r) => r.id) } : p,
  );
}

/** The load balancer tree the detail pages load, also used by unit tests. */
export function loadBalancerTree(lbId: string) {
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

/** A provisioning status after Octavia has finished with the object. */
function settled<T extends { provisioning_status: string | null }>(item: T): T {
  return item.provisioning_status?.startsWith("PENDING_")
    ? { ...item, provisioning_status: "ACTIVE" }
    : item;
}

/**
 * The load balancers whose pending status ends on the next read of the
 * list or of their tree: a new one, or one failing over. Like the children
 * below they read as pending once and active on the next poll, so no timer
 * decides what a test sees.
 */
const settlesOnRead = new Set<string>();

/** A load balancer once Octavia has finished with it. */
function active(lb: LoadBalancer): LoadBalancer {
  return {
    ...lb,
    provisioning_status: "ACTIVE",
    operating_status: "ONLINE",
    can_delete: true,
    is_transitional: false,
  };
}

/** Finishes the load balancers that were waiting for a read. */
function settleLoadBalancers() {
  loadBalancers = loadBalancers.map((lb) =>
    settlesOnRead.delete(lb.id) ? active(lb) : lb,
  );
}

/**
 * The 409 the backend answers a listener, pool or member change with while
 * its load balancer is not ACTIVE (`load_balancer_busy`), or null when the
 * change may go ahead.
 */
function busyRefusal(lbId: string) {
  const status = loadBalancers.find(
    (lb) => lb.id === lbId,
  )?.provisioning_status;
  if (!status || status === "ACTIVE") return null;
  return apiError(
    409,
    "load_balancer_busy",
    `The load balancer is ${status}; try again once it is ACTIVE.`,
    "octavia",
  );
}

/**
 * Finishes every pending listener, pool, member, monitor and L7 policy.
 * The tree handler calls it after answering, so a new child shows as
 * pending on the read after its create and as active on the next poll,
 * and the tree stops polling without waiting on a timer.
 */
function settleChildren() {
  listeners = listeners.map(settled);
  pools = pools.map(settled);
  members = members.map(settled);
  monitors = monitors.map(settled);
  policies = policies.map(settled);
}

/**
 * The floating IP a load balancer's associate or disassociate answers
 * with: on the VIP's port while `lb` holds it, on no port once released.
 */
function floatingIpReply(
  fip: { id: string; address: string },
  lb: LoadBalancer | null,
): FloatingIp {
  return {
    id: fip.id,
    floating_ip_address: fip.address,
    floating_network_id: null,
    pool_name: null,
    fixed_ip_address: lb?.vip_address ?? null,
    port_id: lb?.vip_port_id ?? null,
    router_id: null,
    status: lb ? "ACTIVE" : "DOWN",
    description: "",
    dns_name: "",
    dns_domain: "",
    instance_id: null,
    instance_name: null,
    instance_type: null,
    port_forwarding_count: 0,
    created_at: null,
    updated_at: null,
  };
}

/** A pool's stored session persistence from what a request asked for. */
function persistence(
  requested: PoolSpec["session_persistence"],
): Pool["session_persistence"] {
  return requested?.type
    ? { type: requested.type, cookie_name: requested.cookie_name ?? null }
    : null;
}

export const loadBalancerHandlers = [
  http.get("/api/load-balancers", () => {
    const response = HttpResponse.json<Reply<"/api/load-balancers", "get">>({
      items: loadBalancers,
    });
    settleLoadBalancers();
    return response;
  }),
  http.get("/api/load-balancers/options", () =>
    HttpResponse.json<Reply<"/api/load-balancers/options", "get">>({
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
      barbican_available: true,
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
    const body = await readBody(request, loadBalancerCreateBody);
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
    settlesOnRead.add(created.id);
    return HttpResponse.json<Reply<"/api/load-balancers", "post">>(created, {
      status: 202,
    });
  }),
  http.get("/api/load-balancers/l7policies/:id", ({ params }) => {
    const id = String(params["id"]);
    const found = policies.find((p) => p.id === id);
    if (!found) return notFound();
    const response = HttpResponse.json<
      Reply<"/api/load-balancers/l7policies/{policy_id}", "get">
    >({ ...found, rule_rows: rulesOf(id) });
    // A new or changed rule reads as pending once, then as active.
    setRules(id, rulesOf(id).map(settled));
    return response;
  }),
  http.post("/api/load-balancers/l7policies", async ({ request }) => {
    const body = await readBody(request, l7PolicyCreateBody);
    const created: L7Policy = {
      ...policies[0]!,
      ...body,
      id: `pol-${policies.length + 1}`,
      rules: [],
      provisioning_status: "PENDING_CREATE",
    };
    policies = [...policies, created];
    return HttpResponse.json<Reply<"/api/load-balancers/l7policies", "post">>(
      created,
      { status: 202 },
    );
  }),
  http.post(
    "/api/load-balancers/l7policies/:id/rules",
    async ({ params, request }) => {
      const id = String(params["id"]);
      const body = await readBody(request, l7RuleCreateBody);
      const rule: L7Rule = {
        id: `r-${id}-${rulesOf(id).length + 1}`,
        type: body.type,
        compare_type: body.compare_type,
        key: body.key ?? null,
        value: body.value,
        invert: body.invert ?? false,
        provisioning_status: "PENDING_CREATE",
        operating_status: "OFFLINE",
        admin_state_up: body.admin_state_up ?? true,
      };
      setRules(id, [...rulesOf(id), rule]);
      return HttpResponse.json<
        Reply<"/api/load-balancers/l7policies/{policy_id}/rules", "post">
      >(rule, { status: 202 });
    },
  ),
  http.patch(
    "/api/load-balancers/l7policies/:id/rules/:rule",
    async ({ params, request }) => {
      const id = String(params["id"]);
      const found = rulesOf(id).find((r) => r.id === params["rule"]);
      if (!found) return notFound();
      const body = await readBody(request, l7RuleUpdateBody);
      const updated: L7Rule = {
        ...found,
        type: body.type ?? found.type,
        compare_type: body.compare_type ?? found.compare_type,
        key: body.key === undefined ? found.key : body.key,
        value: body.value ?? found.value,
        invert: body.invert ?? found.invert,
        admin_state_up: body.admin_state_up ?? found.admin_state_up,
        provisioning_status: "PENDING_UPDATE",
      };
      setRules(
        id,
        rulesOf(id).map((r) => (r.id === found.id ? updated : r)),
      );
      return HttpResponse.json<
        Reply<
          "/api/load-balancers/l7policies/{policy_id}/rules/{rule_id}",
          "patch"
        >
      >(updated);
    },
  ),
  http.delete(
    "/api/load-balancers/l7policies/:id/rules/:rule",
    ({ params }) => {
      const id = String(params["id"]);
      setRules(
        id,
        rulesOf(id).filter((r) => r.id !== params["rule"]),
      );
      return new HttpResponse(null, { status: 204 });
    },
  ),
  http.delete("/api/load-balancers/l7policies/:id", ({ params }) => {
    policies = policies.filter((p) => p.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.patch(
    "/api/load-balancers/l7policies/:id",
    async ({ params, request }) => {
      const body = await readBody(request, l7PolicyUpdateBody);
      policies = policies.map((p) =>
        p.id === params["id"]
          ? { ...p, ...body, action: body.action ?? p.action }
          : p,
      );
      return HttpResponse.json<
        Reply<"/api/load-balancers/l7policies/{policy_id}", "patch">
      >(policies.find((p) => p.id === params["id"]));
    },
  ),
  http.post("/api/load-balancers/listeners", async ({ request }) => {
    const body = await readBody(request, listenerCreateBody);
    const busy = busyRefusal(body.loadbalancer_id);
    if (busy) return busy;
    const created: Listener = {
      ...listeners[0]!,
      ...body,
      // A listener created without a name has none, not the sample's.
      name: body.name ?? null,
      description: body.description ?? null,
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
    return HttpResponse.json<Reply<"/api/load-balancers/listeners", "post">>(
      created,
      { status: 202 },
    );
  }),
  http.patch(
    "/api/load-balancers/listeners/:id",
    async ({ params, request }) => {
      const body = await readBody(request, listenerUpdateBody);
      listeners = listeners.map((l) =>
        l.id === params["id"]
          ? {
              ...l,
              ...body,
              // null clears a list; a field left out keeps it.
              allowed_cidrs:
                body.allowed_cidrs === undefined
                  ? l.allowed_cidrs
                  : (body.allowed_cidrs ?? []),
              sni_container_refs:
                body.sni_container_refs === undefined
                  ? l.sni_container_refs
                  : (body.sni_container_refs ?? []),
              insert_headers: l.insert_headers,
            }
          : l,
      );
      return HttpResponse.json<
        Reply<"/api/load-balancers/listeners/{listener_id}", "patch">
      >(listeners.find((l) => l.id === params["id"]));
    },
  ),
  http.delete("/api/load-balancers/listeners/:id", ({ params }) => {
    listeners = listeners.filter((l) => l.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("/api/load-balancers/pools", async ({ request }) => {
    // The listener the pool joins is not a pool field; it is listed below.
    const { listener_id: listenerId, ...spec } = await readBody(
      request,
      poolCreateBody,
    );
    const busy = busyRefusal(spec.loadbalancer_id);
    if (busy) return busy;
    const created: Pool = {
      ...pools[0]!,
      ...spec,
      session_persistence: persistence(spec.session_persistence),
      id: `p-${pools.length + 1}`,
      members: [],
      healthmonitor_id: null,
      listeners: listenerId ? [listenerId] : [],
      provisioning_status: "PENDING_CREATE",
    };
    pools = [...pools, created];
    return HttpResponse.json<Reply<"/api/load-balancers/pools", "post">>(
      created,
      { status: 202 },
    );
  }),
  http.patch("/api/load-balancers/pools/:id", async ({ params, request }) => {
    const body = await readBody(request, poolUpdateBody);
    pools = pools.map((p) =>
      p.id === params["id"]
        ? {
            ...p,
            ...body,
            session_persistence:
              body.session_persistence === undefined
                ? p.session_persistence
                : persistence(body.session_persistence),
          }
        : p,
    );
    return HttpResponse.json<
      Reply<"/api/load-balancers/pools/{pool_id}", "patch">
    >(pools.find((p) => p.id === params["id"]));
  }),
  http.delete("/api/load-balancers/pools/:id", ({ params }) => {
    pools = pools.filter((p) => p.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.patch(
    "/api/load-balancers/pools/:pool/members/:id",
    async ({ params, request }) => {
      const body = await readBody(request, memberUpdateBody);
      members = members.map((m) =>
        m.id === params["id"] ? { ...m, ...body } : m,
      );
      return HttpResponse.json<
        Reply<
          "/api/load-balancers/pools/{pool_id}/members/{member_id}",
          "patch"
        >
      >(members.find((m) => m.id === params["id"]));
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
    // The pool the monitor watches is not a monitor field; it is listed below.
    const { pool_id: poolId, ...spec } = await readBody(
      request,
      monitorCreateBody,
    );
    const created: HealthMonitor = {
      ...monitors[0]!,
      ...spec,
      id: `hm-${monitors.length + 1}`,
      pools: [poolId],
      provisioning_status: "PENDING_CREATE",
    };
    monitors = [...monitors, created];
    pools = pools.map((p) =>
      p.id === poolId ? { ...p, healthmonitor_id: created.id } : p,
    );
    return HttpResponse.json<Reply<"/api/load-balancers/monitors", "post">>(
      created,
      { status: 202 },
    );
  }),
  http.patch(
    "/api/load-balancers/monitors/:id",
    async ({ params, request }) => {
      const body = await readBody(request, monitorUpdateBody);
      monitors = monitors.map((m) =>
        m.id === params["id"] ? { ...m, ...body } : m,
      );
      return HttpResponse.json<
        Reply<"/api/load-balancers/monitors/{monitor_id}", "patch">
      >(monitors.find((m) => m.id === params["id"]));
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
    const found = loadBalancerTree(String(params["id"]));
    if (!found) return notFound();
    const response =
      HttpResponse.json<Reply<"/api/load-balancers/{lb_id}/tree", "get">>(
        found,
      );
    settleChildren();
    settleLoadBalancers();
    return response;
  }),
  http.post("/api/load-balancers/:id/failover", ({ params }) => {
    const found = loadBalancers.find((lb) => lb.id === params["id"]);
    if (!found) return notFound("load balancer not found", "octavia");
    // Octavia rebuilds the amphorae; the balancer is pending until it is done.
    loadBalancers = loadBalancers.map((lb) =>
      lb.id === found.id
        ? {
            ...lb,
            provisioning_status: "PENDING_UPDATE",
            is_transitional: true,
          }
        : lb,
    );
    settlesOnRead.add(found.id);
    return HttpResponse.json<
      Reply<"/api/load-balancers/{lb_id}/failover", "post">
    >({ id: found.id }, { status: 202 });
  }),
  http.post("/api/load-balancers/:id/floating-ip", ({ params }) => {
    const found = loadBalancers.find((lb) => lb.id === params["id"]);
    if (!found) return notFound();
    const fip = { id: "fip-2", address: "203.0.113.9" };
    loadBalancers = loadBalancers.map((lb) =>
      lb.id === found.id ? { ...lb, floating_ip: fip } : lb,
    );
    return HttpResponse.json<
      Reply<"/api/load-balancers/{lb_id}/floating-ip", "post">
    >(floatingIpReply(fip, found));
  }),
  http.delete("/api/load-balancers/:id/floating-ip", ({ params }) => {
    const found = loadBalancers.find((lb) => lb.id === params["id"]);
    if (!found?.floating_ip) return notFound();
    const fip = found.floating_ip;
    loadBalancers = loadBalancers.map((lb) =>
      lb.id === found.id ? { ...lb, floating_ip: null } : lb,
    );
    return HttpResponse.json<
      Reply<"/api/load-balancers/{lb_id}/floating-ip", "delete">
    >(floatingIpReply(fip, null));
  }),
  http.put("/api/load-balancers/:id/pools/:pool/members", ({ params }) => {
    const busy = busyRefusal(String(params["id"]));
    if (busy) return busy;
    return HttpResponse.json<
      Reply<"/api/load-balancers/{lb_id}/pools/{pool_id}/members", "put">
    >({ items: members, pending: 0 });
  }),
  http.post(
    "/api/load-balancers/:id/pools/:pool/members",
    async ({ params, request }) => {
      const body = await readBody(request, memberCreateBody);
      const busy = busyRefusal(String(params["id"]));
      if (busy) return busy;
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
      return HttpResponse.json<
        Reply<"/api/load-balancers/{lb_id}/pools/{pool_id}/members", "post">
      >(created, { status: 202 });
    },
  ),
  http.get("/api/load-balancers/:id", ({ params }) => {
    const found = loadBalancers.find((lb) => lb.id === params["id"]);
    return found
      ? HttpResponse.json<Reply<"/api/load-balancers/{lb_id}", "get">>({
          ...found,
          chain: null,
        })
      : notFound();
  }),
  http.patch("/api/load-balancers/:id", async ({ params, request }) => {
    const body = await readBody(request, loadBalancerUpdateBody);
    loadBalancers = loadBalancers.map((lb) =>
      lb.id === params["id"] ? { ...lb, ...body } : lb,
    );
    return HttpResponse.json<Reply<"/api/load-balancers/{lb_id}", "patch">>(
      loadBalancers.find((lb) => lb.id === params["id"]),
    );
  }),
  http.delete("/api/load-balancers/:id", ({ params }) => {
    loadBalancers = loadBalancers.filter((lb) => lb.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
];
