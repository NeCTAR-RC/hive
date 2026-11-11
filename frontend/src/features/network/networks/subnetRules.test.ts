import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { SubnetDetail } from "../../../lib/api/types/network";
import {
  addSubnetIssues,
  checkSubnetForm,
  emptySubnetForm,
  parsePools,
  parseRoutes,
  subnetFieldsFromForm,
  subnetFormFromDetail,
  type SubnetFormValues,
} from "./subnetRules";

const DNS = ["1.1.1.1", "1.0.0.1"];

describe("text area parsing", () => {
  it("parses pools and routes one per line", () => {
    expect(parsePools("10.0.0.2,10.0.0.9\n\n10.0.0.20,10.0.0.30")).toEqual({
      pools: [
        { start: "10.0.0.2", end: "10.0.0.9" },
        { start: "10.0.0.20", end: "10.0.0.30" },
      ],
    });
    expect(parsePools("10.0.0.2").error).toMatch(/a start and an end/);
    expect(parseRoutes("10.1.0.0/16,10.0.0.1")).toEqual({
      routes: [{ destination: "10.1.0.0/16", nexthop: "10.0.0.1" }],
    });
    expect(parseRoutes("bad,10.0.0.1").error).toMatch(/not an address range/);
    expect(parseRoutes("fd00::/64,10.0.0.1", 4).error).toBe(
      'The route "fd00::/64,10.0.0.1" is not IPv4',
    );
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
    ).toMatch(/not an IP address/);
  });

  it("checks the prefix length of a subnet from a pool", () => {
    const fromPool = {
      ...emptySubnetForm(DNS),
      address_source: "pool" as const,
      subnetpool_id: "pool-1",
    };
    expect(checkSubnetForm(fromPool, create)).toEqual({});
    expect(checkSubnetForm({ ...fromPool, prefixlen: "26" }, create)).toEqual(
      {},
    );
    for (const prefixlen of ["abc", "0", "33", "2.5"]) {
      expect(
        checkSubnetForm({ ...fromPool, prefixlen }, create).prefixlen,
      ).toBe("Enter a prefix length from 1 to 32");
    }
    expect(
      checkSubnetForm(
        { ...fromPool, ip_version: "6", prefixlen: "64" },
        { ...create, enableIpv6: true },
      ),
    ).toEqual({});
  });
});

describe("checkSubnetForm messages", () => {
  const create = { isCreate: true, enableIpv6: false };
  const valid = { ...emptySubnetForm(DNS), cidr: "10.0.0.0/24" };

  it.each([
    {
      name: "a pool source without a pool",
      over: { address_source: "pool" as const },
      field: "subnetpool_id",
      message: "Choose an address pool",
    },
    {
      name: "an empty address",
      over: { cidr: " " },
      field: "cidr",
      message: "Specify a network address",
    },
    {
      name: "an address that is not a CIDR",
      over: { cidr: "10.0.0.0" },
      field: "cidr",
      message: "Enter a network address in CIDR form, such as 192.168.0.0/24",
    },
    {
      name: "an IPv6 address on an IPv4 subnet",
      over: { cidr: "fd00::/64" },
      field: "cidr",
      message: "The network address and IP version are inconsistent",
    },
    {
      name: "a /32",
      over: { cidr: "10.0.0.1/32" },
      field: "cidr",
      message: "The subnet in the network address is too small (/32)",
    },
    {
      name: "IPv6 where it is not available",
      over: { cidr: "fd00::/64", ip_version: "6" as const },
      field: "cidr",
      message: "IPv6 subnets are not available",
    },
    {
      name: "a gateway that is not an address",
      over: { gateway_ip: "router" },
      field: "gateway_ip",
      message: "Enter an IP address",
    },
    {
      name: "a gateway of the other version",
      over: { gateway_ip: "fd00::1" },
      field: "gateway_ip",
      message: "The gateway IP and IP version are inconsistent",
    },
    {
      name: "a gateway outside the subnet",
      over: { gateway_ip: "192.168.5.1" },
      field: "gateway_ip",
      message: "The gateway must be inside 10.0.0.0/24",
    },
    {
      name: "the broadcast address as gateway",
      over: { gateway_ip: "10.0.0.255" },
      field: "gateway_ip",
      message: "The gateway cannot be the network or broadcast address",
    },
    {
      name: "a pool written as a range",
      over: { allocation_pools: "10.0.0.10-10.0.0.20" },
      field: "allocation_pools",
      message:
        'Write "10.0.0.10-10.0.0.20" as a start and an end address, such as 10.0.0.10,10.0.0.20',
    },
    {
      name: "a pool with a bad address",
      over: { allocation_pools: "10.0.0.10,nope" },
      field: "allocation_pools",
      message: "nope is not an IP address",
    },
    {
      name: "a reversed pool",
      over: { allocation_pools: "10.0.0.20,10.0.0.10" },
      field: "allocation_pools",
      message: "The pool start 10.0.0.20 is after its end 10.0.0.10",
    },
    {
      name: "a pool outside the subnet",
      over: { allocation_pools: "10.0.0.10,10.0.1.20" },
      field: "allocation_pools",
      message: "The pool 10.0.0.10-10.0.1.20 is outside 10.0.0.0/24",
    },
    {
      name: "overlapping pools",
      over: { allocation_pools: "10.0.0.30,10.0.0.40\n10.0.0.10,10.0.0.30" },
      field: "allocation_pools",
      message: "The pools 10.0.0.10-10.0.0.30 and 10.0.0.30-10.0.0.40 overlap",
    },
    {
      name: "a pool holding the gateway",
      over: {
        gateway_ip: "10.0.0.15",
        allocation_pools: "10.0.0.10,10.0.0.20",
      },
      field: "allocation_pools",
      message: "The pool 10.0.0.10-10.0.0.20 holds the gateway 10.0.0.15",
    },
    {
      name: "a pool holding the default gateway",
      over: { allocation_pools: "10.0.0.1,10.0.0.20" },
      field: "allocation_pools",
      message:
        "The pool 10.0.0.1-10.0.0.20 holds the default gateway, the network's first address; start the pool after it or set another gateway",
    },
    {
      name: "a bad name server",
      over: { dns_nameservers: "x" },
      field: "dns_nameservers",
      message: "x is not an IP address",
    },
    {
      name: "a route without a next hop",
      over: { host_routes: "10.1.0.0/16" },
      field: "host_routes",
      message:
        'Write "10.1.0.0/16" as a destination and a next hop, such as 192.168.200.0/24,10.56.1.254',
    },
    {
      name: "a route with a bad destination",
      over: { host_routes: "10.1.0.0,10.0.0.1" },
      field: "host_routes",
      message: "10.1.0.0 is not an address range such as 192.168.200.0/24",
    },
    {
      name: "a route with a bad next hop",
      over: { host_routes: "10.1.0.0/16,gw" },
      field: "host_routes",
      message: "gw is not an IP address",
    },
  ])("says why for $name", ({ over, field, message }) => {
    expect(checkSubnetForm({ ...valid, ...over }, create)).toEqual({
      [field]: message,
    });
  });

  it("does not check the address when editing", () => {
    expect(
      checkSubnetForm(
        { ...valid, cidr: "" },
        { isCreate: false, enableIpv6: false },
      ),
    ).toEqual({});
  });

  it("checks the gateway even when the pools do not parse", () => {
    expect(
      checkSubnetForm(
        { ...valid, gateway_ip: "192.168.5.1", allocation_pools: "10.0.0.9" },
        create,
      ),
    ).toEqual({
      gateway_ip: "The gateway must be inside 10.0.0.0/24",
      allocation_pools:
        'Write "10.0.0.9" as a start and an end address, such as 10.0.0.10,10.0.0.20',
    });
  });

  it("passes a disabled gateway whatever the pools", () => {
    expect(
      checkSubnetForm(
        { ...valid, no_gateway: true, allocation_pools: "10.0.0.1,10.0.0.9" },
        create,
      ),
    ).toEqual({});
  });

  it("checks an edit's ranges only when it changes them", () => {
    // A stored subnet that breaks the rules: its gateway sits in its pool.
    const stored = {
      ...valid,
      gateway_ip: "10.0.0.5",
      allocation_pools: "10.0.0.2,10.0.0.9",
    };
    const edit = { isCreate: false, enableIpv6: false, previous: stored };
    expect(checkSubnetForm({ ...stored, name: "renamed" }, edit)).toEqual({});
    expect(
      checkSubnetForm({ ...stored, gateway_ip: "10.0.0.6" }, edit),
    ).toEqual({
      allocation_pools: "The pool 10.0.0.2-10.0.0.9 holds the gateway 10.0.0.6",
    });
  });

  it("accepts an IPv6 subnet with its gateway where IPv6 is on", () => {
    expect(
      checkSubnetForm(
        {
          ...valid,
          ip_version: "6",
          cidr: "fd00::/64",
          gateway_ip: "fd00::1",
          allocation_pools: "fd00::10,fd00::ff",
        },
        { isCreate: true, enableIpv6: true },
      ),
    ).toEqual({});
  });
});

describe("addSubnetIssues", () => {
  const create = { isCreate: true, enableIpv6: false };

  /** The issues a refinement built on `addSubnetIssues` reports. */
  function issues(values: SubnetFormValues, prefix?: string[]) {
    const schema = z
      .custom<SubnetFormValues>()
      .superRefine((form, ctx) => addSubnetIssues(form, ctx, create, prefix));
    const result = schema.safeParse(values);
    return (result.error?.issues ?? []).map(({ path, message }) => ({
      path,
      message,
    }));
  }

  it("reports each problem at its field", () => {
    expect(issues({ ...emptySubnetForm(DNS), dns_nameservers: "x" })).toEqual([
      { path: ["cidr"], message: "Specify a network address" },
      { path: ["dns_nameservers"], message: "x is not an IP address" },
    ]);
  });

  it("nests the problems under the prefix", () => {
    expect(issues(emptySubnetForm(DNS), ["subnet"])).toEqual([
      { path: ["subnet", "cidr"], message: "Specify a network address" },
    ]);
  });

  it("adds nothing for a valid form", () => {
    expect(issues({ ...emptySubnetForm(DNS), cidr: "10.0.0.0/24" })).toEqual(
      [],
    );
  });
});

describe("subnetFieldsFromForm", () => {
  it("sends a pool's prefix length only when it is a number", () => {
    const fromPool = {
      ...emptySubnetForm([]),
      address_source: "pool" as const,
      subnetpool_id: "pool-1",
    };
    expect(subnetFieldsFromForm({ ...fromPool, prefixlen: " 26 " })).toEqual(
      expect.objectContaining({ subnetpool_id: "pool-1", prefixlen: 26 }),
    );
    expect(
      subnetFieldsFromForm({ ...fromPool, prefixlen: "x" }),
    ).not.toHaveProperty("prefixlen");
    expect(subnetFieldsFromForm(fromPool)).not.toHaveProperty("prefixlen");
  });

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

  it("sends the IPv6 modes of an IPv6 subnet", () => {
    const values = {
      ...emptySubnetForm([]),
      ip_version: "6" as const,
      cidr: "fd00::/64",
      ipv6_modes: "none/slaac" as const,
    };
    expect(subnetFieldsFromForm(values)).toMatchObject({
      ip_version: 6,
      ipv6_address_mode: "slaac",
    });
    expect(subnetFieldsFromForm(values)).not.toHaveProperty("ipv6_ra_mode");
    expect(
      subnetFieldsFromForm({ ...values, ip_version: "4", cidr: "10.0.0.0/24" }),
    ).not.toHaveProperty("ipv6_address_mode");
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
