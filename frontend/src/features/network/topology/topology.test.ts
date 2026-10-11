import { describe, expect, it } from "vitest";
import type { Network, Topology } from "../../../lib/api/types";
import { buildTopology } from "./topology";

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
    project_id: "p1",
    mtu: 1500,
    port_security_enabled: true,
    availability_zones: [],
    tags: [],
    subnets: [],
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

const DATA: Topology = {
  networks: [
    network({
      id: "net-ext",
      name: "ardctest-artm",
      is_external: true,
      is_project: false,
      subnets: [
        {
          id: "s-ext",
          name: null,
          cidr: "203.0.113.0/24",
          ip_version: 4,
          gateway_ip: null,
          enable_dhcp: null,
        },
      ],
    }),
    network({
      id: "net-priv",
      name: "private",
      subnets: [
        {
          id: "s-priv",
          name: "private",
          cidr: "192.168.1.0/24",
          ip_version: 4,
          gateway_ip: "192.168.1.1",
          enable_dhcp: true,
        },
      ],
    }),
  ],
  routers: [
    {
      id: "r-1",
      name: "default",
      status: "ACTIVE",
      admin_state_up: true,
      external_network_id: "net-ext",
    },
    {
      id: "r-2",
      name: "lonely",
      status: "ACTIVE",
      admin_state_up: true,
      external_network_id: null,
    },
  ],
  ports: [
    {
      id: "gateway-r-1",
      name: "",
      network_id: "net-ext",
      device_id: "r-1",
      device_owner: "network:router_gateway",
      status: null,
      fixed_ips: [],
    },
    {
      id: "p-r1",
      name: "",
      network_id: "net-priv",
      device_id: "r-1",
      device_owner: "network:router_interface",
      status: "ACTIVE",
      fixed_ips: [{ ip_address: "192.168.1.1", subnet_id: "s-priv" }],
    },
    {
      id: "p-web",
      name: "",
      network_id: "net-priv",
      device_id: "srv-1",
      device_owner: "compute:nova",
      status: "ACTIVE",
      fixed_ips: [{ ip_address: "192.168.1.20", subnet_id: "s-priv" }],
    },
    {
      id: "p-dhcp",
      name: "",
      network_id: "net-priv",
      device_id: "dhcp-host",
      device_owner: "network:dhcp",
      status: "ACTIVE",
      fixed_ips: [{ ip_address: "192.168.1.2", subnet_id: "s-priv" }],
    },
  ],
  servers: [
    { id: "srv-1", name: "web", status: "ACTIVE" },
    { id: "srv-2", name: "shelved", status: "SHELVED_OFFLOADED" },
  ],
};

describe("buildTopology", () => {
  it("groups devices under their networks, gateway and routers first", () => {
    const { networks } = buildTopology(DATA);
    expect(networks.map((n) => n.id)).toEqual(["net-ext", "net-priv"]);
    expect(networks[0]?.attachments).toEqual([
      {
        kind: "gateway",
        id: "r-1",
        name: "default",
        status: "ACTIVE",
        addresses: [],
        href: "/network/routers/r-1",
      },
    ]);
    expect(
      networks[1]?.attachments.map((a) => [a.kind, a.name, a.addresses]),
    ).toEqual([
      ["router", "default", ["192.168.1.1"]],
      ["instance", "web", ["192.168.1.20"]],
      ["port", "DHCP agent", ["192.168.1.2"]],
    ]);
    expect(networks[1]?.subnets[0]?.cidr).toBe("192.168.1.0/24");
  });

  it("lists routers and instances with no port as islands", () => {
    const { islands } = buildTopology(DATA);
    expect(islands.map((i) => `${i.kind}:${i.name}`)).toEqual([
      "router:lonely",
      "instance:shelved",
    ]);
  });
});
