// Heat status wording (`<ACTION>_<STATE>` as heat-dashboard shows it) and
// the parameter form helpers for the launch and update steps.
import { z } from "zod";
import type { StatusTone } from "../../components/StatusPill/StatusPill";
import type { ParameterSpec, TemplateSource } from "../../lib/api/types";

export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return "neutral";
  if (status.endsWith("_IN_PROGRESS")) return "progress";
  if (status.endsWith("_FAILED")) return "danger";
  if (status === "DELETE_COMPLETE") return "neutral";
  if (status.endsWith("_COMPLETE")) return "success";
  return "neutral";
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  const match = /^([A-Z]+)_(IN_PROGRESS|COMPLETE|FAILED)$/.exec(status);
  if (!match) return status;
  const verb = (match[1] ?? "").toLowerCase();
  const state = (match[2] ?? "").toLowerCase().replace("_", " ");
  return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${state}`;
}

export const ACTION_LABELS: Record<string, string> = {
  suspend: "Suspend stack",
  resume: "Resume stack",
  check: "Check stack",
  update: "Change stack template",
  cancel_update: "Cancel stack update",
  delete: "Delete stack",
};

/** The verb for "Could not <verb> stack <name>". */
export function actionVerb(action: string): string {
  return action === "cancel_update" ? "cancel the update of" : action;
}

/**
 * A template's `allowed_pattern` as a JavaScript regex anchored at both
 * ends, or null when it does not compile here (Heat takes Python regex
 * syntax, which JavaScript does not fully share); Heat checks it anyway.
 */
export function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(`^(?:${pattern})$`);
  } catch {
    return null;
  }
}

/** The form's string value for a parameter's default. */
export function defaultValue(spec: ParameterSpec): string {
  const value = spec.default;
  if (value === null || value === undefined) return "";
  if (spec.type === "json") return JSON.stringify(value);
  if (Array.isArray(value)) return value.join(",");
  return String(value);
}

/** The zod schema for the generated parameters step: every parameter is a
 * string in the form; the backend coerces by type. */
export function parametersSchema(specs: ParameterSpec[]) {
  const shape: Record<string, z.ZodType<string, string>> = {};
  for (const spec of specs) {
    let field: z.ZodType<string, string> = spec.required
      ? z.string().min(1, `${spec.label} is required`)
      : z.string();
    if (spec.type === "number") {
      field = field.refine(
        (v) => v === "" || !Number.isNaN(Number(v)),
        `${spec.label} must be a number`,
      );
    }
    if (spec.type === "json") {
      field = field.refine((v) => {
        if (v === "") return true;
        try {
          JSON.parse(v);
          return true;
        } catch {
          return false;
        }
      }, `${spec.label} must be valid JSON`);
    }
    const pattern = spec.allowed_pattern
      ? compilePattern(spec.allowed_pattern)
      : null;
    if (pattern) {
      field = field.refine(
        (v) => v === "" || pattern.test(v),
        spec.constraint_description ??
          `${spec.label} must match ${spec.allowed_pattern}`,
      );
    }
    shape[spec.name] = field;
  }
  return z.object(shape);
}

/** Form strings into the request body: blanks are left out so Heat applies
 * the template default. */
export function parameterValues(
  specs: ParameterSpec[],
  values: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const spec of specs) {
    const value = values[spec.name];
    if (value === undefined || value === "") continue;
    out[spec.name] = spec.type === "boolean" ? value === "true" : value;
  }
  return out;
}

/** Parameter specs grouped in order, ungrouped ones last. */
export function groupParameters(
  specs: ParameterSpec[],
): { label: string | null; specs: ParameterSpec[] }[] {
  const groups: { label: string | null; specs: ParameterSpec[] }[] = [];
  for (const spec of specs) {
    const label = spec.group ?? null;
    let group = groups.find((g) => g.label === label);
    if (!group) {
      group = { label, specs: [] };
      groups.push(group);
    }
    group.specs.push(spec);
  }
  return [...groups.filter((g) => g.label), ...groups.filter((g) => !g.label)];
}

/** The template step's form values for a source that validated, so going
 * back to that step shows what was used. */
export function templateSourceValues(body: TemplateSource): {
  source: "text" | "url";
  template: string;
  template_url: string;
  environment: string;
} {
  return {
    source: body.template_url ? "url" : "text",
    template: body.template ?? "",
    template_url: body.template_url ?? "",
    environment: body.environment ?? "",
  };
}
