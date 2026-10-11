import { describe, expect, it } from "vitest";
import type { SubnetDetail } from "../../../lib/api/types";
import {
  checkSubnetForm,
  emptySubnetForm,
  parseCidr,
  parseIp,
  parsePools,
  parseRoutes,
  subnetFieldsFromForm,
  subnetFormFromDetail,
} from "./subnetRules";

const DNS = ["1.1.1.1", "1.0.0.1"];

describe("address parsing", () => {
  it("recognises IPv4 and IPv6 addresses", () => {
    expect(parseIp("192.168.1.1")).toBe(4);
    expect(parseIp("256.1.1.1")).toBeNull();
    expect(parseIp("fd00::1")).toBe(6);
    expect(parseIp("2001:db8:0:0:0:0:0:1")).toBe(6);
    expect(parseIp("fd00:::1")).toBeNull();
    expect(parseIp("nope")).toBeNull();
  });

  it("parses CIDRs with their version and prefix", () => {
    expect(parseCidr("10.0.0.0/24")).toEqual({ version: 4, prefix: 24 });
    expect(parseCidr("fd00::/64")).toEqual({ version: 6, prefix: 64 });
    expect(parseCidr("10.0.0.0/33")).toBeNull();
    expect(parseCidr("10.0.0.0")).toBeNull();
    expect(parseCidr("10.0.0.0/24/1")).toBeNull();
  });

  it("parses pools and routes one per line", () => {
    expect(parsePools("10.0.0.2,10.0.0.9\n\n10.0.0.20,10.0.0.30")).toEqual({
      pools: [
        { start: "10.0.0.2", end: "10.0.0.9" },
        { start: "10.0.0.20", end: "10.0.0.30" },
      ],
    });
    expect(parsePools("10.0.0.2").error).toMatch(/Start and end/);
    expect(parseRoutes("10.1.0.0/16,10.0.0.1")).toEqual({
      routes: [{ destination: "10.1.0.0/16", nexthop: "10.0.0.1" }],
    });
    expect(parseRoutes("bad,10.0.0.1").error).toMatch(/destination CIDR/);
  });
});

describe("checkSubnetForm", () => {
  const create = { isCreate: true, enableIpv6: false };

  it("needs a usable address on create", () => {
    const values = emptySubnetForm(DNS);
    expect(checkSubnetForm(values, create).cidr).toMatch(/Specify/);
    expect(
      checkSubnetForm({ ...values, cidr: "10.0.0.1/32" }, create).cidr,
    ).toMatch(/too small/);
    expect(
      checkSubnetForm({ ...values, cidr: "fd00::/64" }, create).cidr,
    ).toMatch(/inconsistent/);
    expect(checkSubnetForm({ ...values, cidr: "10.0.0.0/24" }, create)).toEqual(
      {},
    );
  });

  it("checks the gateway and the text areas", () => {
    const values = { ...emptySubnetForm(DNS), cidr: "10.0.0.0/24" };
    expect(
      checkSubnetForm({ ...values, gateway_ip: "fd00::1" }, create).gateway_ip,
    ).toMatch(/inconsistent/);
    expect(
      checkSubnetForm(
        { ...values, gateway_ip: "fd00::1", no_gateway: true },
        create,
      ),
    ).toEqual({});
    expect(
      checkSubnetForm({ ...values, dns_nameservers: "x" }, create)
        .dns_nameservers,
    ).toMatch(/Invalid IP/);
  });
});

describe("subnetFieldsFromForm", () => {
  it("builds a full create body", () => {
    const values = {
      ...emptySubnetForm(DNS),
      name: "front",
      cidr: "10.0.0.0/24",
      gateway_ip: "10.0.0.254",
      host_routes: "10.1.0.0/16,10.0.0.1",
    };
    expect(subnetFieldsFromForm(values)).toEqual({
      name: "front",
      cidr: "10.0.0.0/24",
      ip_version: 4,
      gateway_ip: "10.0.0.254",
      enable_dhcp: true,
      allocation_pools: [],
      dns_nameservers: DNS,
      host_routes: [{ destination: "10.1.0.0/16", nexthop: "10.0.0.1" }],
    });
  });

  it("sends only what changed on edit", () => {
    const subnet: SubnetDetail = {
      id: "s-1",
      name: "front",
      cidr: "10.0.0.0/24",
      ip_version: 4,
      gateway_ip: "10.0.0.1",
      enable_dhcp: true,
      network_id: "n-1",
      project_id: "p1",
      allocation_pools: [{ start: "10.0.0.2", end: "10.0.0.254" }],
      dns_nameservers: DNS,
      host_routes: [],
      subnetpool_id: null,
      ipv6_address_mode: null,
      ipv6_ra_mode: null,
      created_at: null,
      updated_at: null,
    };
    const previous = subnetFormFromDetail(subnet);
    expect(subnetFieldsFromForm(previous, previous)).toEqual({});
    expect(
      subnetFieldsFromForm(
        { ...previous, no_gateway: true, dns_nameservers: "" },
        previous,
      ),
    ).toEqual({ no_gateway: true, dns_nameservers: [] });
    expect(
      subnetFieldsFromForm({ ...previous, gateway_ip: "" }, previous),
    ).toEqual({ no_gateway: false });
  });
});
