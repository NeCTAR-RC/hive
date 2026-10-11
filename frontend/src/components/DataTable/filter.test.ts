import { describe, expect, it } from "vitest";
import type { ColumnDef } from "./DataTable";
import { filterRows } from "./filter";

interface Row {
  name: string;
  ip: string;
  hidden: string;
}

const columns: ColumnDef<Row>[] = [
  { id: "name", label: "Name", cell: (r) => r.name, textValue: (r) => r.name },
  { id: "ip", label: "IP", cell: (r) => r.ip, textValue: (r) => r.ip },
  { id: "hidden", label: "Hidden", cell: (r) => r.hidden },
];

const rows: Row[] = [
  { name: "web-1", ip: "203.0.113.10", hidden: "secret" },
  { name: "db-1", ip: "10.0.0.5", hidden: "web" },
];

describe("filterRows", () => {
  it("returns everything for a blank query", () => {
    expect(filterRows(rows, "  ", columns)).toEqual(rows);
  });

  it("matches any searchable column, case-insensitively", () => {
    expect(filterRows(rows, "WEB", columns).map((r) => r.name)).toEqual([
      "web-1",
    ]);
    expect(filterRows(rows, "10.0", columns).map((r) => r.name)).toEqual([
      "db-1",
    ]);
  });

  it("requires every word to match", () => {
    expect(filterRows(rows, "web 203", columns)).toHaveLength(1);
    expect(filterRows(rows, "web 10.0", columns)).toHaveLength(0);
  });

  it("ignores columns without a text value", () => {
    expect(filterRows(rows, "secret", columns)).toHaveLength(0);
  });
});
