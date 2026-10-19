import { describe, expect, it } from "vitest";
import {
  isNeutronProtocol,
  ruleSchema,
  toRuleRequest,
  type RuleForm,
} from "./rules";

const base: RuleForm = {
  kind: "custom_icmp",
  direction: "ingress",
  ethertype: "IPv4",
  port_mode: "port",
  protocol: "",
  remote: "cidr",
  cidr: "203.0.113.0/24",
  remote_group_id: "",
  description: "",
};

function issues(values: RuleForm): Record<string, string> {
  const result = ruleSchema.safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
}

describe("toRuleRequest", () => {
  it("sends an ICMP type with a blank code as the type only", () => {
    const request = toRuleRequest({ ...base, icmp_type: 8 });
    expect(request.protocol).toBe("icmp");
    expect(request.port_range_min).toBe(8);
    expect(request).not.toHaveProperty("port_range_max");
  });

  it("sends an ICMP type and code", () => {
    const request = toRuleRequest({ ...base, icmp_type: 3, icmp_code: 1 });
    expect(request.port_range_min).toBe(3);
    expect(request.port_range_max).toBe(1);
  });

  it("sends no range for an ICMP rule of every type", () => {
    const request = toRuleRequest({ ...base, icmp_type: -1 });
    expect(request).not.toHaveProperty("port_range_min");
    expect(request).not.toHaveProperty("port_range_max");
  });

  it("takes the ethertype from the CIDR and ICMP becomes ipv6-icmp", () => {
    const request = toRuleRequest({ ...base, cidr: "2001:db8::/32" });
    expect(request.ethertype).toBe("IPv6");
    expect(request.protocol).toBe("ipv6-icmp");
  });

  it("keeps the chosen ethertype for a remote group", () => {
    const request = toRuleRequest({
      ...base,
      remote: "group",
      remote_group_id: "sg-1",
      ethertype: "IPv6",
    });
    expect(request.ethertype).toBe("IPv6");
    expect(request.remote_group_id).toBe("sg-1");
    expect(request).not.toHaveProperty("remote_ip_prefix");
  });
});

describe("ruleSchema", () => {
  it("refuses an ICMP code without a type", () => {
    expect(issues({ ...base, icmp_code: 0 })).toEqual({
      icmp_type: "Enter an ICMP type to set a code",
    });
  });

  it("refuses a CIDR that does not parse", () => {
    expect(issues({ ...base, cidr: "999.0.0.0/8" }).cidr).toMatch(/CIDR/);
    expect(issues({ ...base, cidr: "2001:db8::/129" }).cidr).toMatch(/CIDR/);
    expect(issues({ ...base, cidr: "::/0" })).toEqual({});
  });

  it("gives a readable message for a port out of range", () => {
    expect(issues({ ...base, kind: "custom_tcp", port: 70000 }).port).toBe(
      "Enter a port from 1 to 65535",
    );
  });

  it("checks the other-protocol name", () => {
    expect(issues({ ...base, kind: "other", protocol: "gre" })).toEqual({});
    expect(
      issues({ ...base, kind: "other", protocol: "bogus" }).protocol,
    ).toMatch(/protocol name/);
  });
});

describe("isNeutronProtocol", () => {
  it("accepts names and numbers to 255", () => {
    expect(isNeutronProtocol("any")).toBe(true);
    expect(isNeutronProtocol("GRE")).toBe(true);
    expect(isNeutronProtocol("255")).toBe(true);
    expect(isNeutronProtocol("256")).toBe(false);
    expect(isNeutronProtocol("nope")).toBe(false);
  });
});
