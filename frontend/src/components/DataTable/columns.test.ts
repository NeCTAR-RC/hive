import { describe, expect, it } from "vitest";
import {
  columnChoice,
  defaultVisibleColumnIds,
  parseStoredColumns,
  visibleColumnIds,
} from "./columns";
import type { ColumnDef } from "./DataTable";

const columns: ColumnDef<unknown>[] = [
  { id: "name", label: "Name", cell: () => null },
  { id: "zone", label: "Zone", cell: () => null, hideBelow: "md" },
  { id: "created", label: "Created", cell: () => null, hideBelow: "lg" },
  { id: "id", label: "ID", cell: () => null, defaultHidden: true },
];

const desktop = { tablet: true, desktop: true };

describe("defaultVisibleColumnIds", () => {
  it.each([
    ["phone", { tablet: false, desktop: false }, ["name"]],
    ["tablet", { tablet: true, desktop: false }, ["name", "zone"]],
    ["desktop", desktop, ["name", "zone", "created"]],
  ])("on a %s shows %j", (_, viewport, expected) => {
    expect([...defaultVisibleColumnIds(columns, viewport)]).toEqual(expected);
  });
});

describe("parseStoredColumns", () => {
  it.each([
    ["nothing", null],
    ["a string", "name"],
    ["numbers", [1, 2]],
    ["a choice with a malformed list", { shown: "name", known: [] }],
    ["a choice without known", { shown: ["name"] }],
  ])("ignores %s", (_, raw) => {
    expect(parseStoredColumns(raw)).toBeNull();
  });

  it("reads a choice", () => {
    expect(parseStoredColumns({ shown: ["name"], known: ["name"] })).toEqual({
      shown: ["name"],
      known: ["name"],
      legacy: false,
    });
  });

  it("reads the bare array older tables stored", () => {
    expect(parseStoredColumns(["name"])).toEqual({
      shown: ["name"],
      known: ["name"],
      legacy: true,
    });
  });
});

describe("visibleColumnIds", () => {
  it("shows the defaults without a stored choice", () => {
    expect([...visibleColumnIds(columns, desktop, null)]).toEqual([
      "name",
      "zone",
      "created",
    ]);
  });

  it("keeps the choice, drops gone ids and gives a new column its default", () => {
    const stored = parseStoredColumns({
      shown: ["name", "id", "gone"],
      known: ["name", "zone", "id", "gone"],
    });
    expect([...visibleColumnIds(columns, desktop, stored)]).toEqual([
      "name",
      "created",
      "id",
    ]);
  });

  it("shows only what a bare array lists", () => {
    const stored = parseStoredColumns(["zone", "gone"]);
    expect([...visibleColumnIds(columns, desktop, stored)]).toEqual(["zone"]);
  });
});

describe("columnChoice", () => {
  it("records the shown ids in column order and every id the table has", () => {
    expect(columnChoice(columns, new Set(["id", "name"]))).toEqual({
      shown: ["name", "id"],
      known: ["name", "zone", "created", "id"],
    });
  });
});
