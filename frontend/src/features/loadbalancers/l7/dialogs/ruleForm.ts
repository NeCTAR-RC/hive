// The L7 rule form (octavia-dashboard workflow/l7rule): its fields, the key
// a header or cookie rule needs, the comparisons each rule type allows, and
// the request bodies its values become.
import { z } from "zod";
import { offered } from "../../../../lib/api/offered";
import type {
  L7Rule,
  L7RuleSpec,
  L7RuleUpdate,
} from "../../../../lib/api/types/loadbalancers";
import { maxLength } from "../../../../lib/validation";

/** The rule types and comparisons offered while the options load. */
export const RULE_TYPES = [
  "HOST_NAME",
  "PATH",
  "FILE_TYPE",
  "HEADER",
  "COOKIE",
];
export const COMPARE_TYPES = [
  "REGEX",
  "EQUAL_TO",
  "STARTS_WITH",
  "ENDS_WITH",
  "CONTAINS",
];

/** Octavia compares a file type rule by REGEX or EQUAL_TO only. */
const FILE_TYPE_COMPARISONS = ["REGEX", "EQUAL_TO"];

/** Whether a rule of `type` names a key: the header or cookie it reads. */
export function hasKey(type: string): boolean {
  return ["HEADER", "COOKIE"].includes(type);
}

/** The comparisons of `offered` that a rule of `type` may use. */
export function comparisonsFor(type: string, offered: readonly string[]) {
  return type === "FILE_TYPE"
    ? offered.filter((c) => FILE_TYPE_COMPARISONS.includes(c))
    : [...offered];
}

/**
 * The rule's fields. A header or cookie rule names its key, and the
 * comparison is one the type allows (the dialog offers only those).
 */
export const ruleSchema = z
  .object({
    type: z.string().min(1, "Choose a type"),
    compare_type: z.string().min(1, "Choose a comparison"),
    key: maxLength(255),
    value: maxLength(255).min(1, "Enter a value"),
    invert: z.boolean(),
    admin_state_up: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (hasKey(v.type) && !v.key) {
      ctx.addIssue({
        code: "custom",
        path: ["key"],
        message: "Enter the header or cookie name",
      });
    }
    if (!comparisonsFor(v.type, COMPARE_TYPES).includes(v.compare_type)) {
      ctx.addIssue({
        code: "custom",
        path: ["compare_type"],
        message: "Choose one of the comparisons listed for this type",
      });
    }
  });

export type RuleValues = z.infer<typeof ruleSchema>;

/** The form's opening values: a new path rule, or `rule` as it stands. */
export function ruleDefaults(rule: L7Rule | null): RuleValues {
  return {
    type: rule?.type ?? "PATH",
    compare_type: rule?.compare_type ?? "STARTS_WITH",
    key: rule?.key ?? "",
    value: rule?.value ?? "",
    invert: rule?.invert ?? false,
    admin_state_up: rule?.admin_state_up ?? true,
  };
}

/** The create body: the key only when the rule has one. */
export function ruleBody(v: RuleValues): L7RuleSpec {
  return {
    type: offered<L7RuleSpec["type"]>(v.type),
    compare_type: offered<L7RuleSpec["compare_type"]>(v.compare_type),
    value: v.value,
    invert: v.invert,
    admin_state_up: v.admin_state_up,
    ...(hasKey(v.type) && v.key ? { key: v.key } : {}),
  };
}

/**
 * The update body: every field, and the key cleared when the rule's new
 * type has none.
 */
export function ruleUpdateBody(v: RuleValues): L7RuleUpdate {
  return {
    type: offered<L7RuleSpec["type"]>(v.type),
    compare_type: offered<L7RuleSpec["compare_type"]>(v.compare_type),
    key: hasKey(v.type) ? v.key : null,
    value: v.value,
    invert: v.invert,
    admin_state_up: v.admin_state_up,
  };
}
