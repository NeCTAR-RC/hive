import { describe, expect, it } from "vitest";
import { networks, ports } from "../../../../mocks/network/handlers";
import {
  networkCreateBody,
  networkUpdateBody,
  portCreateBody,
  portUpdateBody,
} from "../../../../mocks/network/schemas";
import { emptySubnetForm } from "../subnetRules";
import {
  createNetworkRequest,
  createPortRequest,
  updateNetworkRequest,
  updatePortRequest,
} from "./request";
import type { CreateNetworkValues, PortValues } from "./schema";

/** The mock fixture a case starts from; the cases override what matters. */
function first<T>(list: T[]): T {
  const [item] = list;
  if (!item) throw new Error("The mock fixture list is empty");
  return item;
}

const network = first(networks);
const port = { ...first(ports), name: "web", security_groups: ["sg-a"] };

const createNetwork: CreateNetworkValues = {
  name: "",
  admin_state_up: true,
  port_security_enabled: true,
  with_subnet: false,
  availability_zone_hints: [],
  mtu: "",
  subnet: emptySubnetForm(["1.1.1.1"]),
};

const portForm: PortValues = {
  name: "",
  admin_state_up: true,
  device_id: "",
  device_owner: "",
  specify_ip: "",
  subnet_id: "",
  fixed_ip: "",
  mac_address: "",
  port_security_enabled: true,
  security_groups: ["sg-default"],
};

describe("createNetworkRequest", () => {
  it.each([
    {
      name: "sends only the admin state for a bare network",
      values: createNetwork,
      body: { admin_state_up: true },
    },
    {
      name: "sends the name, MTU and zone hints when given",
      values: {
        ...createNetwork,
        name: "lab",
        admin_state_up: false,
        mtu: "1450",
        availability_zone_hints: ["nova"],
      },
      body: {
        admin_state_up: false,
        name: "lab",
        mtu: 1450,
        availability_zone_hints: ["nova"],
      },
    },
    {
      name: "sends the first subnet when asked for",
      values: {
        ...createNetwork,
        with_subnet: true,
        subnet: { ...createNetwork.subnet, cidr: "10.0.0.0/24" },
      },
      body: {
        admin_state_up: true,
        subnet: {
          name: "",
          cidr: "10.0.0.0/24",
          ip_version: 4,
          enable_dhcp: true,
          allocation_pools: [],
          dns_nameservers: ["1.1.1.1"],
          host_routes: [],
        },
      },
    },
  ])("$name", ({ values, body }) => {
    expect(createNetworkRequest(values, false)).toEqual(body);
    expect(networkCreateBody.parse(body)).toEqual(body);
  });

  it("sends port security where the cloud has the extension", () => {
    const body = createNetworkRequest(
      { ...createNetwork, port_security_enabled: false },
      true,
    );
    expect(body).toEqual({
      admin_state_up: true,
      port_security_enabled: false,
    });
    expect(networkCreateBody.parse(body)).toEqual(body);
  });
});

describe("updateNetworkRequest", () => {
  it("sends nothing when nothing changed", () => {
    expect(
      updateNetworkRequest(network, {
        name: network.name,
        admin_state_up: network.admin_state_up ?? true,
      }),
    ).toBeNull();
  });

  it("sends only the changed fields with the network id", () => {
    const update = updateNetworkRequest(network, {
      name: "renamed",
      admin_state_up: network.admin_state_up ?? true,
    });
    expect(update).toEqual({ networkId: network.id, name: "renamed" });
    expect(networkUpdateBody.parse({ name: "renamed" })).toEqual({
      name: "renamed",
    });
  });
});

describe("createPortRequest", () => {
  it.each([
    {
      name: "sends the groups while port security is on",
      values: portForm,
      portSecurity: true,
      body: {
        network_id: "net-1",
        admin_state_up: true,
        port_security_enabled: true,
        security_groups: ["sg-default"],
      },
    },
    {
      name: "leaves the groups out when port security is off",
      values: { ...portForm, port_security_enabled: false },
      portSecurity: true,
      body: {
        network_id: "net-1",
        admin_state_up: true,
        port_security_enabled: false,
      },
    },
    {
      name: "leaves port security out where the cloud lacks it",
      values: portForm,
      portSecurity: false,
      body: { network_id: "net-1", admin_state_up: true },
    },
    {
      name: "sends the device, a chosen subnet and the MAC address",
      values: {
        ...portForm,
        name: "spare",
        device_id: "i-1",
        device_owner: "compute:nova",
        specify_ip: "subnet" as const,
        subnet_id: "subnet-1",
        fixed_ip: "10.0.0.9",
        mac_address: "fa:16:3e:00:00:01",
      },
      portSecurity: false,
      body: {
        network_id: "net-1",
        admin_state_up: true,
        name: "spare",
        device_id: "i-1",
        device_owner: "compute:nova",
        subnet_id: "subnet-1",
        mac_address: "fa:16:3e:00:00:01",
      },
    },
    {
      name: "sends a fixed IP instead of a subnet",
      values: {
        ...portForm,
        specify_ip: "fixed" as const,
        subnet_id: "subnet-1",
        fixed_ip: "10.0.0.9",
      },
      portSecurity: false,
      body: { network_id: "net-1", admin_state_up: true, fixed_ip: "10.0.0.9" },
    },
  ])("$name", ({ values, portSecurity, body }) => {
    expect(createPortRequest("net-1", values, portSecurity)).toEqual(body);
    expect(portCreateBody.parse(body)).toEqual(body);
  });
});

describe("updatePortRequest", () => {
  const unchanged: PortValues = {
    ...portForm,
    name: port.name,
    admin_state_up: port.admin_state_up ?? true,
    port_security_enabled: port.port_security_enabled ?? true,
    security_groups: port.security_groups,
  };

  it("sends nothing when nothing changed", () => {
    expect(updatePortRequest(port, unchanged, true)).toBeNull();
  });

  it("treats the same groups in another order as unchanged", () => {
    const twoGroups = { ...port, security_groups: ["sg-a", "sg-b"] };
    expect(
      updatePortRequest(
        twoGroups,
        { ...unchanged, security_groups: ["sg-b", "sg-a"] },
        true,
      ),
    ).toBeNull();
  });

  it.each([
    {
      name: "sends a new name and admin state",
      values: { ...unchanged, name: "api", admin_state_up: false },
      portSecurity: true,
      body: { name: "api", admin_state_up: false },
    },
    {
      name: "sends changed groups while port security is on",
      values: { ...unchanged, security_groups: ["sg-a", "sg-b"] },
      portSecurity: true,
      body: { security_groups: ["sg-a", "sg-b"] },
    },
    {
      name: "ignores port security where the cloud lacks it",
      values: {
        ...unchanged,
        port_security_enabled: false,
        security_groups: ["sg-b"],
      },
      portSecurity: false,
      body: null,
    },
  ])("$name", ({ values, portSecurity, body }) => {
    const update = updatePortRequest(port, values, portSecurity);
    expect(update).toEqual(body && { portId: port.id, ...body });
    if (body) expect(portUpdateBody.parse(body)).toEqual(body);
  });
});
