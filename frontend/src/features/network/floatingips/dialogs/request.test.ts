import { describe, expect, it } from "vitest";
import {
  floatingIpAllocateBody,
  portForwardingCreateBody,
} from "../../../../mocks/network/schemas";
import { allocateFloatingIpRequest, portForwardingRequest } from "./request";
import type { AllocateValues, PortForwardingValues } from "./schema";

const allocateForm: AllocateValues = {
  floating_network_id: "net-ext",
  floating_ip_address: "",
  description: "",
  dns_domain: "",
  dns_name: "",
};

const filledIn: AllocateValues = {
  floating_network_id: "net-ext",
  floating_ip_address: "203.0.113.120",
  description: "web",
  dns_domain: "example.org.",
  dns_name: "www",
};

describe("allocateFloatingIpRequest", () => {
  it.each([
    {
      name: "sends only the pool when nothing else is filled in",
      values: allocateForm,
      dns: true,
      body: { floating_network_id: "net-ext" },
    },
    {
      name: "sends every field filled in where DNS integration exists",
      values: filledIn,
      dns: true,
      body: {
        floating_network_id: "net-ext",
        floating_ip_address: "203.0.113.120",
        description: "web",
        dns_domain: "example.org.",
        dns_name: "www",
      },
    },
    {
      name: "leaves the DNS names out without DNS integration",
      values: filledIn,
      dns: false,
      body: {
        floating_network_id: "net-ext",
        floating_ip_address: "203.0.113.120",
        description: "web",
      },
    },
  ])("$name", ({ values, dns, body }) => {
    expect(allocateFloatingIpRequest(values, dns)).toEqual(body);
    expect(floatingIpAllocateBody.parse(body)).toEqual(body);
  });
});

describe("portForwardingRequest", () => {
  const target = { port_id: "port-spare", ip_address: "10.0.0.20" };
  const rule: PortForwardingValues = {
    protocol: "tcp",
    target_id: "port-spare_10.0.0.20",
    internal_port: "22",
    external_port: "2222",
    description: "",
  };

  it.each([
    {
      name: "binds the external port to the chosen address",
      values: rule,
      body: {
        protocol: "tcp",
        internal_port_id: "port-spare",
        internal_ip_address: "10.0.0.20",
        internal_port: "22",
        external_port: "2222",
      },
    },
    {
      name: "sends a description when given",
      values: { ...rule, protocol: "udp" as const, description: "dns" },
      body: {
        protocol: "udp",
        internal_port_id: "port-spare",
        internal_ip_address: "10.0.0.20",
        internal_port: "22",
        external_port: "2222",
        description: "dns",
      },
    },
  ])("$name", ({ values, body }) => {
    expect(portForwardingRequest(values, target)).toEqual(body);
    expect(portForwardingCreateBody.parse(body)).toEqual(body);
  });
});
