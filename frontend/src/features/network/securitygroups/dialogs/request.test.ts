import { describe, expect, it } from "vitest";
import { ruleCreateBody } from "../../../../mocks/compute/schemas";
import { ruleRequest } from "./request";
import type { RuleForm } from "./schema";

/** The form as it opens: a custom TCP rule on one port from a CIDR. */
const form: RuleForm = {
  kind: "custom_tcp",
  direction: "ingress",
  ethertype: "IPv4",
  port_mode: "port",
  port: 22,
  protocol: "",
  remote: "cidr",
  cidr: "203.0.113.0/24",
  remote_group_id: "",
  description: "",
};

const fromCidr = {
  direction: "ingress",
  ethertype: "IPv4",
  description: "",
  remote_ip_prefix: "203.0.113.0/24",
};

describe("ruleRequest", () => {
  it.each([
    {
      name: "a custom TCP rule on one port",
      values: form,
      body: {
        ...fromCidr,
        protocol: "tcp",
        port_range_min: 22,
        port_range_max: 22,
      },
    },
    {
      name: "a custom UDP rule on a range",
      values: {
        ...form,
        kind: "custom_udp",
        port_mode: "range" as const,
        port_from: 5000,
        port_to: 5100,
      },
      body: {
        ...fromCidr,
        protocol: "udp",
        port_range_min: 5000,
        port_range_max: 5100,
      },
    },
    {
      name: "a custom TCP rule on all ports",
      values: { ...form, port_mode: "all" as const },
      body: { ...fromCidr, protocol: "tcp" },
    },
    {
      name: "ICMP with a type and any code, sent as the type only",
      values: { ...form, kind: "custom_icmp", icmp_type: 8 },
      body: { ...fromCidr, protocol: "icmp", port_range_min: 8 },
    },
    {
      name: "ICMP with a type and a code of -1, sent as the type only",
      values: { ...form, kind: "custom_icmp", icmp_type: 8, icmp_code: -1 },
      body: { ...fromCidr, protocol: "icmp", port_range_min: 8 },
    },
    {
      name: "ICMP on IPv6 with a type and code",
      values: {
        ...form,
        kind: "custom_icmp",
        ethertype: "IPv6" as const,
        cidr: "2001:db8::/32",
        icmp_type: 128,
        icmp_code: 0,
      },
      body: {
        ...fromCidr,
        ethertype: "IPv6",
        remote_ip_prefix: "2001:db8::/32",
        protocol: "ipv6-icmp",
        port_range_min: 128,
        port_range_max: 0,
      },
    },
    {
      name: "ICMP of every type",
      values: { ...form, kind: "custom_icmp", icmp_type: -1 },
      body: { ...fromCidr, protocol: "icmp" },
    },
    {
      name: "another protocol by name",
      values: { ...form, kind: "other", protocol: "gre" },
      body: { ...fromCidr, protocol: "gre" },
    },
    {
      name: "a preset from a remote group",
      values: {
        ...form,
        kind: "ssh",
        remote: "group" as const,
        remote_group_id: "secgroup-default",
        description: "jump host",
      },
      body: {
        direction: "ingress",
        ethertype: "IPv4",
        description: "jump host",
        preset: "ssh",
        remote_group_id: "secgroup-default",
      },
    },
  ])("builds $name", ({ values, body }) => {
    expect(ruleRequest(values)).toEqual(body);
    expect(ruleCreateBody.parse(body)).toEqual(body);
  });
});
