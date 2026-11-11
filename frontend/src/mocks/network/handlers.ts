// Mocked API for the network panels: networks with subnets and ports,
// routers, floating IPs with port forwardings, trunks and the topology.
// The in-memory state is the backend for one page load; handlers change
// it in place, so a create or delete shows up in the following list.
import { http, HttpResponse } from "msw";
import type {
  FloatingIp,
  FloatingIpTarget,
  Network,
  NetworkDetail,
  NetworkExtensions,
  NetworkOptions,
  NetworkQuota,
  Port,
  PortForwarding,
  Router,
  RouterDetail,
  SubnetDetail,
  Topology,
  Trunk,
} from "../../lib/api/types/network";
import {
  networks as computeNetworks,
  ports as attachablePorts,
} from "../compute/handlers";
import { cidrsOverlap, parseCidr } from "../../lib/net";
import { nextId, PROJECT_ID } from "../ids";
import { apiError, notFound, readBody, type Reply } from "../http";
import {
  addInterfaceBody,
  allowedAddressPairsBody,
  floatingIpAllocateBody,
  floatingIpAssociateBody,
  networkCreateBody,
  networkUpdateBody,
  portCreateBody,
  portForwardingCreateBody,
  portForwardingUpdateBody,
  portUpdateBody,
  routerCreateBody,
  routerGatewayBody,
  routerRoutesBody,
  routerUpdateBody,
  subnetCreateBody,
  subnetUpdateBody,
  subportsAddBody,
  subportsRemoveBody,
  trunkCreateBody,
  trunkUpdateBody,
} from "./schemas";

/** The browser's address as the mocked ingress reports it. */
export const MY_ADDRESS = "198.51.100.23";

/** The host part of the last floating IP the mock handed out. */
let lastFloatingHost = 110;
const CLASSIC = "00000000-0000-0000-0000-000000000000";

export const extensions: NetworkExtensions = {
  port_forwarding: true,
  trunk: true,
  dns_integration: false,
  extraroute: true,
  network_availability_zone: true,
  router_availability_zone: true,
  subnet_allocation: false,
  port_security: true,
  allowed_address_pairs: true,
};

let quota: NetworkQuota = {
  network: { used: 1, reserved: 0, limit: 5 },
  subnet: { used: 1, reserved: 0, limit: 10 },
  port: { used: 4, reserved: 0, limit: -1 },
  router: { used: 2, reserved: 0, limit: 5 },
  floatingip: { used: 2, reserved: 0, limit: 5 },
  security_group: { used: 2, reserved: 0, limit: 10 },
  security_group_rule: { used: 6, reserved: 0, limit: 100 },
  trunk: { used: 1, reserved: 0, limit: -1 },
};

function network(
  overrides: Partial<Network> & { id: string; name: string },
): Network {
  return {
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
    availability_zones: ["nova"],
    tags: [],
    subnets: [],
    created_at: "2026-08-01T00:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

function subnet(
  overrides: Partial<SubnetDetail> & {
    id: string;
    network_id: string;
    cidr: string;
  },
): SubnetDetail {
  const version = parseCidr(overrides.cidr)?.version ?? 4;
  // Neutron's default gateway, the network's first address, for the
  // ranges the mock creates ("10.1.0.0/24", "fd00::/64").
  const base = overrides.cidr.split("/")[0] ?? "";
  return {
    name: null,
    ip_version: version,
    gateway_ip: version === 4 ? base.replace(/\.0$/, ".1") : `${base}1`,
    enable_dhcp: true,
    project_id: PROJECT_ID,
    allocation_pools: [],
    dns_nameservers: ["1.1.1.1", "1.0.0.1"],
    host_routes: [],
    subnetpool_id: null,
    ipv6_address_mode: null,
    ipv6_ra_mode: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

function port(
  overrides: Partial<Port> & { id: string; network_id: string },
): Port {
  return {
    name: "",
    description: "",
    network_name: null,
    project_id: PROJECT_ID,
    status: "ACTIVE",
    admin_state_up: true,
    mac_address: "fa:16:3e:00:00:10",
    device_id: "",
    device_owner: "",
    device_type: null,
    device_name: null,
    fixed_ips: [],
    security_groups: ["secgroup-default"],
    port_security_enabled: true,
    allowed_address_pairs: [],
    vnic_type: "normal",
    trunk_id: null,
    created_at: "2026-08-02T00:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

const classicNetwork = computeNetworks.find((n) => n.id === CLASSIC)!;
const privateNetwork = computeNetworks.find((n) => n.id === "net-private")!;

export let subnets: SubnetDetail[] = [
  subnet({
    id: "subnet-1",
    name: "private-subnet",
    network_id: "net-private",
    cidr: "10.0.0.0/24",
    gateway_ip: "10.0.0.1",
    allocation_pools: [{ start: "10.0.0.2", end: "10.0.0.254" }],
  }),
  subnet({
    id: "subnet-ext",
    name: "ardctest-artm-subnet",
    network_id: "net-ext",
    cidr: "203.0.113.0/24",
    gateway_ip: "203.0.113.1",
    project_id: "admin",
  }),
];

export let networks: Network[] = [
  network({
    ...classicNetwork,
    is_project: false,
    project_id: "admin",
    availability_zones: [],
  }),
  network({
    ...privateNetwork,
    description: "The project's private network",
  }),
  network({
    id: "net-ext",
    name: "ardctest-artm",
    is_external: true,
    is_project: false,
    project_id: "admin",
    mtu: 1500,
    tags: ["nectar:floating"],
    availability_zones: [],
    subnets: [
      {
        id: "subnet-ext",
        name: "ardctest-artm-subnet",
        cidr: "203.0.113.0/24",
        ip_version: 4,
        gateway_ip: "203.0.113.1",
        enable_dhcp: false,
      },
    ],
  }),
];

export let ports: Port[] = [
  port({
    id: "port-router-1",
    network_id: "net-private",
    network_name: "private-net",
    device_id: "r-1",
    device_owner: "network:router_interface",
    device_type: "network:router_interface",
    mac_address: "fa:16:3e:00:00:11",
    fixed_ips: [{ ip_address: "10.0.0.1", subnet_id: "subnet-1" }],
    security_groups: [],
  }),
  port({
    id: "port-db-2",
    network_id: "net-private",
    network_name: "private-net",
    device_id: "i-db-1",
    device_owner: "compute:nova",
    device_type: "compute",
    mac_address: "fa:16:3e:00:00:03",
    fixed_ips: [{ ip_address: "10.0.0.5", subnet_id: "subnet-1" }],
  }),
  port({
    id: "port-spare",
    name: "spare-port",
    network_id: "net-private",
    network_name: "private-net",
    status: "DOWN",
    mac_address: "fa:16:3e:00:00:99",
    fixed_ips: [{ ip_address: "10.0.0.20", subnet_id: "subnet-1" }],
  }),
  port({
    id: "port-trunk-parent",
    name: "trunk-parent",
    network_id: "net-private",
    network_name: "private-net",
    status: "DOWN",
    mac_address: "fa:16:3e:00:00:98",
    fixed_ips: [{ ip_address: "10.0.0.30", subnet_id: "subnet-1" }],
  }),
  port({
    id: "port-trunk-child",
    name: "trunk-child",
    network_id: "net-private",
    network_name: "private-net",
    status: "DOWN",
    mac_address: "fa:16:3e:00:00:97",
    fixed_ips: [{ ip_address: "10.0.0.31", subnet_id: "subnet-1" }],
  }),
];

function router(
  overrides: Partial<Router> & { id: string; name: string },
): Router {
  return {
    description: "",
    status: "ACTIVE",
    admin_state_up: true,
    project_id: PROJECT_ID,
    external_gateway: null,
    routes: [],
    availability_zones: ["nova"],
    created_at: "2026-08-01T00:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

export let routers: Router[] = [
  router({
    id: "r-1",
    name: "default",
    external_gateway: {
      network_id: "net-ext",
      network_name: "ardctest-artm",
      enable_snat: true,
      fixed_ips: [{ ip_address: "203.0.113.50", subnet_id: "subnet-ext" }],
    },
    routes: [{ destination: "10.9.0.0/16", nexthop: "10.0.0.9" }],
  }),
  router({ id: "r-2", name: "backup", status: "DOWN", admin_state_up: false }),
];

function fip(
  overrides: Partial<FloatingIp> & { id: string; floating_ip_address: string },
): FloatingIp {
  return {
    floating_network_id: "net-ext",
    pool_name: "ardctest-artm",
    fixed_ip_address: null,
    port_id: null,
    router_id: null,
    status: "DOWN",
    description: "",
    dns_name: "",
    dns_domain: "",
    instance_id: null,
    instance_name: null,
    instance_type: null,
    port_forwarding_count: 0,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

export let floatingIps: FloatingIp[] = [
  fip({
    id: "fip-1",
    floating_ip_address: "203.0.113.100",
    fixed_ip_address: "10.0.0.5",
    port_id: "port-db-2",
    router_id: "r-1",
    status: "ACTIVE",
    description: "database",
    instance_id: "i-db-1",
    instance_name: "db-1",
    instance_type: "compute",
  }),
  fip({ id: "fip-2", floating_ip_address: "203.0.113.101" }),
  fip({
    id: "fip-3",
    floating_ip_address: "203.0.113.102",
    description: "ssh jump",
    port_forwarding_count: 1,
  }),
];

let portForwardings: PortForwarding[] = [
  {
    id: "pf-1",
    floating_ip_id: "fip-3",
    floating_ip_address: "203.0.113.102",
    protocol: "tcp",
    external_port: "2222",
    internal_port: "22",
    internal_ip_address: "10.0.0.20",
    internal_port_id: "port-spare",
    description: "ssh to the spare port",
  },
];

export let trunks: Trunk[] = [
  {
    id: "trunk-1",
    name: "trunk-1",
    description: "",
    status: "ACTIVE",
    admin_state_up: true,
    project_id: PROJECT_ID,
    port_id: "port-trunk-parent",
    port_name: "trunk-parent",
    sub_ports: [
      {
        port_id: "port-trunk-child",
        port_name: "trunk-child",
        segmentation_type: "vlan",
        segmentation_id: 100,
      },
    ],
    subport_count: 1,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: null,
  },
];

const floatingNetworks = () =>
  networks
    .filter((n) => n.is_external && n.tags.includes("nectar:floating"))
    .map((n) => ({ id: n.id, name: n.name }));

function options(): NetworkOptions {
  return {
    extensions,
    availability_zones: { network: ["nova"], router: ["nova"] },
    subnetpools: [],
    floating_networks: floatingNetworks(),
    quota,
    default_dns_nameservers: [],
    enable_ipv6: true,
    floating_ip_address_allowed: false,
    errors: {},
  };
}

/** Port addresses behind a router with a floating gateway, as the
 * backend's FloatingIpManager port would list them. */
function targets(instanceId?: string | null): FloatingIpTarget[] {
  const gatewayRouters = new Set(
    routers.filter((r) => r.external_gateway).map((r) => r.id),
  );
  const reachable = new Set(
    ports
      .filter(
        (p) =>
          p.device_owner === "network:router_interface" &&
          gatewayRouters.has(p.device_id),
      )
      .flatMap((p) => p.fixed_ips.map((ip) => ip.subnet_id)),
  );
  const names = SERVER_NAMES;
  return ports
    .filter((p) => !p.device_owner.startsWith("network:"))
    .filter((p) => !instanceId || p.device_id === instanceId)
    .flatMap((p) =>
      p.fixed_ips
        .filter((ip) => ip.subnet_id && reachable.has(ip.subnet_id))
        .map((ip) => ({
          id: `${p.id}_${ip.ip_address}`,
          port_id: p.id,
          ip_address: ip.ip_address ?? "",
          instance_id: p.device_id || null,
          instance_name: names[p.device_id] ?? null,
          name: `${names[p.device_id] ?? p.name} ${ip.ip_address}`,
        })),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The instance names the mocked servers carry, by id. */
const SERVER_NAMES: Record<string, string> = {
  "i-web-1": "web-1",
  "i-db-1": "db-1",
};

/** `port` with its device named, as a port's page and its network's page
 * show it. */
function withDeviceName(port: Port): Port {
  const name = port.device_owner.startsWith("compute:")
    ? SERVER_NAMES[port.device_id]
    : port.device_owner.startsWith("network:router")
      ? routers.find((r) => r.id === port.device_id)?.name
      : undefined;
  return { ...port, device_name: name ?? null };
}

/** The ports that keep a network from being deleted: all but DHCP's. */
function portsInUse(networkId: string): number {
  return ports.filter(
    (p) => p.network_id === networkId && p.device_owner !== "network:dhcp",
  ).length;
}

function detail(net: Network): NetworkDetail {
  return {
    ...net,
    ports_in_use: portsInUse(net.id),
    subnets: subnets.filter((s) => s.network_id === net.id),
    ports: ports.filter((p) => p.network_id === net.id).map(withDeviceName),
  };
}

function routerDetail(r: Router): RouterDetail {
  const gateway = r.external_gateway;
  return {
    ...r,
    interfaces: [
      ...(gateway
        ? [
            {
              ...port({
                id: `gateway-${r.id}`,
                network_id: gateway.network_id ?? "",
                network_name: gateway.network_name,
                device_id: r.id,
                device_owner: "network:router_gateway",
                fixed_ips: gateway.fixed_ips,
                security_groups: [],
              }),
              kind: "gateway" as const,
            },
          ]
        : []),
      ...ports
        .filter((p) => p.device_id === r.id)
        .map((p) => ({ ...p, kind: "interface" as const })),
    ],
  };
}

function topology(): Topology {
  return {
    networks: [...networks].sort(
      (a, b) =>
        Number(b.is_external) - Number(a.is_external) ||
        a.name.localeCompare(b.name),
    ),
    routers: routers.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      admin_state_up: r.admin_state_up,
      external_network_id: r.external_gateway?.network_id ?? null,
    })),
    ports: [
      ...ports.map((p) => ({
        id: p.id,
        name: p.name,
        network_id: p.network_id,
        device_id: p.device_id,
        device_owner: p.device_owner,
        status: p.status,
        fixed_ips: p.fixed_ips,
      })),
      {
        id: "port-web-1",
        name: "",
        network_id: CLASSIC,
        device_id: "i-web-1",
        device_owner: "compute:nova",
        status: "ACTIVE",
        fixed_ips: [
          { ip_address: "203.0.113.10", subnet_id: "subnet-classic" },
        ],
      },
      ...routers
        .filter((r) => r.external_gateway?.network_id)
        .map((r) => ({
          id: `gateway-${r.id}`,
          name: "",
          network_id: r.external_gateway?.network_id ?? null,
          device_id: r.id,
          device_owner: "network:router_gateway",
          status: null,
          fixed_ips: [],
        })),
    ],
    servers: [
      { id: "i-web-1", name: "web-1", status: "ACTIVE" },
      { id: "i-db-1", name: "db-1", status: "SHUTOFF" },
      { id: "i-err-1", name: "broken", status: "ERROR" },
    ],
  };
}

export const networkHandlers = [
  http.get("/api/network/options", () =>
    HttpResponse.json<Reply<"/api/network/options", "get">>(options()),
  ),
  http.get("/api/network/extensions", () =>
    HttpResponse.json<Reply<"/api/network/extensions", "get">>(extensions),
  ),
  http.get("/api/network/quota", () =>
    HttpResponse.json<Reply<"/api/network/quota", "get">>(quota),
  ),
  http.get("/api/network/my-address", () =>
    HttpResponse.json<Reply<"/api/network/my-address", "get">>({
      address: MY_ADDRESS,
      ip_version: 4,
    }),
  ),
  http.get("/api/network/topology", () =>
    HttpResponse.json<Reply<"/api/network/topology", "get">>(topology()),
  ),

  http.get("/api/network/networks", ({ request }) => {
    const params = new URL(request.url).searchParams;
    const purpose = params.get("purpose") ?? "any";
    const external = params.get("external") === "true";
    let items = networks.filter((n) => !n.is_external || n.is_project);
    if (purpose === "router") items = items.filter((n) => n.is_project);
    if (purpose === "boot") {
      items = items.filter((n) => n.is_classic || n.subnets.length > 0);
    }
    if (external) {
      items = [
        ...items,
        ...networks.filter((n) => n.is_external && !n.is_project),
      ].map((n) => ({ ...n, ports_in_use: portsInUse(n.id) }));
    }
    return HttpResponse.json<Reply<"/api/network/networks", "get">>({ items });
  }),
  http.post("/api/network/networks", async ({ request }) => {
    const body = await readBody(request, networkCreateBody);
    const id = nextId("net");
    const created = network({
      id,
      name: body.name || id,
      admin_state_up: body.admin_state_up ?? true,
      mtu: body.mtu ?? 1450,
      port_security_enabled: body.port_security_enabled ?? true,
      availability_zones: body.availability_zone_hints ?? [],
      created_at: new Date().toISOString(),
    });
    if (body.subnet) {
      const sid = nextId("subnet");
      const sub = subnet({
        id: sid,
        name: body.subnet.name ?? null,
        network_id: id,
        cidr: body.subnet.cidr ?? "10.1.0.0/24",
        ipv6_ra_mode: body.subnet.ipv6_ra_mode ?? null,
        ipv6_address_mode: body.subnet.ipv6_address_mode ?? null,
        ...(body.subnet.no_gateway
          ? { gateway_ip: null }
          : body.subnet.gateway_ip
            ? { gateway_ip: body.subnet.gateway_ip }
            : {}),
        enable_dhcp: body.subnet.enable_dhcp ?? true,
        allocation_pools: body.subnet.allocation_pools ?? [],
        dns_nameservers: body.subnet.dns_nameservers ?? [],
        host_routes: body.subnet.host_routes ?? [],
      });
      subnets.push(sub);
      created.subnets = [
        {
          id: sub.id,
          name: sub.name,
          cidr: sub.cidr,
          ip_version: sub.ip_version,
          gateway_ip: sub.gateway_ip,
          enable_dhcp: sub.enable_dhcp,
        },
      ];
      quota = {
        ...quota,
        subnet: { ...quota.subnet!, used: quota.subnet!.used + 1 },
      };
    }
    networks.push(created);
    quota = {
      ...quota,
      network: { ...quota.network!, used: quota.network!.used + 1 },
    };
    return HttpResponse.json<Reply<"/api/network/networks", "post">>(created, {
      status: 201,
    });
  }),
  http.get("/api/network/networks/:id", ({ params }) => {
    const found = networks.find((n) => n.id === params["id"]);
    return found
      ? HttpResponse.json<Reply<"/api/network/networks/{network_id}", "get">>(
          detail(found),
        )
      : notFound("network not found");
  }),
  http.patch("/api/network/networks/:id", async ({ params, request }) => {
    const found = networks.find((n) => n.id === params["id"]);
    if (!found) return notFound("network not found");
    const body = await readBody(request, networkUpdateBody);
    if (body.name !== undefined) found.name = body.name || found.id;
    if (body.admin_state_up !== undefined)
      found.admin_state_up = body.admin_state_up;
    return HttpResponse.json<
      Reply<"/api/network/networks/{network_id}", "patch">
    >(found);
  }),
  http.delete("/api/network/networks/:id", ({ params }) => {
    const found = networks.find((n) => n.id === params["id"]);
    if (!found) return notFound("network not found");
    if (portsInUse(found.id) > 0) {
      return apiError(
        409,
        "conflict",
        `Unable to complete operation on network ${found.id}. There are one or more ports still in use on the network.`,
      );
    }
    networks = networks.filter((n) => n.id !== found.id);
    subnets = subnets.filter((s) => s.network_id !== found.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/network/subnets", async ({ request }) => {
    const body = await readBody(request, subnetCreateBody);
    const net = networks.find((n) => n.id === body.network_id);
    if (!net) return notFound("network not found");
    const sub = subnet({
      id: nextId("subnet"),
      name: body.name ?? null,
      network_id: body.network_id,
      cidr: body.cidr ?? "10.1.0.0/24",
      ipv6_ra_mode: body.ipv6_ra_mode ?? null,
      ipv6_address_mode: body.ipv6_address_mode ?? null,
      ...(body.no_gateway
        ? { gateway_ip: null }
        : body.gateway_ip
          ? { gateway_ip: body.gateway_ip }
          : {}),
      enable_dhcp: body.enable_dhcp ?? true,
      allocation_pools: body.allocation_pools ?? [],
      dns_nameservers: body.dns_nameservers ?? [],
      host_routes: body.host_routes ?? [],
      created_at: new Date().toISOString(),
    });
    subnets.push(sub);
    net.subnets = [
      ...net.subnets,
      {
        id: sub.id,
        name: sub.name,
        cidr: sub.cidr,
        ip_version: sub.ip_version,
        gateway_ip: sub.gateway_ip,
        enable_dhcp: sub.enable_dhcp,
      },
    ];
    return HttpResponse.json<Reply<"/api/network/subnets", "post">>(sub, {
      status: 201,
    });
  }),
  http.get("/api/network/subnets/:id", ({ params }) => {
    const found = subnets.find((s) => s.id === params["id"]);
    return found
      ? HttpResponse.json<Reply<"/api/network/subnets/{subnet_id}", "get">>(
          found,
        )
      : notFound("subnet not found");
  }),
  http.patch("/api/network/subnets/:id", async ({ params, request }) => {
    const found = subnets.find((s) => s.id === params["id"]);
    if (!found) return notFound("subnet not found");
    const body = await readBody(request, subnetUpdateBody);
    if (body.name !== undefined) found.name = body.name;
    if (body.no_gateway) found.gateway_ip = null;
    else if (body.gateway_ip) found.gateway_ip = body.gateway_ip;
    if (body.enable_dhcp !== undefined) found.enable_dhcp = body.enable_dhcp;
    if (body.allocation_pools) found.allocation_pools = body.allocation_pools;
    if (body.dns_nameservers) found.dns_nameservers = body.dns_nameservers;
    if (body.host_routes) found.host_routes = body.host_routes;
    return HttpResponse.json<
      Reply<"/api/network/subnets/{subnet_id}", "patch">
    >(found);
  }),
  http.delete("/api/network/subnets/:id", ({ params }) => {
    const found = subnets.find((s) => s.id === params["id"]);
    if (!found) return notFound("subnet not found");
    subnets = subnets.filter((s) => s.id !== found.id);
    const net = networks.find((n) => n.id === found.network_id);
    if (net) net.subnets = net.subnets.filter((s) => s.id !== found.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/network/ports", () =>
    HttpResponse.json<Reply<"/api/network/ports", "get">>({
      items: attachablePorts,
    }),
  ),
  http.post("/api/network/ports", async ({ request }) => {
    const body = await readBody(request, portCreateBody);
    const net = networks.find((n) => n.id === body.network_id);
    if (!net) return notFound("network not found");
    const created = port({
      id: nextId("port"),
      name: body.name ?? "",
      network_id: net.id,
      network_name: net.name,
      status: "DOWN",
      admin_state_up: body.admin_state_up ?? true,
      device_id: body.device_id ?? "",
      device_owner: body.device_owner ?? "",
      fixed_ips: [
        {
          ip_address: body.fixed_ip ?? "10.0.0.77",
          subnet_id: body.subnet_id ?? net.subnets[0]?.id ?? null,
        },
      ],
      mac_address: body.mac_address ?? "fa:16:3e:00:00:77",
      port_security_enabled: body.port_security_enabled ?? true,
      security_groups: body.security_groups ?? [],
      created_at: new Date().toISOString(),
    });
    ports.push(created);
    return HttpResponse.json<Reply<"/api/network/ports", "post">>(created, {
      status: 201,
    });
  }),
  http.get("/api/network/ports/:id", ({ params }) => {
    const found = ports.find((p) => p.id === params["id"]);
    return found
      ? HttpResponse.json<Reply<"/api/network/ports/{port_id}", "get">>(
          withDeviceName(found),
        )
      : notFound("port not found");
  }),
  http.put(
    "/api/network/ports/:id/allowed-address-pairs",
    async ({ params, request }) => {
      const found = ports.find((p) => p.id === params["id"]);
      if (!found) return notFound("port not found");
      const body = await readBody(request, allowedAddressPairsBody);
      found.allowed_address_pairs = body.pairs.map((pair) => ({
        ip_address: pair.ip_address,
        mac_address: pair.mac_address ?? found.mac_address,
      }));
      return HttpResponse.json<
        Reply<"/api/network/ports/{port_id}/allowed-address-pairs", "put">
      >(withDeviceName(found));
    },
  ),
  http.patch("/api/network/ports/:id", async ({ params, request }) => {
    const found = ports.find((p) => p.id === params["id"]);
    if (!found) return notFound("port not found");
    const body = await readBody(request, portUpdateBody);
    if (body.name !== undefined) found.name = body.name;
    if (body.admin_state_up !== undefined)
      found.admin_state_up = body.admin_state_up;
    if (body.port_security_enabled !== undefined) {
      found.port_security_enabled = body.port_security_enabled;
      if (!body.port_security_enabled) found.security_groups = [];
    }
    if (body.security_groups) found.security_groups = body.security_groups;
    return HttpResponse.json<Reply<"/api/network/ports/{port_id}", "patch">>(
      found,
    );
  }),
  http.delete("/api/network/ports/:id", ({ params }) => {
    ports = ports.filter((p) => p.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/network/routers", () =>
    HttpResponse.json<Reply<"/api/network/routers", "get">>({ items: routers }),
  ),
  http.post("/api/network/routers", async ({ request }) => {
    const body = await readBody(request, routerCreateBody);
    const id = nextId("r");
    const external = floatingNetworks().find(
      (n) => n.id === body.external_network_id,
    );
    const created = router({
      id,
      name: body.name || id,
      admin_state_up: body.admin_state_up ?? true,
      availability_zones: body.availability_zone_hints ?? ["nova"],
      external_gateway: external
        ? {
            network_id: external.id,
            network_name: external.name,
            enable_snat: true,
            fixed_ips: [
              { ip_address: "203.0.113.60", subnet_id: "subnet-ext" },
            ],
          }
        : null,
      created_at: new Date().toISOString(),
    });
    routers.push(created);
    quota = {
      ...quota,
      router: { ...quota.router!, used: quota.router!.used + 1 },
    };
    return HttpResponse.json<Reply<"/api/network/routers", "post">>(created, {
      status: 201,
    });
  }),
  http.get("/api/network/routers/:id", ({ params }) => {
    const found = routers.find((r) => r.id === params["id"]);
    return found
      ? HttpResponse.json<Reply<"/api/network/routers/{router_id}", "get">>(
          routerDetail(found),
        )
      : notFound("router not found");
  }),
  http.patch("/api/network/routers/:id", async ({ params, request }) => {
    const found = routers.find((r) => r.id === params["id"]);
    if (!found) return notFound("router not found");
    const body = await readBody(request, routerUpdateBody);
    if (body.name !== undefined) found.name = body.name || found.id;
    if (body.admin_state_up !== undefined)
      found.admin_state_up = body.admin_state_up;
    return HttpResponse.json<
      Reply<"/api/network/routers/{router_id}", "patch">
    >(found);
  }),
  http.delete("/api/network/routers/:id", ({ params }) => {
    routers = routers.filter((r) => r.id !== params["id"]);
    ports = ports.filter((p) => p.device_id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.put("/api/network/routers/:id/gateway", async ({ params, request }) => {
    const found = routers.find((r) => r.id === params["id"]);
    if (!found) return notFound("router not found");
    const body = await readBody(request, routerGatewayBody);
    const external = floatingNetworks().find((n) => n.id === body.network_id);
    if (!external) {
      return apiError(
        400,
        "bad_request",
        "the network is not available as a gateway",
      );
    }
    found.external_gateway = {
      network_id: external.id,
      network_name: external.name,
      enable_snat: true,
      fixed_ips: [{ ip_address: "203.0.113.61", subnet_id: "subnet-ext" }],
    };
    return HttpResponse.json<
      Reply<"/api/network/routers/{router_id}/gateway", "put">
    >(found);
  }),
  http.delete("/api/network/routers/:id/gateway", ({ params }) => {
    const found = routers.find((r) => r.id === params["id"]);
    if (!found) return notFound("router not found");
    found.external_gateway = null;
    return HttpResponse.json<
      Reply<"/api/network/routers/{router_id}/gateway", "delete">
    >(found);
  }),
  http.get("/api/network/routers/:id/interface-candidates", ({ params }) => {
    const used = new Set(
      ports
        .filter((p) => p.device_id === params["id"])
        .flatMap((p) => p.fixed_ips.map((ip) => ip.subnet_id)),
    );
    const attached = subnets.filter((s) => used.has(s.id));
    const items = subnets
      .filter(
        (s) => s.project_id === PROJECT_ID && s.gateway_ip && !used.has(s.id),
      )
      .map((s) => {
        const overlapping = attached.find((other) =>
          cidrsOverlap(s.cidr ?? "", other.cidr ?? ""),
        );
        return {
          id: s.id,
          name: s.name,
          cidr: s.cidr,
          ip_version: s.ip_version,
          gateway_ip: s.gateway_ip,
          enable_dhcp: s.enable_dhcp,
          network_id: s.network_id,
          network_name:
            networks.find((n) => n.id === s.network_id)?.name ?? null,
          overlaps: overlapping?.cidr ?? null,
        };
      });
    return HttpResponse.json<
      Reply<"/api/network/routers/{router_id}/interface-candidates", "get">
    >({ items });
  }),
  http.post(
    "/api/network/routers/:id/interfaces",
    async ({ params, request }) => {
      const found = routers.find((r) => r.id === params["id"]);
      if (!found) return notFound("router not found");
      const body = await readBody(request, addInterfaceBody);
      const sub = subnets.find((s) => s.id === body.subnet_id);
      if (!sub) return notFound("subnet not found");
      const address = body.ip_address ?? sub.gateway_ip ?? "10.0.0.1";
      const created = port({
        id: nextId("port"),
        network_id: sub.network_id ?? "",
        network_name:
          networks.find((n) => n.id === sub.network_id)?.name ?? null,
        device_id: found.id,
        device_owner: "network:router_interface",
        device_type: "network:router_interface",
        fixed_ips: [{ ip_address: address, subnet_id: sub.id }],
        security_groups: [],
      });
      ports.push(created);
      return HttpResponse.json<
        Reply<"/api/network/routers/{router_id}/interfaces", "post">
      >(
        {
          status: "accepted",
          port_id: created.id,
          subnet_id: sub.id,
          ip_address: address,
        },
        { status: 202 },
      );
    },
  ),
  http.delete("/api/network/routers/:id/interfaces/:portId", ({ params }) => {
    const found = routers.find((r) => r.id === params["id"]);
    if (!found) return notFound("router not found");
    if (params["portId"] === `gateway-${found.id}`) {
      found.external_gateway = null;
    } else {
      ports = ports.filter((p) => p.id !== params["portId"]);
    }
    return new HttpResponse(null, { status: 204 });
  }),
  http.put("/api/network/routers/:id/routes", async ({ params, request }) => {
    const found = routers.find((r) => r.id === params["id"]);
    if (!found) return notFound("router not found");
    const body = await readBody(request, routerRoutesBody);
    found.routes = body.routes;
    return HttpResponse.json<
      Reply<"/api/network/routers/{router_id}/routes", "put">
    >(found);
  }),

  http.get("/api/network/floating-ips", () =>
    HttpResponse.json<Reply<"/api/network/floating-ips", "get">>({
      items: floatingIps,
    }),
  ),
  http.post("/api/network/floating-ips", async ({ request }) => {
    const body = await readBody(request, floatingIpAllocateBody);
    if (body.floating_ip_address && !options().floating_ip_address_allowed) {
      return apiError(
        400,
        "bad_request",
        "choosing the floating IP address is not available",
      );
    }
    const pool = floatingNetworks().find(
      (n) => n.id === body.floating_network_id,
    );
    if (!pool) return notFound("floating network not found");
    const created = fip({
      id: nextId("fip"),
      floating_ip_address:
        body.floating_ip_address ?? `203.0.113.${(lastFloatingHost += 1)}`,
      floating_network_id: pool.id,
      pool_name: pool.name,
      description: body.description ?? "",
      created_at: new Date().toISOString(),
    });
    floatingIps.push(created);
    quota = {
      ...quota,
      floatingip: { ...quota.floatingip!, used: quota.floatingip!.used + 1 },
    };
    return HttpResponse.json<Reply<"/api/network/floating-ips", "post">>(
      created,
      { status: 201 },
    );
  }),
  http.get("/api/network/floating-ips/targets", ({ request }) =>
    HttpResponse.json<Reply<"/api/network/floating-ips/targets", "get">>({
      items: targets(new URL(request.url).searchParams.get("instance_id")),
    }),
  ),
  http.get("/api/network/floating-ips/:id", ({ params }) => {
    const found = floatingIps.find((f) => f.id === params["id"]);
    return found
      ? HttpResponse.json<Reply<"/api/network/floating-ips/{fip_id}", "get">>(
          found,
        )
      : notFound("floating IP not found");
  }),
  http.post(
    "/api/network/floating-ips/:id/associate",
    async ({ params, request }) => {
      const found = floatingIps.find((f) => f.id === params["id"]);
      if (!found) return notFound("floating IP not found");
      const body = await readBody(request, floatingIpAssociateBody);
      const target = ports.find((p) => p.id === body.port_id);
      if (
        floatingIps.some((f) => f.port_id === body.port_id && f.id !== found.id)
      ) {
        return apiError(
          409,
          "conflict",
          "The requested instance port is already associated with another floating IP.",
        );
      }
      found.port_id = body.port_id;
      found.fixed_ip_address =
        body.fixed_ip_address ?? target?.fixed_ips[0]?.ip_address ?? null;
      found.status = "ACTIVE";
      found.router_id = "r-1";
      found.instance_id = target?.device_id || null;
      found.instance_name =
        target?.device_id === "i-db-1"
          ? "db-1"
          : target?.device_id === "i-web-1"
            ? "web-1"
            : null;
      found.instance_type = target?.device_type ?? null;
      return HttpResponse.json<
        Reply<"/api/network/floating-ips/{fip_id}/associate", "post">
      >(found);
    },
  ),
  http.post("/api/network/floating-ips/:id/disassociate", ({ params }) => {
    const found = floatingIps.find((f) => f.id === params["id"]);
    if (!found) return notFound("floating IP not found");
    found.port_id = null;
    found.fixed_ip_address = null;
    found.status = "DOWN";
    found.router_id = null;
    found.instance_id = null;
    found.instance_name = null;
    found.instance_type = null;
    return HttpResponse.json<
      Reply<"/api/network/floating-ips/{fip_id}/disassociate", "post">
    >(found);
  }),
  http.delete("/api/network/floating-ips/:id", ({ params }) => {
    floatingIps = floatingIps.filter((f) => f.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/network/port-forwardings", ({ request }) => {
    const fipId = new URL(request.url).searchParams.get("floating_ip_id");
    return HttpResponse.json<Reply<"/api/network/port-forwardings", "get">>({
      items: fipId
        ? portForwardings.filter((r) => r.floating_ip_id === fipId)
        : portForwardings,
    });
  }),
  http.post(
    "/api/network/floating-ips/:id/port-forwardings",
    async ({ params, request }) => {
      const found = floatingIps.find((f) => f.id === params["id"]);
      if (!found) return notFound("floating IP not found");
      const body = await readBody(request, portForwardingCreateBody);
      const created: PortForwarding = {
        id: nextId("pf"),
        floating_ip_id: found.id,
        floating_ip_address: found.floating_ip_address,
        protocol: body.protocol,
        external_port: body.external_port,
        internal_port: body.internal_port,
        internal_ip_address: body.internal_ip_address,
        internal_port_id: body.internal_port_id,
        description: body.description ?? "",
      };
      portForwardings.push(created);
      found.port_forwarding_count += 1;
      return HttpResponse.json<
        Reply<"/api/network/floating-ips/{fip_id}/port-forwardings", "post">
      >(created, { status: 201 });
    },
  ),
  http.patch(
    "/api/network/floating-ips/:id/port-forwardings/:ruleId",
    async ({ params, request }) => {
      const found = portForwardings.find((r) => r.id === params["ruleId"]);
      if (!found) return notFound("rule not found");
      const body = await readBody(request, portForwardingUpdateBody);
      Object.assign(found, {
        ...(body.protocol ? { protocol: body.protocol } : {}),
        ...(body.external_port ? { external_port: body.external_port } : {}),
        ...(body.internal_port ? { internal_port: body.internal_port } : {}),
        ...(body.internal_ip_address
          ? { internal_ip_address: body.internal_ip_address }
          : {}),
        ...(body.internal_port_id
          ? { internal_port_id: body.internal_port_id }
          : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
      });
      return HttpResponse.json<
        Reply<
          "/api/network/floating-ips/{fip_id}/port-forwardings/{rule_id}",
          "patch"
        >
      >(found);
    },
  ),
  http.delete(
    "/api/network/floating-ips/:id/port-forwardings/:ruleId",
    ({ params }) => {
      portForwardings = portForwardings.filter(
        (r) => r.id !== params["ruleId"],
      );
      const found = floatingIps.find((f) => f.id === params["id"]);
      if (found)
        found.port_forwarding_count = Math.max(
          0,
          found.port_forwarding_count - 1,
        );
      return new HttpResponse(null, { status: 204 });
    },
  ),

  http.get("/api/network/trunks", () =>
    HttpResponse.json<Reply<"/api/network/trunks", "get">>({ items: trunks }),
  ),
  http.get("/api/network/trunks/options", () => {
    const inTrunk = new Set(
      trunks.flatMap((t) => [t.port_id, ...t.sub_ports.map((s) => s.port_id)]),
    );
    const free = ports.filter(
      (p) =>
        p.admin_state_up &&
        !inTrunk.has(p.id) &&
        !p.device_owner.startsWith("network:"),
    );
    return HttpResponse.json<Reply<"/api/network/trunks/options", "get">>({
      parents: free,
      subports: free.filter((p) => !p.device_owner),
    });
  }),
  http.post("/api/network/trunks", async ({ request }) => {
    const body = await readBody(request, trunkCreateBody);
    const parent = ports.find((p) => p.id === body.port_id);
    const created: Trunk = {
      id: nextId("trunk"),
      name: body.name ?? "",
      description: body.description ?? "",
      status: "ACTIVE",
      admin_state_up: body.admin_state_up ?? true,
      project_id: PROJECT_ID,
      port_id: body.port_id,
      port_name: parent?.name ?? null,
      sub_ports: body.sub_ports.map((s) => ({
        port_id: s.port_id,
        port_name: ports.find((p) => p.id === s.port_id)?.name ?? null,
        segmentation_type: s.segmentation_type,
        segmentation_id: s.segmentation_id ?? null,
      })),
      subport_count: body.sub_ports.length,
      created_at: new Date().toISOString(),
      updated_at: null,
    };
    trunks.push(created);
    return HttpResponse.json<Reply<"/api/network/trunks", "post">>(created, {
      status: 201,
    });
  }),
  http.get("/api/network/trunks/:id", ({ params }) => {
    const found = trunks.find((t) => t.id === params["id"]);
    return found
      ? HttpResponse.json<Reply<"/api/network/trunks/{trunk_id}", "get">>(found)
      : notFound("trunk not found");
  }),
  http.patch("/api/network/trunks/:id", async ({ params, request }) => {
    const found = trunks.find((t) => t.id === params["id"]);
    if (!found) return notFound("trunk not found");
    const body = await readBody(request, trunkUpdateBody);
    Object.assign(found, body);
    return HttpResponse.json<Reply<"/api/network/trunks/{trunk_id}", "patch">>(
      found,
    );
  }),
  http.delete("/api/network/trunks/:id", ({ params }) => {
    trunks = trunks.filter((t) => t.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("/api/network/trunks/:id/subports", async ({ params, request }) => {
    const found = trunks.find((t) => t.id === params["id"]);
    if (!found) return notFound("trunk not found");
    const body = await readBody(request, subportsAddBody);
    found.sub_ports.push(
      ...body.sub_ports.map((s) => ({
        port_id: s.port_id,
        port_name: ports.find((p) => p.id === s.port_id)?.name ?? null,
        segmentation_type: s.segmentation_type,
        segmentation_id: s.segmentation_id ?? null,
      })),
    );
    found.subport_count = found.sub_ports.length;
    return HttpResponse.json<
      Reply<"/api/network/trunks/{trunk_id}/subports", "post">
    >(found);
  }),
  http.post(
    "/api/network/trunks/:id/subports/remove",
    async ({ params, request }) => {
      const found = trunks.find((t) => t.id === params["id"]);
      if (!found) return notFound("trunk not found");
      const body = await readBody(request, subportsRemoveBody);
      found.sub_ports = found.sub_ports.filter(
        (s) => !body.port_ids.includes(s.port_id ?? ""),
      );
      found.subport_count = found.sub_ports.length;
      return HttpResponse.json<
        Reply<"/api/network/trunks/{trunk_id}/subports/remove", "post">
      >(found);
    },
  ),
];
