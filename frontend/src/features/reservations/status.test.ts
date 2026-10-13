import { describe, expect, it } from "vitest";
import type { ReservationFlavor } from "../../lib/api/types";
import {
  daysBetween,
  eligibility,
  flavorDisk,
  flavorRate,
  flavorSize,
  slotLastDay,
  statusLabel,
  statusTone,
} from "./status";

const flavor: ReservationFlavor = {
  id: "f1",
  name: "ardc.g3.xlarge",
  description: null,
  category: "GPU",
  availability_zone: "ardctest-artm",
  vcpu: 64,
  memory_mb: 49152,
  disk_gb: 30,
  ephemeral_gb: 200,
  max_length_hours: 168,
  max_days: 7,
  rate: 0.899,
  is_public: true,
  active: true,
  slots: 1,
  start: null,
  end: null,
};

describe("reservation status helpers", () => {
  it("labels and tones statuses", () => {
    expect(statusLabel("PENDING_CREATE")).toBe("Pending");
    expect(statusTone("ACTIVE")).toBe("success");
    expect(statusTone("ERROR")).toBe("danger");
    expect(statusLabel("")).toBe("Unknown");
  });

  it("describes a flavour", () => {
    expect(flavorSize(flavor)).toBe("64 VCPUs, 48 GB RAM");
    expect(flavorDisk(flavor)).toBe("30 GB + 200 GB ephemeral");
    expect(flavorRate(flavor)).toBe("0.9 SU/hour");
    expect(flavorRate({ ...flavor, rate: null })).toBe("Free");
  });

  it("turns maintenance window ends into whole days", () => {
    expect(slotLastDay("2026-11-10T00:00:00+00:00")).toBe("2026-11-09");
    expect(slotLastDay("2026-11-10T12:00:00+00:00")).toBe("2026-11-10");
    expect(slotLastDay(null)).toBeNull();
    expect(daysBetween("2026-10-12", "2026-10-14")).toBe(3);
  });

  it("checks eligibility like the backend", () => {
    const ok = eligibility(3, 8, flavor, 100, 1000);
    expect(ok.eligible).toBe(true);
    expect(ok.suEstimate).toBe(64.73);
    expect(ok.maxDays).toBe(7);
    expect(eligibility(9, 8, flavor, null, null).reasons[0]).toContain(
      "at most 7 days",
    );
    expect(
      eligibility(3, null, { ...flavor, rate: 10 }, 900, 1000).reasons[0],
    ).toContain("usage limit");
    expect(
      eligibility(3, null, { ...flavor, rate: 10 }, 900, -1).eligible,
    ).toBe(true);
  });
});
