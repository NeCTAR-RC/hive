import { describe, expect, it } from "vitest";
import { sortRows, type SortValue } from "./sort";

const sortValues = (
  values: SortValue[],
  direction: "ascending" | "descending",
) => sortRows(values, (value) => value, direction);

describe("sortRows", () => {
  it.each([
    ["numbers by value", [10, 2, 33, 1], [1, 2, 10, 33]],
    [
      "text numeric-aware",
      ["vm-10", "vm-2", "vm-1"],
      ["vm-1", "vm-2", "vm-10"],
    ],
    [
      "text ignoring case",
      ["beta", "Alpha", "alpha2"],
      ["Alpha", "alpha2", "beta"],
    ],
    [
      "ISO dates chronologically",
      ["2026-10-14T09:00:00Z", "2025-12-31T23:59:59Z", "2026-02-01T00:00:00Z"],
      ["2025-12-31T23:59:59Z", "2026-02-01T00:00:00Z", "2026-10-14T09:00:00Z"],
    ],
    ["mixed numbers and text as text", [10, "9", 2], [2, "9", 10]],
  ])("sorts %s ascending", (_, values, expected) => {
    expect(sortValues(values, "ascending")).toEqual(expected);
    expect(sortValues(values, "descending")).toEqual([...expected].reverse());
  });

  it.each([["ascending" as const], ["descending" as const]])(
    "puts blank values last when %s",
    (direction) => {
      const sorted = sortValues([null, "b", "", "a", undefined], direction);
      expect(sorted.slice(0, 2)).toEqual(
        direction === "ascending" ? ["a", "b"] : ["b", "a"],
      );
      expect(sorted.slice(2)).toEqual([null, "", undefined]);
    },
  );

  it("keeps equal rows in their original order", () => {
    const rows = [
      { id: "first", size: 1 },
      { id: "second", size: 1 },
      { id: "third", size: 0 },
    ];
    expect(
      sortRows(rows, (row) => row.size, "ascending").map((row) => row.id),
    ).toEqual(["third", "first", "second"]);
  });

  it("returns a copy and leaves the input alone", () => {
    const values = [2, 1];
    expect(sortValues(values, "ascending")).toEqual([1, 2]);
    expect(values).toEqual([2, 1]);
  });
});
