import { describe, expect, it } from "vitest";
import type { SecurityGroupRule } from "../../../lib/api/types/network";
import { describeRule, portRange } from "./rules";

const rule: SecurityGroupRule = {
  id: "r1",
  direction: "ingress",
  ethertype: "IPv4",
  protocol: "tcp",
  port_range_min: null,
  port_range_max: null,
  remote_ip_prefix: "0.0.0.0/0",
  remote_group_id: null,
  description: "",
  open_to_the_world: true,
};

describe("portRange", () => {
  it.each([
    { protocol: "tcp", min: 22, max: 22, label: "22" },
    { protocol: "tcp", min: 8000, max: 9000, label: "8000 - 9000" },
    { protocol: "udp", min: null, max: null, label: "Any" },
    { protocol: null, min: null, max: null, label: "Any" },
    { protocol: "tcp", min: 1024, max: null, label: "1024 - any" },
    { protocol: "icmp", min: 8, max: 0, label: "type 8, code 0" },
    { protocol: "ICMP", min: 8, max: null, label: "type 8, code any" },
    { protocol: "ipv6-icmp", min: 128, max: -1, label: "type 128, code any" },
    { protocol: "icmpv6", min: -1, max: -1, label: "Any" },
    { protocol: "icmp", min: null, max: null, label: "Any" },
  ])("$protocol $min..$max is $label", ({ protocol, min, max, label }) => {
    expect(
      portRange({
        ...rule,
        protocol,
        port_range_min: min,
        port_range_max: max,
      }),
    ).toBe(label);
  });
});

describe("describeRule", () => {
  const names = new Map([["sg-web", "web"]]);

  it.each([
    {
      name: "a CIDR remote",
      over: { port_range_min: 22, port_range_max: 22 },
      text: "ingress TCP 22 from 0.0.0.0/0",
    },
    {
      name: "a known remote group by its name",
      over: {
        direction: "egress" as const,
        protocol: "udp",
        remote_ip_prefix: null,
        remote_group_id: "sg-web",
      },
      text: "egress UDP Any from web",
    },
    {
      name: "an unknown remote group as any",
      over: {
        protocol: null,
        remote_ip_prefix: null,
        remote_group_id: "sg-gone",
      },
      text: "ingress ANY Any from any",
    },
  ])("reads $name", ({ over, text }) => {
    expect(describeRule({ ...rule, ...over }, names)).toBe(text);
  });
});
