import { describe, expect, it } from "vitest";
import { sortView, viewPageSize, viewSort } from "./view";

const byCreated = { column: "created", direction: "descending" } as const;

describe("viewSort", () => {
  it("is the default sort when the view names none", () => {
    expect(viewSort({}, byCreated)).toBe(byCreated);
  });

  it("reads the column and order", () => {
    expect(viewSort({ sort: "name", order: "desc" }, byCreated)).toStrictEqual({
      column: "name",
      direction: "descending",
    });
  });

  it("sorts ascending when the order is left out", () => {
    expect(viewSort({ sort: "name" }, undefined)).toStrictEqual({
      column: "name",
      direction: "ascending",
    });
  });
});

describe("sortView", () => {
  it("clears the fields for the default sort", () => {
    expect(sortView(byCreated, byCreated)).toStrictEqual({
      sort: undefined,
      order: undefined,
    });
  });

  it("writes any other sort", () => {
    expect(
      sortView({ column: "created", direction: "ascending" }, byCreated),
    ).toStrictEqual({ sort: "created", order: "asc" });
  });

  it("round-trips through viewSort", () => {
    const sort = { column: "name", direction: "descending" } as const;
    expect(viewSort(sortView(sort, byCreated), byCreated)).toStrictEqual(sort);
  });
});

describe("viewPageSize", () => {
  it("uses the view's size when the table offers it", () => {
    expect(viewPageSize({ size: 50 }, 20, [10, 20, 50])).toBe(50);
  });

  it("falls back to the remembered size for a size not offered", () => {
    expect(viewPageSize({ size: 7 }, 20, [10, 20, 50])).toBe(20);
    expect(viewPageSize({}, 10, [10, 20, 50])).toBe(10);
  });
});
