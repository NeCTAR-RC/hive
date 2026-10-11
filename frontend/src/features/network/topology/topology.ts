// Turns the topology payload into the list the page draws: each network
// with its subnets and the devices attached to it (instances and routers
// by their ports), the external networks first. Horizon draws this as a
// graph; Hive lists it so it reads on a phone and with a screen reader.
import type { Topology, TopologyPort } from "../../../lib/api/types";

export interface TopologyAttachment {
  kind: "instance" | "router" | "gateway" | "port";
  id: string;
  name: string;
  status: string | null;
  addresses: string[];
  /** Route target: an instance, router or port detail page. */
  href: string | null;
}

export interface TopologyNetwork {
  id: string;
  name: string;
  status: string | null;
  isExternal: boolean;
  isShared: boolean;
  isProject: boolean;
  subnets: { id: string; name: string | null; cidr: string | null }[];
  attachments: TopologyAttachment[];
}

export interface TopologyIsland {
  kind: "instance" | "router";
  id: string;
  name: string;
  status: string | null;
  href: string;
}

function ownerLabel(owner: string): string {
  if (owner.startsWith("network:dhcp")) return "DHCP agent";
  if (owner.startsWith("network:")) return owner.replace("network:", "");
  if (owner.startsWith("neutron:LOADBALANCER")) return "Load balancer";
  return owner || "Unattached port";
}

export function buildTopology(data: Topology): {
  networks: TopologyNetwork[];
  /** Instances and routers with no port on a listed network. */
  islands: TopologyIsland[];
} {
  const servers = new Map(data.servers.map((s) => [s.id, s]));
  const routers = new Map(data.routers.map((r) => [r.id, r]));
  const byNetwork = new Map<string, TopologyPort[]>();
  for (const port of data.ports) {
    if (!port.network_id) continue;
    byNetwork.set(port.network_id, [
      ...(byNetwork.get(port.network_id) ?? []),
      port,
    ]);
  }
  const attachedDevices = new Set<string>();

  const networks = data.networks.map((network) => {
    const ports = byNetwork.get(network.id) ?? [];
    const seen = new Map<string, TopologyAttachment>();
    for (const port of ports) {
      const addresses = port.fixed_ips
        .map((ip) => ip.ip_address)
        .filter((ip): ip is string => !!ip);
      const server = servers.get(port.device_id);
      const router = routers.get(port.device_id);
      let attachment: TopologyAttachment;
      if (server) {
        attachment = {
          kind: "instance",
          id: server.id,
          name: server.name,
          status: server.status,
          addresses,
          href: `/compute/instances/${server.id}`,
        };
      } else if (router) {
        const gateway = port.device_owner === "network:router_gateway";
        attachment = {
          kind: gateway ? "gateway" : "router",
          id: router.id,
          name: router.name,
          status: router.status,
          addresses,
          href: `/network/routers/${router.id}`,
        };
      } else {
        attachment = {
          kind: "port",
          id: port.id,
          name: port.name || ownerLabel(port.device_owner),
          status: port.status,
          addresses,
          href: port.id.startsWith("gateway-")
            ? null
            : `/network/ports/${port.id}`,
        };
      }
      if (attachment.kind !== "port") attachedDevices.add(attachment.id);
      const key = `${attachment.kind}:${attachment.id}`;
      const existing = seen.get(key);
      if (existing) {
        existing.addresses = [...existing.addresses, ...addresses];
      } else {
        seen.set(key, attachment);
      }
    }
    const attachments = [...seen.values()].sort((a, b) => {
      const order = { gateway: 0, router: 1, instance: 2, port: 3 };
      return (
        order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, "en-AU")
      );
    });
    return {
      id: network.id,
      name: network.name,
      status: network.status,
      isExternal: network.is_external,
      isShared: network.is_shared,
      isProject: network.is_project,
      subnets: network.subnets.map((s) => ({
        id: s.id,
        name: s.name,
        cidr: s.cidr,
      })),
      attachments,
    };
  });

  const islands: TopologyIsland[] = [
    ...data.routers
      .filter((r) => !attachedDevices.has(r.id))
      .map((r) => ({
        kind: "router" as const,
        id: r.id,
        name: r.name,
        status: r.status,
        href: `/network/routers/${r.id}`,
      })),
    ...data.servers
      .filter((s) => !attachedDevices.has(s.id))
      .map((s) => ({
        kind: "instance" as const,
        id: s.id,
        name: s.name,
        status: s.status,
        href: `/compute/instances/${s.id}`,
      })),
  ];
  return { networks, islands };
}
