import { describe, expect, it } from "vitest";
import {
  addressValue,
  cidrsOverlap,
  inCidr,
  ipVersion,
  isCidr,
  isDnsName,
  isHostName,
  isIpAddress,
  isPort,
  parseCidr,
  parsePortRange,
} from "./net";

describe("isIpAddress and ipVersion", () => {
  it.each([
    ["203.0.113.10", 4],
    ["0.0.0.0", 4],
    ["255.255.255.255", 4],
    ["2001:db8::1", 6],
    ["::", 6],
    ["::1", 6],
    ["fe80::1%eth0", null],
    ["::ffff:203.0.113.10", 6],
    ["2001:db8:0:0:0:0:0:1", 6],
    ["256.0.0.1", null],
    ["203.0.113", null],
    ["203.0.113.10/32", null],
    ["999.1.1.1", null],
    ["2001:db8:::1", null],
    ["2001:db8::1::2", null],
    ["12345::", null],
    ["foo", null],
    ["", null],
  ] as const)("reads %s as version %s", (text, version) => {
    expect(ipVersion(text)).toBe(version);
    expect(isIpAddress(text)).toBe(version !== null);
  });

  it("checks the asked-for version", () => {
    expect(isIpAddress("203.0.113.10", 4)).toBe(true);
    expect(isIpAddress("203.0.113.10", 6)).toBe(false);
    expect(isIpAddress("2001:db8::1", 6)).toBe(true);
  });
});

describe("addressValue", () => {
  it("reads both versions as comparable numbers", () => {
    expect(addressValue("10.0.0.1")).toEqual({
      version: 4,
      value: 0x0a000001n,
    });
    expect(addressValue("2001:db8::1")).toEqual({
      version: 6,
      value: 0x20010db8000000000000000000000001n,
    });
    expect(addressValue("::ffff:10.0.0.1")?.value).toBe(0xffff0a000001n);
    expect(addressValue("10.0.0.300")).toBeNull();
  });
});

describe("parseCidr and isCidr", () => {
  it("parses an IPv4 network with its range", () => {
    const cidr = parseCidr("203.0.113.0/24");
    expect(cidr).toMatchObject({
      version: 4,
      address: "203.0.113.0",
      prefix: 24,
    });
    expect(cidr?.network).toBe(0xcb007100n);
    expect(cidr?.broadcast).toBe(0xcb0071ffn);
  });

  it("masks host bits the way Neutron does", () => {
    expect(parseCidr("10.0.0.5/8")?.network).toBe(0x0a000000n);
  });

  it("parses an IPv6 network", () => {
    const cidr = parseCidr("2001:db8::/32");
    expect(cidr).toMatchObject({ version: 6, prefix: 32 });
    expect(cidr?.network).toBe(0x20010db8000000000000000000000000n);
  });

  it.each([
    ["1.2.3.4/40", false],
    ["999.1.1.1/24", false],
    ["203.0.113.0", false],
    ["203.0.113.0/", false],
    ["203.0.113.0/24/8", false],
    ["203.0.113.0/-1", false],
    ["203.0.113.0/0", true],
    ["203.0.113.0/32", true],
    ["2001:db8::/129", false],
    ["2001:db8::/128", true],
    ["0.0.0.0/0", true],
  ])("isCidr(%s) is %s", (text, expected) => {
    expect(isCidr(text)).toBe(expected);
  });

  it("checks the asked-for version", () => {
    expect(isCidr("203.0.113.0/24", 6)).toBe(false);
    expect(isCidr("2001:db8::/32", 6)).toBe(true);
  });
});

describe("inCidr", () => {
  it.each([
    ["203.0.113.10", "203.0.113.0/24", true],
    ["203.0.113.0", "203.0.113.0/24", true],
    ["203.0.113.255", "203.0.113.0/24", true],
    ["203.0.114.1", "203.0.113.0/24", false],
    ["192.168.5.1", "10.0.0.0/24", false],
    ["10.9.9.9", "192.168.1.0/24", false],
    ["2001:db8::5", "2001:db8::/32", true],
    ["2001:db9::5", "2001:db8::/32", false],
    ["203.0.113.10", "2001:db8::/32", false],
    ["foo", "203.0.113.0/24", false],
    ["203.0.113.10", "foo", false],
  ])("%s in %s is %s", (address, cidr, expected) => {
    expect(inCidr(address, cidr)).toBe(expected);
  });

  it("takes a parsed CIDR too", () => {
    const cidr = parseCidr("10.0.0.0/8");
    expect(cidr && inCidr("10.200.1.1", cidr)).toBe(true);
  });
});

describe("cidrsOverlap", () => {
  it.each([
    ["10.0.0.0/24", "10.0.0.0/24", true],
    ["10.0.0.0/24", "10.0.0.128/25", true],
    ["10.0.0.0/8", "10.200.0.0/16", true],
    ["10.0.0.0/24", "10.0.1.0/24", false],
    ["10.0.0.0/24", "2001:db8::/32", false],
    ["10.0.0.0/24", "foo", false],
  ])("%s and %s overlap: %s", (a, b, expected) => {
    expect(cidrsOverlap(a, b)).toBe(expected);
  });
});

describe("ports", () => {
  it.each([
    [1, true],
    [22, true],
    [65535, true],
    [0, false],
    [65536, false],
    [22.5, false],
    [NaN, false],
  ])("isPort(%s) is %s", (port, expected) => {
    expect(isPort(port)).toBe(expected);
  });

  it.each([
    ["22", { min: 22, max: 22 }],
    ["8000:8080", { min: 8000, max: 8080 }],
    ["8000-8080", { min: 8000, max: 8080 }],
    [" 443 ", { min: 443, max: 443 }],
    ["8080:8000", null],
    ["0", null],
    ["70000", null],
    ["22:", null],
    ["a:b", null],
    ["", null],
  ])("parsePortRange(%s)", (text, expected) => {
    expect(parsePortRange(text)).toEqual(expected);
  });
});

describe("isHostName", () => {
  it.each([
    ["example.org", true],
    ["example.org.", true],
    ["www.example.org.", true],
    ["a-b.example.org", true],
    ["mail1", true],
    ["-bad.example.org", false],
    ["bad-.example.org", false],
    ["my zone.com", false],
    ["ex_ample.org", false],
    ["", false],
    [".", false],
    [`${"a".repeat(64)}.org`, false],
    [`${"a".repeat(63)}.org`, true],
    [`${Array<string>(5).fill("a".repeat(60)).join(".")}`, false],
  ])("isHostName(%s) is %s", (text, expected) => {
    expect(isHostName(text)).toBe(expected);
  });
});

describe("isDnsName", () => {
  it.each([
    ["_dmarc.example.org.", true],
    ["selector1._domainkey.example.org.", true],
    ["www.example.org.", true],
    ["my zone.com", false],
    ["-bad.example.org", false],
    ["bad-.example.org", false],
    ["", false],
    [`${"a".repeat(64)}.org`, false],
  ])("isDnsName(%s) is %s", (text, expected) => {
    expect(isDnsName(text)).toBe(expected);
  });
});
