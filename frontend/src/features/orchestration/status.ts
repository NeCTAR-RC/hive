// Heat status wording (`<ACTION>_<STATE>` as heat-dashboard shows it), the
// stack action rules and the parameter form helpers for the launch and
// update steps.
import { z } from "zod";
import { offerActions, type ActionTable } from "../../lib/actions";
import type {
  ParameterSpec,
  Stack,
  TemplateSource,
} from "../../lib/api/types/orchestration";
import { heatActivity, heatStatus } from "../../lib/status";

type Status = string | null | undefined;

export const statusTone = (status: Status) => heatStatus(status).tone;
export const statusLabel = (status: Status) => heatStatus(status).label;

export type StackActionId =
  "suspend" | "resume" | "check" | "cancel_update" | "delete";

/**
 * The stack menu, in heat-dashboard's order, with Heat's cancel update
 * (the Heat API's `cancel_update` stack action) before delete. The backend
 * reads the stack's status and lists the actions Heat allows now in
 * `actions`; each rule gives the reason when its action is not among them.
 */
const STACK_ACTIONS: ActionTable<StackActionId, Stack> = {
  rules: [
    {
      id: "suspend",
      label: "Suspend stack",
      checks: [(s) => !s.actions.includes("suspend") && suspendReason(s)],
    },
    {
      id: "resume",
      label: "Resume stack",
      checks: [
        (s) => !s.actions.includes("resume") && "The stack is not suspended",
      ],
    },
    {
      id: "check",
      label: "Check stack",
      checks: [
        (s) =>
          !s.actions.includes("check") &&
          "The stack can be checked once it is complete",
      ],
    },
    {
      id: "cancel_update",
      label: "Cancel stack update",
      checks: [
        (s) =>
          !s.actions.includes("cancel_update") &&
          "Only an update in progress can be cancelled",
      ],
    },
    {
      id: "delete",
      label: "Delete stack",
      tone: "danger",
      checks: [
        (s) =>
          !s.actions.includes("delete") && "The stack is already being deleted",
      ],
    },
  ],
};

/**
 * Why a stack cannot be suspended now: what it is busy doing ("while it is
 * being created"), that it already is, or its status for any other state.
 */
function suspendReason(stack: Stack): string {
  const activity = heatActivity(stack.status);
  if (activity) return `The stack cannot be suspended while it is ${activity}`;
  if (stack.status === "SUSPEND_COMPLETE")
    return "The stack is already suspended";
  return `Not available while the status is ${statusLabel(stack.status)}`;
}

export function availableStackActions(stack: Stack) {
  return offerActions(STACK_ACTIONS, stack);
}

/** The form's string value for a parameter's default. */
export function defaultValue(spec: ParameterSpec): string {
  const value = spec.default;
  if (value === null || value === undefined) return "";
  if (spec.type === "json") return JSON.stringify(value);
  if (Array.isArray(value)) return value.join(",");
  return String(value);
}

/**
 * A Heat `allowed_pattern` as a whole-value JavaScript regex, or null when
 * it does not compile. Heat patterns are Python regexes, and Python-only
 * syntax such as `(?P<name>...)` is not valid here; Heat still checks those
 * on launch, so the form skips them rather than failing to validate.
 */
export function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(`^(?:${pattern})$`);
  } catch {
    return null;
  }
}

/** The most minutes Heat's stack timeout takes: a week. */
const MAX_TIMEOUT_MINS = 10080;

/**
 * A stack's creation or update timeout: a whole number of minutes from 1 to
 * a week. Each way a value can be wrong says so in the field's own words,
 * rather than zod's.
 */
export const timeoutMinutes = z
  .number("Enter a number of minutes")
  .int("Enter a whole number of minutes")
  .min(1, "At least 1 minute")
  .max(MAX_TIMEOUT_MINS, `At most ${MAX_TIMEOUT_MINS} minutes (a week)`);

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

/** The template step's form values. */
export interface TemplateFormValues {
  source: "text" | "url";
  template: string;
  template_url: string;
  environment: string;
}

/**
 * The template step's values for a template already validated, so going
 * Back from the parameters step shows what the user entered.
 */
export function templateFormValues(source: TemplateSource): TemplateFormValues {
  return {
    source: source.template_url ? "url" : "text",
    template: sourceText(source.template),
    template_url: source.template_url ?? "",
    environment: sourceText(source.environment),
  };
}

/**
 * A template or environment as the form holds it. The SPA sends both as
 * text; the backend also takes a parsed object, which the form never holds.
 */
function sourceText(value: TemplateSource["template"]): string {
  return typeof value === "string" ? value : "";
}
