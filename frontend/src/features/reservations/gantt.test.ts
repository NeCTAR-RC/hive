import { describe, expect, it } from "vitest";
import type { ReservationFlavor } from "../../lib/api/types";
import {
  addDays,
  buildRows,
  dayFromOffset,
  eligibleDays,
  ganttRange,
  monthSpans,
  selectionFor,
  spanDays,
} from "./gantt";

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

describe("gantt range", () => {
  it("runs from the first of this month to the end of the month three months on", () => {
    const range = ganttRange("2026-10-12");
    expect(range.first).toBe("2026-10-01");
    expect(range.last).toBe("2027-01-31");
    expect(range.days).toHaveLength(123);
    expect(range.todayIndex).toBe(11);
    expect(monthSpans(range.days)).toEqual([
      { label: "October 2026", count: 31 },
      { label: "November 2026", count: 30 },
      { label: "December 2026", count: 31 },
      { label: "January 2027", count: 31 },
    ]);
  });

  it("does date arithmetic in UTC days", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(spanDays("2026-10-01", "2026-10-07")).toBe(7);
    expect(spanDays("2026-10-07", "2026-10-01")).toBe(0);
  });

  it("maps a pointer offset to a day in the bar", () => {
    expect(dayFromOffset(0, 300, 30)).toBe(0);
    expect(dayFromOffset(150, 300, 30)).toBe(15);
    expect(dayFromOffset(299, 300, 30)).toBe(29);
    expect(dayFromOffset(400, 300, 30)).toBe(29);
    expect(dayFromOffset(10, 0, 30)).toBe(0);
  });

  it("limits the days to the flavour and the project", () => {
    expect(eligibleDays(null, 7)).toBe(7);
    expect(eligibleDays(3, 7)).toBe(3);
    expect(eligibleDays(0, 7)).toBe(0);
  });
});

describe("gantt rows", () => {
  const range = ganttRange("2026-10-12");

  it("places free slots and the maintenance windows that apply", () => {
    const rows = buildRows(
      [flavor, { ...flavor, id: "f2", name: "other" }],
      [
        {
          flavor_id: "f1",
          start: "2026-10-01T00:00:00+00:00",
          end: "2026-11-01T00:00:00+00:00",
        },
        {
          flavor_id: "f2",
          start: "2027-03-01T00:00:00+00:00",
          end: "2027-04-01T00:00:00+00:00",
        },
      ],
      [
        {
          id: "mw-1",
          start: "2026-10-20T00:00:00+00:00",
          end: "2026-10-22T00:00:00+00:00",
          note: "Firmware",
          flavors: [],
        },
        {
          id: "mw-2",
          start: "2026-10-25T00:00:00+00:00",
          end: "2026-10-26T00:00:00+00:00",
          note: null,
          flavors: [{ id: "f2", name: "other" }],
        },
      ],
      range,
    );
    expect(rows).toHaveLength(2);
    const [first, second] = rows;
    // The slot starts before today and is cut to today; its midnight end
    // is the previous day.
    expect(first?.bars.map((bar) => [bar.kind, bar.first, bar.last])).toEqual([
      ["free", "2026-10-12", "2026-10-31"],
      ["maintenance", "2026-10-20", "2026-10-21"],
    ]);
    expect(first?.bars[0]).toMatchObject({ from: 11, to: 30 });
    // The second flavour's slot is outside the window; the window for all
    // flavours and its own remain.
    expect(second?.bars.map((bar) => [bar.kind, bar.first])).toEqual([
      ["maintenance", "2026-10-20"],
      ["maintenance", "2026-10-25"],
    ]);
  });

  it("proposes the eligible days from the clicked day, cut at the bar end", () => {
    const [row] = buildRows(
      [flavor],
      [
        {
          flavor_id: "f1",
          start: "2026-10-12T00:00:00+00:00",
          end: "2026-10-22T00:00:00+00:00",
        },
      ],
      [],
      range,
    );
    const bar = row?.bars[0];
    expect(bar).toBeDefined();
    if (!bar) return;
    expect(selectionFor(bar, 0, 7)).toEqual({
      start: "2026-10-12",
      end: "2026-10-18",
      days: 7,
    });
    expect(selectionFor(bar, 8, 7)).toEqual({
      start: "2026-10-20",
      end: "2026-10-21",
      days: 2,
    });
    expect(selectionFor(bar, 50, 7)).toEqual({
      start: "2026-10-21",
      end: "2026-10-21",
      days: 1,
    });
  });
});
