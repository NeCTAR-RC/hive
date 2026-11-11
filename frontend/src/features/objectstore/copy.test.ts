import { describe, expect, it } from "vitest";
import { copyName } from "./copy";

describe("copyName", () => {
  it.each([
    ["notes/todo.txt", [], "notes/todo (copy).txt"],
    ["readme.txt", [], "readme (copy).txt"],
    ["archive.tar.gz", [], "archive.tar (copy).gz"],
    [".env", [], ".env (copy)"],
    ["a/b/Makefile", [], "a/b/Makefile (copy)"],
    [
      "notes/todo.txt",
      ["notes/todo (copy).txt", "notes/todo (copy 2).txt"],
      "notes/todo (copy 3).txt",
    ],
  ])("names a copy of %s, beside %j, %s", (name, taken, copy) => {
    expect(copyName(name, new Set(taken))).toBe(copy);
  });
});
