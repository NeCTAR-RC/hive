import { describe, expect, it } from "vitest";
import { parseStoredColumns, resolveVisibleColumns } from "./columns";

const ids = ["name", "status", "zone", "added"];
const byDefault = (id: string) => id !== "zone";

describe("parseStoredColumns", () => {
  it("ignores anything that is not a column choice", () => {
    expect(parseStoredColumns(null)).toBeNull();
    expect(parseStoredColumns("name")).toBeNull();
    expect(parseStoredColumns({ shown: "name", known: [] })).toBeNull();
    expect(parseStoredColumns([1, 2])).toBeNull();
  });

  it("reads the legacy bare array", () => {
    expect(parseStoredColumns(["name"])).toEqual({
      shown: ["name"],
      known: ["name"],
      legacy: true,
    });
  });
});

describe("resolveVisibleColumns", () => {
  it("drops unknown ids and gives new columns their default", () => {
    const stored = parseStoredColumns({
      shown: ["name", "gone"],
      known: ["name", "status", "zone", "gone"],
    });
    expect([...resolveVisibleColumns(stored, ids, byDefault)!]).toEqual([
      "name",
      "added",
    ]);
  });

  it("shows only what a legacy array lists", () => {
    const stored = parseStoredColumns(["status", "gone"]);
    expect([...resolveVisibleColumns(stored, ids, byDefault)!]).toEqual([
      "status",
    ]);
  });

  it("returns null without a stored choice", () => {
    expect(resolveVisibleColumns(null, ids, byDefault)).toBeNull();
  });
});
