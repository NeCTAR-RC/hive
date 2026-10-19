import { describe, expect, it } from "vitest";
import type { ParameterSpec } from "../../lib/api/types";
import { compilePattern, parametersSchema, statusLabel } from "./status";

function spec(overrides: Partial<ParameterSpec>): ParameterSpec {
  return {
    name: "key",
    type: "string",
    label: "Key",
    description: "",
    group: null,
    default: null,
    no_echo: false,
    required: false,
    allowed_values: null,
    allowed_pattern: null,
    min_length: null,
    max_length: null,
    min_value: null,
    max_value: null,
    custom_constraint: null,
    constraint_description: null,
    ...overrides,
  };
}

describe("compilePattern", () => {
  it("anchors a pattern JavaScript understands", () => {
    const pattern = compilePattern("[a-z]+");
    expect(pattern?.test("abc")).toBe(true);
    expect(pattern?.test("abc1")).toBe(false);
  });

  it("gives null for Python-only syntax", () => {
    expect(compilePattern("(?P<name>[a-z]+)(?P=name)")).toBeNull();
  });
});

describe("parametersSchema", () => {
  it("checks an allowed_pattern that compiles", () => {
    const schema = parametersSchema([
      spec({ allowed_pattern: "[a-z]+", constraint_description: "lower" }),
    ]);
    expect(schema.safeParse({ key: "abc" }).success).toBe(true);
    const result = schema.safeParse({ key: "ABC" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("lower");
  });

  it("leaves a pattern that does not compile to Heat", () => {
    const schema = parametersSchema([
      spec({ allowed_pattern: "(?P<name>[a-z]+)(?P=name)" }),
    ]);
    expect(() => schema.safeParse({ key: "anything" })).not.toThrow();
    expect(schema.safeParse({ key: "anything" }).success).toBe(true);
  });
});

describe("statusLabel", () => {
  it("words a Heat status", () => {
    expect(statusLabel("UPDATE_IN_PROGRESS")).toBe("Update in progress");
  });
});
