import { describe, expect, it } from "vitest";
import { reorderKeys } from "./reorder";

describe("reorderKeys", () => {
  const ids = ["a", "b", "c", "d"];

  it("drops the moved item before or after the target", () => {
    expect(
      reorderKeys(ids, new Set(["d"]), { key: "b", dropPosition: "before" }),
    ).toEqual(["a", "d", "b", "c"]);
    expect(
      reorderKeys(ids, new Set(["a"]), { key: "c", dropPosition: "after" }),
    ).toEqual(["b", "c", "a", "d"]);
  });

  it("keeps the relative order of several moved items", () => {
    expect(
      reorderKeys(ids, new Set(["c", "a"]), {
        key: "d",
        dropPosition: "after",
      }),
    ).toEqual(["b", "d", "a", "c"]);
  });

  it("changes nothing for a drop onto a moved item or an unknown target", () => {
    expect(
      reorderKeys(ids, new Set(["b"]), { key: "b", dropPosition: "before" }),
    ).toEqual(ids);
    expect(
      reorderKeys(ids, new Set(["b"]), { key: "zz", dropPosition: "after" }),
    ).toEqual(ids);
    expect(
      reorderKeys(ids, new Set(), { key: "a", dropPosition: "after" }),
    ).toEqual(ids);
  });

  it("returns a copy", () => {
    const same = reorderKeys(ids, new Set(["b"]), {
      key: "b",
      dropPosition: "on",
    });
    expect(same).not.toBe(ids);
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });
});
