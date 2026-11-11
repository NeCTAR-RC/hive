import { describe, expect, it } from "vitest";
import { keyValueRecord, keyValueSchema } from "./keyValue";

describe("keyValueSchema", () => {
  it.each([
    { name: "no rows", entries: [], issue: null },
    {
      name: "distinct keys",
      entries: [
        { key: "role", value: "web" },
        { key: "tier", value: "" },
      ],
      issue: null,
    },
    {
      name: "a repeated key",
      entries: [
        { key: "role", value: "web" },
        { key: "role", value: "db" },
      ],
      issue: "Keys must be unique",
    },
    {
      name: "keys equal once trimmed",
      entries: [
        { key: "role", value: "web" },
        { key: " role ", value: "db" },
      ],
      issue: "Keys must be unique",
    },
    {
      name: "an empty key",
      entries: [{ key: "  ", value: "web" }],
      issue: "Enter a key",
    },
    {
      name: "a value over 255 characters",
      entries: [{ key: "role", value: "x".repeat(256) }],
      issue: "Use 255 characters or fewer",
    },
  ])("$name", ({ entries, issue }) => {
    const result = keyValueSchema.safeParse(entries);
    expect(result.success ? null : result.error.issues[0]?.message).toBe(issue);
  });
});

describe("keyValueRecord", () => {
  it("turns the rows into an object", () => {
    expect(
      keyValueRecord([
        { key: "role", value: "web" },
        { key: "tier", value: "" },
      ]),
    ).toEqual({ role: "web", tier: "" });
  });
});
