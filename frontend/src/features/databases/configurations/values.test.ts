import { describe, expect, it } from "vitest";
import {
  parameterInputs,
  parameterKind,
  parameterValue,
  parameterValueError,
  valueStrings,
  valuesWith,
  valuesWithout,
} from "./values";

/** Values as Trove returns them: strings, numbers and booleans mixed. */
const current = {
  character_set_server: "utf8mb4",
  max_connections: 200,
  autocommit: true,
};

describe("valueStrings", () => {
  it("keeps strings and writes every other value as JSON", () => {
    expect(valueStrings(current)).toEqual({
      character_set_server: "utf8mb4",
      max_connections: "200",
      autocommit: "true",
    });
  });
});

describe("valuesWith", () => {
  it("sends the new parameter with every current value", () => {
    expect(valuesWith(current, "wait_timeout", "120")).toEqual({
      character_set_server: "utf8mb4",
      max_connections: "200",
      autocommit: "true",
      wait_timeout: "120",
    });
  });

  it("replaces the value of a parameter already set", () => {
    expect(valuesWith(current, "max_connections", "500")).toEqual({
      character_set_server: "utf8mb4",
      max_connections: "500",
      autocommit: "true",
    });
  });
});

describe("valuesWithout", () => {
  it.each([
    {
      case: "drops one parameter and keeps the rest",
      names: ["autocommit"],
      body: { character_set_server: "utf8mb4", max_connections: "200" },
    },
    {
      case: "drops every chosen parameter in one body",
      names: ["autocommit", "max_connections"],
      body: { character_set_server: "utf8mb4" },
    },
    {
      case: "ignores a name the group does not set",
      names: ["wait_timeout"],
      body: {
        character_set_server: "utf8mb4",
        max_connections: "200",
        autocommit: "true",
      },
    },
  ])("$case", ({ names, body }) => {
    expect(valuesWithout(current, names)).toEqual(body);
  });
});

describe("parameterValueError", () => {
  const integer = { type: "integer", min: 1, max: 100000 };

  it.each([
    [integer, "200"],
    [integer, " 1 "],
    [{ type: "long", min: null, max: null }, "-5"],
    [{ type: "float", min: 0, max: 1 }, "0.5"],
    [{ type: "float", min: null, max: null }, "1e3"],
    [{ type: "boolean", min: null, max: null }, "TRUE"],
    [{ type: "string", min: null, max: null }, "utf8mb4"],
    [{ type: null, min: null, max: null }, "anything"],
  ])("accepts %j = %s", (spec, value) => {
    expect(parameterValueError(spec, value)).toBeNull();
  });

  it.each([
    [integer, "abc", "Enter a whole number"],
    [integer, "1.5", "Enter a whole number"],
    [integer, "0", "Enter a number from 1 to 100000"],
    [integer, "100001", "Enter a number from 1 to 100000"],
    [{ type: "integer", min: 10, max: null }, "5", "Enter at least 10"],
    [{ type: "integer", min: null, max: 10 }, "50", "Enter at most 10"],
    [{ type: "float", min: null, max: null }, "1.2.3", "Enter a number"],
    [{ type: "boolean", min: null, max: null }, "yes", "Enter true or false"],
  ])("refuses %j = %s", (spec, value, message) => {
    expect(parameterValueError(spec, value)).toBe(message);
  });
});

describe("parameterKind", () => {
  it.each([
    ["boolean", "boolean"],
    ["Integer", "integer"],
    ["long", "integer"],
    ["float", "float"],
    ["string", "string"],
    [null, "string"],
  ])("takes %s as %s", (type, kind) => {
    expect(parameterKind(type)).toBe(kind);
  });
});

describe("parameterInputs", () => {
  it("starts every input from the value in force", () => {
    expect(parameterInputs("200")).toEqual({
      text: "200",
      number: 200,
      flag: false,
    });
    expect(parameterInputs("True")).toEqual({
      text: "True",
      number: undefined,
      flag: true,
    });
  });

  it("starts empty and off for a parameter the group does not set", () => {
    expect(parameterInputs(undefined)).toEqual({
      text: "",
      number: undefined,
      flag: false,
    });
  });
});

describe("parameterValue", () => {
  const inputs = { text: " utf8mb4 ", number: 300, flag: true };

  it("sends the input of the parameter's kind as text", () => {
    expect(parameterValue("boolean", inputs)).toBe("true");
    expect(parameterValue("boolean", { ...inputs, flag: false })).toBe("false");
    expect(parameterValue("integer", inputs)).toBe("300");
    expect(parameterValue("float", { ...inputs, number: 0.5 })).toBe("0.5");
    expect(parameterValue("string", inputs)).toBe("utf8mb4");
  });

  it("sends nothing for an empty number", () => {
    expect(parameterValue("integer", { ...inputs, number: undefined })).toBe(
      "",
    );
  });
});
