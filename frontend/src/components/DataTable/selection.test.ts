import { describe, expect, it } from "vitest";
import { resolveSelection } from "./selection";

const pageRows = [{ id: "a" }, { id: "b" }, { id: "c" }];
const getRowId = (row: { id: string }) => row.id;

describe("resolveSelection", () => {
  it.each([
    ["select-all resolves to the page only", "all" as const, ["a", "b", "c"]],
    ["explicit keys keep page order", new Set(["c", "a"]), ["a", "c"]],
    ["keys of rows no longer shown drop out", new Set(["a", "gone"]), ["a"]],
    ["nothing selected", new Set<string>(), []],
  ])("%s", (_, selection, expected) => {
    expect(
      resolveSelection(selection, pageRows, getRowId).map(getRowId),
    ).toEqual(expected);
  });
});
