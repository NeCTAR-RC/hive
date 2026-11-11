import { describe, expect, it } from "vitest";
import type {
  ReservationFlavor,
  ReservationOptions,
} from "../../../lib/api/types/reservations";
import { checkDates, reserveSchema, safeDate } from "./reserve";

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

function options(
  overrides: Partial<ReservationOptions> = {},
): ReservationOptions {
  return {
    limits: {
      max_hours: null,
      hours_used: 0,
      hours_left: null,
      max_days: 30,
      days_used: 2,
      days_left: 28,
      max_reservations: null,
      reservations_used: 0,
      reservations_left: null,
      can_create: true,
    },
    flavors: [flavor],
    categories: ["GPU"],
    availability_zones: ["ardctest-artm"],
    maintenance_windows: [],
    su_used: 1000,
    su_budget: 5000,
    today: "2026-10-14",
    ...overrides,
  };
}

describe("safeDate", () => {
  it("reads an ISO date as a calendar date", () => {
    expect(safeDate("2026-10-14")?.toString()).toBe("2026-10-14");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty string", ""],
    ["a month alone", "2026-10"],
    ["text", "next week"],
  ])("returns null for %s", (_, value) => {
    expect(safeDate(value)).toBeNull();
  });
});

describe("checkDates", () => {
  it("counts no days and asks for one until both dates are set", () => {
    expect(
      checkDates({ start: "2026-10-14", end: "" }, flavor, options()),
    ).toEqual({
      days: 0,
      check: {
        eligible: false,
        reasons: ["Choose at least one day."],
        maxDays: 7,
        suEstimate: 0,
      },
    });
  });

  it("accepts dates within the flavour's and the project's limits", () => {
    expect(
      checkDates({ start: "2026-10-14", end: "2026-10-16" }, flavor, options()),
    ).toEqual({
      days: 3,
      check: { eligible: true, reasons: [], maxDays: 7, suEstimate: 64.73 },
    });
  });

  it("holds the days to the project's remaining days", () => {
    const tight = options({
      limits: { ...options().limits, days_left: 2 },
    });
    const { days, check } = checkDates(
      { start: "2026-10-14", end: "2026-10-16" },
      flavor,
      tight,
    );
    expect(days).toBe(3);
    expect(check.eligible).toBe(false);
    expect(check.maxDays).toBe(2);
    expect(check.reasons).toEqual([
      "This flavour can be reserved for at most 2 days with your project's remaining limit.",
    ]);
  });

  it("refuses dates whose service units pass the budget", () => {
    const { check } = checkDates(
      { start: "2026-10-14", end: "2026-10-16" },
      flavor,
      options({ su_used: 4950 }),
    );
    expect(check.eligible).toBe(false);
    expect(check.reasons).toEqual([
      "The number of selected days exceeds your project's usage limit. If you require more, please amend your allocation.",
    ]);
  });
});

describe("reserveSchema", () => {
  it("accepts eligible dates as they are", () => {
    const values = { start: "2026-10-14", end: "2026-10-16" };
    expect(reserveSchema(flavor, options()).safeParse(values)).toEqual({
      success: true,
      data: values,
    });
  });

  it("puts every reason on the end date when the dates are not eligible", () => {
    const result = reserveSchema(flavor, options({ su_used: 4950 })).safeParse({
      start: "2026-10-01",
      end: "2026-10-10",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ["end"],
        message:
          "This flavour can be reserved for at most 7 days with your project's remaining limit. The number of selected days exceeds your project's usage limit. If you require more, please amend your allocation.",
      }),
    ]);
  });
});
