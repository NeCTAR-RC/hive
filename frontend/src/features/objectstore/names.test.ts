import { describe, expect, it } from "vitest";
import { hasNoDotSegments } from "./names";

describe("hasNoDotSegments", () => {
  it.each(["docs", "a/b/c.txt", ".hidden", "notes..txt", "a/.../b"])(
    "takes %j",
    (name) => {
      expect(hasNoDotSegments(name)).toBe(true);
    },
  );

  it.each([".", "..", "a/./b", "a/../b", "a/.."])("refuses %j", (name) => {
    expect(hasNoDotSegments(name)).toBe(false);
  });
});
