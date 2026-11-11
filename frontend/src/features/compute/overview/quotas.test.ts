import { describe, expect, it } from "vitest";
import { computeQuotas, networkQuotas, volumeQuotas } from "./quotas";

const figures = (rows: { label: string; used: number; max: number | null }[]) =>
  rows.map(({ label, used, max }) => [label, used, max]);

describe("limit summary", () => {
  it("reads Nova's limits", () => {
    expect(
      figures(
        computeQuotas({
          maxTotalInstances: 10,
          totalInstancesUsed: 3,
          maxTotalCores: -1,
          totalCoresUsed: 8,
        }),
      ),
    ).toEqual([
      ["Instances", 3, 10],
      ["vCPUs", 8, null],
      ["RAM", 0, null],
      ["Server groups", 0, null],
    ]);
  });

  it("reads Cinder's limits", () => {
    expect(
      figures(
        volumeQuotas({
          maxTotalVolumes: 10,
          totalVolumesUsed: 3,
          maxTotalSnapshots: 10,
          totalSnapshotsUsed: 1,
          maxTotalVolumeGigabytes: 500,
          totalGigabytesUsed: 150,
        }),
      ),
    ).toEqual([
      ["Volumes", 3, 10],
      ["Volume snapshots", 1, 10],
      ["Volume storage", 150, 500],
    ]);
  });

  it("reads Neutron's quota details, unlimited when negative", () => {
    const rows = networkQuotas({
      floatingip: { used: 2, reserved: 0, limit: 5 },
      port: { used: 4, reserved: 0, limit: -1 },
    });
    expect(figures(rows)).toEqual([
      ["Floating IPs", 2, 5],
      ["Security groups", 0, null],
      ["Security group rules", 0, null],
      ["Networks", 0, null],
      ["Ports", 4, null],
      ["Routers", 0, null],
    ]);
  });
});
