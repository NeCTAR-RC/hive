import { describe, expect, it } from "vitest";
import type { ParameterSpec, Stack } from "../../lib/api/types/orchestration";
import {
  availableStackActions,
  compilePattern,
  defaultValue,
  groupParameters,
  parametersSchema,
  parameterValues,
  statusLabel,
  statusTone,
  templateFormValues,
  timeoutMinutes,
} from "./status";

const base: ParameterSpec = {
  name: "p",
  type: "string",
  label: "P",
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
};

function spec(over: Partial<ParameterSpec>): ParameterSpec {
  return { ...base, ...over };
}

describe("stack status", () => {
  it.each([
    {
      status: "CREATE_IN_PROGRESS",
      tone: "progress",
      label: "Create in progress",
    },
    { status: "UPDATE_COMPLETE", tone: "success", label: "Update complete" },
    { status: "ROLLBACK_FAILED", tone: "danger", label: "Rollback failed" },
    { status: "DELETE_COMPLETE", tone: "neutral", label: "Delete complete" },
    { status: "INIT", tone: "neutral", label: "INIT" },
    { status: null, tone: "neutral", label: "Unknown" },
  ])("$status is $label ($tone)", ({ status, tone, label }) => {
    expect(statusTone(status)).toBe(tone);
    expect(statusLabel(status)).toBe(label);
  });
});

describe("defaultValue", () => {
  it.each([
    { over: { default: null }, value: "" },
    { over: { default: "m3.small" }, value: "m3.small" },
    { over: { default: 3, type: "number" }, value: "3" },
    {
      over: { default: ["a", "b"], type: "comma_delimited_list" },
      value: "a,b",
    },
    { over: { default: { a: 1 }, type: "json" }, value: '{"a":1}' },
    { over: { default: true, type: "boolean" }, value: "true" },
  ])("$value", ({ over, value }) => {
    expect(defaultValue(spec(over))).toBe(value);
  });
});

describe("compilePattern", () => {
  it.each([
    { pattern: "[a-z]+", value: "abc", matches: true },
    { pattern: "[a-z]+", value: "abc1", matches: false },
    { pattern: "a|b", value: "ab", matches: false },
  ])("/$pattern/ on $value: $matches", ({ pattern, value, matches }) => {
    expect(compilePattern(pattern)?.test(value)).toBe(matches);
  });

  it("gives up on Python-only syntax", () => {
    expect(compilePattern("(?P<name>[a-z]+)")).toBeNull();
    expect(compilePattern("[")).toBeNull();
  });
});

describe("parametersSchema", () => {
  const specs = [
    spec({ name: "key", label: "Key", required: true }),
    spec({ name: "count", label: "Count", type: "number" }),
    spec({ name: "extra", label: "Extra", type: "json" }),
    spec({
      name: "zone",
      label: "Zone",
      allowed_pattern: "[a-z]+-[0-9]+",
      constraint_description: "Use a zone such as qh-2",
    }),
    spec({ name: "named", label: "Named", allowed_pattern: "(?P<x>[a-z]+)" }),
  ];
  const valid = { key: "k", count: "", extra: "", zone: "", named: "" };

  it.each([
    { name: "the defaults", over: {}, issue: null },
    {
      name: "a missing required value",
      over: { key: "" },
      issue: "Key is required",
    },
    { name: "a number", over: { count: "4" }, issue: null },
    {
      name: "a non-number",
      over: { count: "four" },
      issue: "Count must be a number",
    },
    { name: "valid JSON", over: { extra: '{"a":1}' }, issue: null },
    {
      name: "invalid JSON",
      over: { extra: "{" },
      issue: "Extra must be valid JSON",
    },
    { name: "a matching value", over: { zone: "qh-2" }, issue: null },
    {
      name: "a partial match",
      over: { zone: "qh-2x" },
      issue: "Use a zone such as qh-2",
    },
    // Heat checks Python-only patterns itself; the form lets anything through.
    {
      name: "any value for a Python-only pattern",
      over: { named: "123" },
      issue: null,
    },
  ])("accepts or explains $name", ({ over, issue }) => {
    const result = parametersSchema(specs).safeParse({ ...valid, ...over });
    expect(result.success ? null : result.error.issues[0]?.message).toBe(issue);
  });
});

describe("timeoutMinutes", () => {
  it.each([[1], [60], [10080]])("accepts %s", (minutes) => {
    expect(timeoutMinutes.safeParse(minutes).success).toBe(true);
  });

  it.each([
    [NaN, "Enter a number of minutes"],
    [1.5, "Enter a whole number of minutes"],
    [0, "At least 1 minute"],
    [10081, "At most 10080 minutes (a week)"],
  ])("refuses %s in the field's own words", (minutes, message) => {
    expect(timeoutMinutes.safeParse(minutes).error?.issues[0]?.message).toBe(
      message,
    );
  });
});

describe("parameterValues", () => {
  it("leaves blanks out and turns booleans into booleans", () => {
    const specs = [
      spec({ name: "a" }),
      spec({ name: "b" }),
      spec({ name: "c", type: "boolean" }),
      spec({ name: "d", type: "boolean" }),
    ];
    expect(
      parameterValues(specs, { a: "x", b: "", c: "true", d: "false" }),
    ).toEqual({ a: "x", c: true, d: false });
  });
});

describe("groupParameters", () => {
  it("keeps group order and puts ungrouped parameters last", () => {
    const groups = groupParameters([
      spec({ name: "a" }),
      spec({ name: "b", group: "Network" }),
      spec({ name: "c", group: "Compute" }),
      spec({ name: "d", group: "Network" }),
    ]);
    expect(
      groups.map((g) => [g.label, g.specs.map((s) => s.name).join("")]),
    ).toEqual([
      ["Network", "bd"],
      ["Compute", "c"],
      [null, "a"],
    ]);
  });
});

describe("templateFormValues", () => {
  it.each([
    {
      source: {
        template: "heat_template_version: 2018-08-31",
        environment: "parameters: {}",
      },
      values: {
        source: "text",
        template: "heat_template_version: 2018-08-31",
        template_url: "",
        environment: "parameters: {}",
      },
    },
    {
      source: { template_url: "https://example.org/stack.yaml" },
      values: {
        source: "url",
        template: "",
        template_url: "https://example.org/stack.yaml",
        environment: "",
      },
    },
  ])("restores the $values.source source", ({ source, values }) => {
    expect(templateFormValues(source)).toEqual(values);
  });
});

const stack = (status: string, actions: string[]): Stack => ({
  id: "s1",
  name: "web-tier",
  description: null,
  status,
  status_reason: null,
  creation_time: null,
  updated_time: null,
  deletion_time: null,
  timeout_mins: null,
  disable_rollback: null,
  tags: [],
  parent: null,
  stack_owner: null,
  is_transitional: status.endsWith("_IN_PROGRESS"),
  actions,
});

/** The offers as `id: reason` pairs, with "" for an enabled action. */
const reasons = (s: Stack) =>
  Object.fromEntries(
    availableStackActions(s).map((o) => [o.id, o.disabledReason ?? ""]),
  );

describe("stack actions", () => {
  it("offers suspend, check and delete on a completed stack", () => {
    expect(
      reasons(
        stack("CREATE_COMPLETE", ["suspend", "check", "update", "delete"]),
      ),
    ).toEqual({
      suspend: "",
      resume: "The stack is not suspended",
      check: "",
      cancel_update: "Only an update in progress can be cancelled",
      delete: "",
    });
  });

  it("offers cancelling an update in progress", () => {
    expect(
      reasons(stack("UPDATE_IN_PROGRESS", ["cancel_update", "delete"])),
    ).toMatchObject({ cancel_update: "", delete: "" });
  });

  it("offers resume and delete on a suspended stack", () => {
    expect(
      reasons(stack("SUSPEND_COMPLETE", ["resume", "update", "delete"])),
    ).toEqual({
      suspend: "The stack is already suspended",
      resume: "",
      check: "The stack can be checked once it is complete",
      cancel_update: "Only an update in progress can be cancelled",
      delete: "",
    });
  });

  it("lists every action disabled while the stack is being deleted", () => {
    expect(reasons(stack("DELETE_IN_PROGRESS", []))).toEqual({
      suspend: "The stack cannot be suspended while it is being deleted",
      resume: "The stack is not suspended",
      check: "The stack can be checked once it is complete",
      cancel_update: "Only an update in progress can be cancelled",
      delete: "The stack is already being deleted",
    });
  });

  it("says what a busy stack is doing, and names a failed status", () => {
    expect(reasons(stack("CREATE_IN_PROGRESS", ["delete"])).suspend).toBe(
      "The stack cannot be suspended while it is being created",
    );
    expect(reasons(stack("CREATE_FAILED", ["update", "delete"])).suspend).toBe(
      "Not available while the status is Create failed",
    );
  });
});
