import { describe, expect, it } from "vitest";
import type { AttachablePort } from "../../../lib/api/types/network";
import { attachablePortLabel, portAddresses } from "./ports";

describe("portAddresses", () => {
  it.each([
    { name: "no address", ips: [], expected: "" },
    { name: "one address", ips: ["10.0.0.5"], expected: "10.0.0.5" },
    {
      name: "every address in order",
      ips: ["10.0.0.5", "2001:db8::5"],
      expected: "10.0.0.5, 2001:db8::5",
    },
  ])("lists $name", ({ ips, expected }) => {
    const port = { fixed_ips: ips.map((ip) => ({ ip, subnet_id: "sub-1" })) };
    expect(portAddresses(port)).toBe(expected);
  });
});

describe("attachablePortLabel", () => {
  const port: AttachablePort = {
    id: "port-spare",
    name: "spare-port",
    network_id: "net-private",
    network_name: "private-net",
    mac_address: null,
    fixed_ips: ["10.0.0.9", "10.0.0.10"],
    status: "DOWN",
  };

  it.each([
    {
      name: "a named port with addresses",
      port,
      expected: "spare-port (private-net: 10.0.0.9, 10.0.0.10)",
    },
    {
      name: "an unnamed port by its id",
      port: { ...port, name: "" },
      expected: "port-spare (private-net: 10.0.0.9, 10.0.0.10)",
    },
    {
      name: "a port on an unknown network without addresses",
      port: { ...port, network_name: null, fixed_ips: [] },
      expected: "spare-port (network: no address)",
    },
  ])("labels $name", ({ port, expected }) => {
    expect(attachablePortLabel(port)).toBe(expected);
  });
});
