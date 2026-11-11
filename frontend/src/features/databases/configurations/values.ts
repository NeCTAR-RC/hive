// The values of a configuration group as the values endpoint takes them,
// and the check a new value must pass. The endpoint replaces the whole
// set, so adding or removing a parameter sends every other value along
// with it.
import type { DbParameterSpec } from "../../../lib/api/types/databases";

/** The group's values as strings: strings pass as they are, others as JSON. */
export function valueStrings(
  values: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]),
  );
}

/** The group's values with one parameter set, replacing any current value. */
export function valuesWith(
  values: Record<string, unknown>,
  name: string,
  value: string,
): Record<string, string> {
  return { ...valueStrings(values), [name]: value };
}

/** The group's values without the named parameters. */
export function valuesWithout(
  values: Record<string, unknown>,
  names: string[],
): Record<string, string> {
  const removed = new Set(names);
  return Object.fromEntries(
    Object.entries(valueStrings(values)).filter(([key]) => !removed.has(key)),
  );
}

/** A whole number as Python's `int()` reads it: optional sign, digits. */
const WHOLE = /^[+-]?\d+$/;
/** A decimal number as Python's `float()` reads one, exponent included. */
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/**
 * Why `value` cannot be set for the parameter `spec`, or null when it can:
 * a boolean is true or false, an integer or long a whole number and a
 * float any number, each within the spec's min and max. Strings and
 * unknown types take any text. The backend checks the same
 * (`coerce_parameter`, trove-dashboard `config_param_manager.py`).
 */
export function parameterValueError(
  spec: Pick<DbParameterSpec, "type" | "min" | "max">,
  value: string,
): string | null {
  const type = (spec.type ?? "string").toLowerCase();
  const raw = value.trim();
  if (type === "boolean") {
    return ["true", "false"].includes(raw.toLowerCase())
      ? null
      : "Enter true or false";
  }
  if (!["integer", "long", "float"].includes(type)) return null;
  const whole = type !== "float";
  if (!(whole ? WHOLE : DECIMAL).test(raw)) {
    return whole ? "Enter a whole number" : "Enter a number";
  }
  const number = Number(raw);
  const { min, max } = spec;
  if ((min !== null && number < min) || (max !== null && number > max)) {
    if (min !== null && max !== null) {
      return `Enter a number from ${min} to ${max}`;
    }
    return min !== null ? `Enter at least ${min}` : `Enter at most ${max}`;
  }
  return null;
}

/**
 * The input a parameter takes, from its spec type: a switch for a boolean,
 * a number field for an integer, long or float, and text for anything
 * else (trove `config_param_manager.py`, the same types
 * `parameterValueError` checks).
 */
export type ParameterKind = "boolean" | "integer" | "float" | "string";

export function parameterKind(type: string | null | undefined): ParameterKind {
  switch ((type ?? "").toLowerCase()) {
    case "boolean":
      return "boolean";
    case "integer":
    case "long":
      return "integer";
    case "float":
      return "float";
    default:
      return "string";
  }
}

/** The typed inputs of the Add parameter form; one is shown per kind. */
export interface ParameterInputs {
  text: string;
  /** Empty is `undefined`, as the number field reports it. */
  number?: number | undefined;
  flag: boolean;
}

/**
 * The inputs showing a parameter's current value (a string from
 * `valueStrings`, or undefined when the group does not set it), so
 * changing a value starts from the one in force.
 */
export function parameterInputs(current: string | undefined): ParameterInputs {
  const raw = (current ?? "").trim();
  const number = raw === "" ? NaN : Number(raw);
  return {
    text: current ?? "",
    number: Number.isFinite(number) ? number : undefined,
    flag: raw.toLowerCase() === "true",
  };
}

/** The value the values endpoint takes, from the input of `kind`. */
export function parameterValue(
  kind: ParameterKind,
  inputs: ParameterInputs,
): string {
  if (kind === "boolean") return inputs.flag ? "true" : "false";
  if (kind === "integer" || kind === "float") {
    return inputs.number === undefined ? "" : String(inputs.number);
  }
  return inputs.text.trim();
}
