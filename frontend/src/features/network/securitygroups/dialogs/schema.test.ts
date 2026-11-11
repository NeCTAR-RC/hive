import { describe, expect, it } from "vitest";
import {
  checkRemoteCidr,
  isNeutronProtocol,
  ruleSchema,
  type RuleForm,
} from "./schema";

describe("checkRemoteCidr", () => {
  it.each([
    ["203.0.113.0/24", "IPv4"],
    ["1.2.3.4/32", "IPv4"],
    ["0.0.0.0/0", "IPv4"],
    ["2001:db8::/32", "IPv6"],
  ] as const)("accepts %s as %s", (cidr, ethertype) => {
    expect(checkRemoteCidr(cidr, ethertype)).toBeNull();
  });

  it.each([
    ["", "IPv4", "Enter an address range such as 203.0.113.0/24"],
    ["1.2.3.4/40", "IPv4", "Enter an address range such as 203.0.113.0/24"],
    ["999.1.1.1/99", "IPv4", "Enter an address range such as 203.0.113.0/24"],
    ["1.2.3.4", "IPv4", "Enter an address range such as 203.0.113.0/24"],
    ["2001:db8::/129", "IPv6", "Enter an address range such as 2001:db8::/32"],
    [
      "2001:db8::/32",
      "IPv4",
      "This is an IPv6 range; choose IPv6 as the ether type",
    ],
  ] as const)("refuses %s as %s", (cidr, ethertype, message) => {
    expect(checkRemoteCidr(cidr, ethertype)).toBe(message);
  });
});

/** A custom TCP rule on one port from a CIDR, as the form opens. */
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

/** The messages the rule schema gives, by field. */
function issues(values: unknown): Record<string, string> {
  const result = ruleSchema.safeParse(values);
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((i) => [i.path.join("."), i.message]),
      );
}

describe("ruleSchema", () => {
  it("refuses an ICMP code without a type", () => {
    const icmp = { ...form, kind: "custom_icmp" };
    expect(issues({ ...icmp, icmp_code: 0 })).toEqual({
      icmp_type: "Enter an ICMP type to set a code",
    });
    expect(issues({ ...icmp, icmp_type: -1, icmp_code: 0 })).toEqual({
      icmp_type: "Enter an ICMP type to set a code",
    });
    expect(issues({ ...icmp, icmp_type: 8, icmp_code: 0 })).toEqual({});
    expect(issues({ ...icmp, icmp_type: 8 })).toEqual({});
  });

  it("gives ranges in words", () => {
    expect(issues({ ...form, port: 70000 })).toEqual({
      port: "Enter a port from 1 to 65535",
    });
    expect(issues({ ...form, kind: "custom_icmp", icmp_type: 300 })).toEqual({
      icmp_type: "Enter a number from -1 to 255",
    });
  });

  it("takes another protocol only when Neutron knows it", () => {
    const other = { ...form, kind: "other" };
    expect(issues({ ...other, protocol: "gre" })).toEqual({});
    expect(issues({ ...other, protocol: "47" })).toEqual({});
    expect(issues({ ...other, protocol: "bogus" })).toEqual({
      protocol: "Enter a protocol name such as gre, or a number from 0 to 255",
    });
    expect(issues({ ...other, protocol: "" })).toEqual({
      protocol: "Enter a protocol name or number",
    });
  });
});

describe("isNeutronProtocol", () => {
  it.each(["tcp", "GRE", " ipv6-icmp ", "0", "255"])("takes %j", (name) => {
    expect(isNeutronProtocol(name)).toBe(true);
  });

  it.each(["256", "-1", "tcpx", ""])("refuses %j", (name) => {
    expect(isNeutronProtocol(name)).toBe(false);
  });
});
