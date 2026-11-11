import { describe, expect, it } from "vitest";
import type {
  Reservation,
  ReservationFlavor,
} from "../../lib/api/types/reservations";
import {
  availableReservationActions,
  eligibility,
  estimateSu,
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

describe("estimateSu", () => {
  it.each([
    { rate: 2, days: 1, expected: 48 },
    { rate: 0.5, days: 3, expected: 36 },
    { rate: 1.234, days: 1, expected: 29.62 },
    { rate: 4, days: 0, expected: 0 },
    { rate: 4, days: -2, expected: 0 },
  ])("$days days at $rate SU/hour is $expected", ({ rate, days, expected }) => {
    expect(estimateSu(rate, days)).toBe(expected);
  });
});

describe("reservation actions", () => {
  const reservation: Reservation = {
    id: "res-1",
    status: "ACTIVE",
    status_help: "",
    status_reason: null,
    start: null,
    end: null,
    created_at: null,
    instance_count: null,
    compute_flavor: "res-1",
    flavor,
    actions: ["launch", "extend", "calendar", "delete"],
  };

  /** The reason each action is disabled, or null when it can run. */
  const reasons = (item: Reservation) =>
    Object.fromEntries(
      availableReservationActions(item).map((offer) => [
        offer.id,
        offer.disabledReason ?? null,
      ]),
    );

  it("offers what the backend allows", () => {
    expect(reasons(reservation)).toEqual({
      launch: null,
      extend: null,
      calendar: null,
      delete: null,
    });
  });

  it("lists the rest disabled with their reasons", () => {
    expect(
      reasons({ ...reservation, status: "PENDING_CREATE", actions: [] }),
    ).toEqual({
      launch: "The reservation is not active yet",
      extend: "Only active reservations with days left can be extended",
      calendar: "Only allocated or active reservations have a calendar entry",
      delete: "A reservation still being created cannot be deleted",
    });
  });
});
