import { describe, expect, it } from "vitest";
import { tableStatus } from "./status";

const base = {
  isLoading: false,
  hasError: false,
  total: 45,
  first: 21,
  last: 40,
  emptyTitle: "No volumes yet",
};

describe("tableStatus", () => {
  it.each([
    ["loading wins", { isLoading: true, hasError: true }, "Loading"],
    ["a failure with nothing shown", { hasError: true }, "Failed to load"],
    ["an empty list", { total: 0, first: 0, last: 0 }, "No volumes yet"],
    ["the rows on screen", {}, "Showing 21 to 40 of 45"],
  ])("says %s", (_, overrides, expected) => {
    expect(tableStatus({ ...base, ...overrides })).toBe(expected);
  });
});
