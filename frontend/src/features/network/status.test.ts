import { describe, expect, it } from "vitest";
import type { ActionOffer } from "../../lib/actions";
import type { NetworkQuota } from "../../lib/api/types/network";
import {
  extensions,
  floatingIps,
  networks,
  ports,
  routers,
  subnets,
  trunks,
} from "../../mocks/network/handlers";
import {
  adminStateLabel,
  availableFloatingIpActions,
  availableNetworkActions,
  availablePortActions,
  availableRouterActions,
  availableRouterInterfaceActions,
  availableSecurityGroupActions,
  availableSubnetActions,
  availableTrunkActions,
  floatingIpTargetLabel,
  interfaceKindLabel,
  isTransitional,
  portAttachmentLabel,
  portDevice,
  portDeviceText,
  quotaLeft,
  statusLabel,
  statusTone,
} from "./status";

/** The mock fixture a case starts from; the cases override what matters. */
function first<T>(list: T[]): T {
  const [item] = list;
  if (!item) throw new Error("The mock fixture list is empty");
  return item;
}

/** "id" for an enabled offer, "id: reason" for a disabled one. */
function summary(offers: ActionOffer<string>[]): string[] {
  return offers.map((o) =>
    o.isDisabled ? `${o.id}: ${o.disabledReason ?? ""}` : o.id,
  );
}

describe("status presentation", () => {
  it.each([
    { status: "ACTIVE", tone: "success", label: "Active", busy: false },
    { status: "BUILD", tone: "progress", label: "Build", busy: true },
    {
      status: "PENDING_UPDATE",
      tone: "progress",
      label: "Pending update",
      busy: true,
    },
    { status: "DOWN", tone: "neutral", label: "Down", busy: false },
    { status: "DEGRADED", tone: "danger", label: "Degraded", busy: false },
    { status: "ERROR", tone: "danger", label: "Error", busy: false },
    { status: "N/A", tone: "neutral", label: "N/A", busy: false },
    { status: null, tone: "neutral", label: "", busy: false },
  ])("$status is $label ($tone)", ({ status, tone, label, busy }) => {
    expect(statusTone(status)).toBe(tone);
    expect(statusLabel(status)).toBe(label);
    expect(isTransitional({ status })).toBe(busy);
  });

  it.each([
    { up: true, label: "Up" },
    { up: false, label: "Down" },
    { up: null, label: "" },
  ])("admin state $up is '$label'", ({ up, label }) => {
    expect(adminStateLabel(up)).toBe(label);
  });

  it.each([
    { kind: "gateway", label: "External gateway" },
    { kind: "interface", label: "Internal interface" },
    { kind: "ha", label: "HA interface" },
    { kind: "other", label: "" },
  ] as const)("interface kind $kind is '$label'", ({ kind, label }) => {
    expect(interfaceKindLabel(kind)).toBe(label);
  });

  it.each([
    { device_owner: "compute:nova", device_id: "i-1", label: "compute:nova" },
    { device_owner: "", device_id: "i-1", label: "Attached" },
    { device_owner: "", device_id: "", label: "Detached" },
  ])("port attachment is $label", ({ device_owner, device_id, label }) => {
    expect(
      portAttachmentLabel({ ...first(ports), device_owner, device_id }),
    ).toBe(label);
  });

  it.each([
    {
      owner: "compute:nova",
      name: "db-1",
      device: { kind: "instance", id: "dev-1", name: "db-1" },
      text: "Instance db-1",
    },
    {
      owner: "network:router_interface",
      name: null,
      device: { kind: "router", id: "dev-1", name: "dev-1" },
      text: "Router dev-1",
    },
    {
      owner: "network:router_gateway",
      name: "default",
      device: { kind: "router", id: "dev-1", name: "default" },
      text: "Router default",
    },
    { owner: "network:dhcp", name: null, device: null, text: "network:dhcp" },
    {
      owner: "neutron:LOADBALANCERV2",
      name: null,
      device: null,
      text: "neutron:LOADBALANCERV2",
    },
  ])("the device of a $owner port", ({ owner, name, device, text }) => {
    const port = {
      ...first(ports),
      device_owner: owner,
      device_id: "dev-1",
      device_name: name,
    };
    expect(portDevice(port)).toEqual(device);
    expect(portDeviceText(port)).toBe(text);
  });

  it("a free port has no device", () => {
    expect(portDevice({ ...first(ports), device_id: "" })).toBeNull();
  });
});

describe("quotaLeft", () => {
  it.each<{ quota: NetworkQuota | null; left: boolean }>([
    { quota: null, left: true },
    { quota: {}, left: true },
    { quota: { subnet: { used: 2, reserved: 0, limit: -1 } }, left: true },
    { quota: { subnet: { used: 2, reserved: 0, limit: 3 } }, left: true },
    { quota: { subnet: { used: 2, reserved: 1, limit: 3 } }, left: false },
    { quota: { subnet: { used: 3, reserved: 0, limit: 3 } }, left: false },
  ])("$quota leaves room: $left", ({ quota, left }) => {
    expect(quotaLeft(quota, "subnet")).toBe(left);
  });
});

describe("row actions", () => {
  const network = first(networks);
  const room = { subnet: { used: 0, reserved: 0, limit: 10 } };
  const full = { subnet: { used: 10, reserved: 0, limit: 10 } };
  const notOwn = "Only your project's own networks can be changed";

  it.each([
    {
      name: "an own network",
      is_project: true,
      quota: room,
      expected: ["edit", "create-subnet", "delete"],
    },
    {
      name: "an own network with no subnet quota left",
      is_project: true,
      quota: full,
      expected: ["edit", "create-subnet: Subnet quota exceeded", "delete"],
    },
    {
      name: "a shared network",
      is_project: false,
      quota: room,
      expected: [
        `edit: ${notOwn}`,
        `create-subnet: ${notOwn}`,
        `delete: ${notOwn}`,
      ],
    },
  ])("networks: $name", ({ is_project, quota, expected }) => {
    expect(
      summary(availableNetworkActions({ ...network, is_project }, quota)),
    ).toEqual(expected);
  });

  it.each([
    { ports_in_use: undefined, delete: "delete" },
    { ports_in_use: null, delete: "delete" },
    { ports_in_use: 0, delete: "delete" },
    {
      ports_in_use: 2,
      delete: "delete: Remove the router interface and instance ports first",
    },
  ])(
    "a network with $ports_in_use ports in use: $delete",
    ({ ports_in_use, delete: expected }) => {
      const offers = summary(
        availableNetworkActions(
          { ...network, is_project: true, ports_in_use },
          room,
        ),
      );
      expect(offers).toContain(expected);
    },
  );

  it.each([
    {
      name: "no network known",
      owner: undefined,
      expected: ["edit", "delete"],
    },
    {
      name: "an own network",
      owner: { ...network, is_project: true },
      expected: ["edit", "delete"],
    },
    {
      name: "a shared network",
      owner: { ...network, is_project: false },
      expected: [`edit: ${notOwn}`, `delete: ${notOwn}`],
    },
  ])("subnets on $name", ({ owner, expected }) => {
    expect(summary(availableSubnetActions(first(subnets), owner))).toEqual(
      expected,
    );
  });

  it.each([
    {
      name: "a free port",
      device_owner: "",
      device_id: "",
      expected: ["edit", "delete"],
    },
    {
      name: "an attached port",
      device_owner: "compute:nova",
      device_id: "i-1",
      expected: ["edit", "delete: Detach the port from its device first"],
    },
    {
      name: "a network service port",
      device_owner: "network:dhcp",
      device_id: "dhcp-1",
      expected: [
        "edit: Ports owned by the network service cannot be changed here",
        "delete: Ports owned by the network service cannot be changed here",
      ],
    },
  ])("ports: $name", ({ device_owner, device_id, expected }) => {
    expect(
      summary(
        availablePortActions({ ...first(ports), device_owner, device_id }),
      ),
    ).toEqual(expected);
  });

  it("routers offer set or clear gateway, the other disabled", () => {
    const router = first(routers);
    expect(
      summary(availableRouterActions({ ...router, external_gateway: null })),
    ).toEqual([
      "set-gateway",
      "clear-gateway: The router has no gateway",
      "edit",
      "delete",
    ]);
    const withGateway = routers.find((r) => r.external_gateway !== null);
    expect(withGateway).toBeDefined();
    if (withGateway) {
      expect(summary(availableRouterActions(withGateway))).toEqual([
        "set-gateway: The router already has a gateway",
        "clear-gateway",
        "edit",
        "delete",
      ]);
    }
  });

  it.each([
    {
      kind: "interface" as const,
      expected: [{ label: "Delete interface", disabled: false }],
    },
    {
      kind: "gateway" as const,
      expected: [{ label: "Clear gateway", disabled: false }],
    },
    {
      kind: "ha" as const,
      expected: [
        {
          label: "Delete interface",
          disabled: "HA interfaces are managed by the cloud",
        },
      ],
    },
  ])("router interfaces: a port of kind $kind", ({ kind, expected }) => {
    const offers = availableRouterInterfaceActions({ ...first(ports), kind });
    expect(
      offers.map((o) => ({
        label: o.label,
        disabled: o.isDisabled && (o.disabledReason ?? ""),
      })),
    ).toEqual(expected);
  });

  it.each([
    { name: "web", expected: ["edit", "delete"] },
    {
      name: "default",
      expected: ["edit", "delete: The default group cannot be deleted"],
    },
  ])("security groups: the $name group", ({ name, expected }) => {
    const group = {
      id: `secgroup-${name}`,
      name,
      description: "",
      project_id: "p-1",
      created_at: null,
      updated_at: null,
      rule_count: 0,
    };
    expect(summary(availableSecurityGroupActions(group))).toEqual(expected);
  });

  it.each([
    {
      name: "a free IP",
      port_id: null,
      port_forwarding_count: 0,
      forwarding: true,
      expected: [
        "associate",
        "disassociate: The IP is not associated",
        "port-forwardings",
        "release",
      ],
    },
    {
      name: "a free IP without the forwarding extension",
      port_id: null,
      port_forwarding_count: 0,
      forwarding: false,
      expected: [
        "associate",
        "disassociate: The IP is not associated",
        "release",
      ],
    },
    {
      name: "an associated IP",
      port_id: "port-1",
      port_forwarding_count: 0,
      forwarding: true,
      expected: [
        "associate: The IP is already associated",
        "disassociate",
        "port-forwardings: Only an unassociated IP can forward ports",
        "release",
      ],
    },
    {
      name: "an IP with forwarding rules",
      port_id: null,
      port_forwarding_count: 2,
      forwarding: true,
      expected: [
        "associate: Remove the port forwarding rules before associating",
        "disassociate: The IP is not associated",
        "port-forwardings",
        "release: Remove the port forwarding rules before releasing",
      ],
    },
  ])(
    "floating IPs: $name",
    ({ port_id, port_forwarding_count, forwarding, expected }) => {
      const offers = availableFloatingIpActions(
        { ...first(floatingIps), port_id, port_forwarding_count },
        { ...extensions, port_forwarding: forwarding },
      );
      expect(summary(offers)).toEqual(expected);
    },
  );

  it("labels the forwarding action by whether rules exist", () => {
    const labels = (count: number) =>
      availableFloatingIpActions(
        { ...first(floatingIps), port_id: null, port_forwarding_count: count },
        { ...extensions, port_forwarding: true },
      ).find((o) => o.id === "port-forwardings")?.label;
    expect(labels(0)).toBe("Add port forwarding rules");
    expect(labels(1)).toBe("Edit port forwarding rules");
  });

  it("trunks always offer edit and delete", () => {
    expect(summary(availableTrunkActions(first(trunks)))).toEqual([
      "edit",
      "delete",
    ]);
  });
});

describe("floatingIpTargetLabel", () => {
  const fip = first(floatingIps);
  it.each([
    {
      name: "no mapping",
      over: { fixed_ip_address: null },
      label: "",
    },
    {
      name: "a load balancer",
      over: { fixed_ip_address: "10.0.0.5", instance_type: "loadbalancer" },
      label: "Load balancer VIP 10.0.0.5",
    },
    {
      name: "a named instance",
      over: {
        fixed_ip_address: "192.168.1.20",
        instance_type: "compute",
        instance_name: "web",
      },
      label: "web 192.168.1.20",
    },
    {
      name: "an unnamed target",
      over: {
        fixed_ip_address: "192.168.1.21",
        instance_type: null,
        instance_name: null,
      },
      label: "192.168.1.21",
    },
  ])("$name", ({ over, label }) => {
    expect(floatingIpTargetLabel({ ...fip, ...over })).toBe(label);
  });
});
