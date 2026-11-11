import { describe, expect, it } from "vitest";
import { menuSections } from "./sections";

describe("menuSections", () => {
  it("keeps a menu without groups as one section", () => {
    const items: { id: string; group?: string }[] = [{ id: "a" }, { id: "b" }];
    expect(menuSections(items)).toStrictEqual([
      { group: undefined, items: [{ id: "a" }, { id: "b" }] },
    ]);
  });

  it("splits runs of neighbouring groups, in order", () => {
    const items = [
      { id: "start", group: "Power" },
      { id: "stop", group: "Power" },
      { id: "lock", group: "Lock" },
      { id: "delete", group: "Delete" },
    ];
    expect(
      menuSections(items).map((s) => [s.group, s.items.map((i) => i.id)]),
    ).toStrictEqual([
      ["Power", ["start", "stop"]],
      ["Lock", ["lock"]],
      ["Delete", ["delete"]],
    ]);
  });

  it("returns nothing for no items", () => {
    expect(menuSections([])).toStrictEqual([]);
  });
});
