import { describe, expect, it } from "vitest";
import { floatingIps } from "../../../../mocks/network/handlers";
import type { FloatingIpTarget } from "../../../../lib/api/types/network";
import { targetOptions } from "./targets";

const [fixture] = floatingIps;
if (!fixture) throw new Error("The mock fixture list is empty");
/** One IP mapped to db-1's address, one free. */
const fips = [
  {
    ...fixture,
    id: "fip-mapped",
    floating_ip_address: "203.0.113.100",
    port_id: "port-db-2",
    fixed_ip_address: "10.0.0.5",
  },
  {
    ...fixture,
    id: "fip-free",
    floating_ip_address: "203.0.113.101",
    port_id: null,
    fixed_ip_address: null,
  },
];

const db: FloatingIpTarget = {
  id: "port-db-2_10.0.0.5",
  port_id: "port-db-2",
  ip_address: "10.0.0.5",
  instance_id: "i-db-1",
  instance_name: "db-1",
  name: "db-1 10.0.0.5",
};
const spare: FloatingIpTarget = {
  ...db,
  id: "port-spare_10.0.0.20",
  port_id: "port-spare",
  ip_address: "10.0.0.20",
  name: "spare-port 10.0.0.20",
};

describe("targetOptions", () => {
  it("names the floating IP a port address already has", () => {
    expect(targetOptions([db, spare], fips, "fip-free")).toEqual([
      { id: db.id, label: "db-1 10.0.0.5 (already has 203.0.113.100)" },
      { id: spare.id, label: "spare-port 10.0.0.20" },
    ]);
  });

  it("does not count the IP being associated", () => {
    expect(targetOptions([db], fips, "fip-mapped")).toEqual([
      { id: db.id, label: "db-1 10.0.0.5" },
    ]);
  });
});
