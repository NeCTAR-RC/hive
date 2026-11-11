import { describe, expect, it } from "vitest";
import { ports } from "../../../../mocks/network/handlers";
import { portLabel } from "./portLabel";

const [port] = ports;
if (!port) throw new Error("The mock port list is empty");

describe("portLabel", () => {
  it.each([
    {
      name: "names the port, its network and addresses",
      over: {
        name: "web",
        network_name: "private-net",
        fixed_ips: [
          { ip_address: "10.0.0.5", subnet_id: "subnet-1" },
          { ip_address: "fd00::5", subnet_id: "subnet-6" },
        ],
      },
      label: "web on private-net (10.0.0.5, fd00::5)",
    },
    {
      name: "falls back to the id without a name",
      over: { id: "port-1", name: "", network_name: null, fixed_ips: [] },
      label: "port-1",
    },
    {
      name: "leaves out a network it does not know",
      over: {
        name: "web",
        network_name: null,
        fixed_ips: [{ ip_address: "10.0.0.5", subnet_id: "subnet-1" }],
      },
      label: "web (10.0.0.5)",
    },
  ])("$name", ({ over, label }) => {
    expect(portLabel({ ...port, ...over })).toBe(label);
  });
});
