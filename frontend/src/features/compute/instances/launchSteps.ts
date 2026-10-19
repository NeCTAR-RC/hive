// The launch wizard's steps, the form fields each one owns, and which
// steps still need attention.
import type { FieldErrors, FieldPath } from "react-hook-form";
import { launchSchema, type LaunchForm } from "./launchForm";

export interface Step {
  id: string;
  title: string;
  fields: FieldPath<LaunchForm>[];
}

export const STEPS: Step[] = [
  {
    id: "details",
    title: "Details",
    fields: ["name", "description", "availability_zone", "count"],
  },
  {
    id: "source",
    title: "Source",
    fields: [
      "source_type",
      "source_id",
      "create_volume",
      "volume_size_gb",
      "volume_type",
      "delete_volume_on_termination",
    ],
  },
  { id: "flavor", title: "Flavour", fields: ["flavor_class", "flavor_id"] },
  { id: "networks", title: "Networks", fields: ["networks", "ports"] },
  { id: "security", title: "Security groups", fields: ["security_groups"] },
  { id: "keypair", title: "Key pair", fields: ["key_name"] },
  {
    id: "config",
    title: "Configuration",
    fields: ["user_data", "server_group_id", "metadata"],
  },
];

export type StepStatus = "pending" | "invalid";

/**
 * Which steps still need attention: "invalid" when react-hook-form holds
 * an error on a field the step owns (the user has been told about it),
 * else "pending" when the schema rejects the step's current values (a
 * required answer not given yet). Horizon's wizard marks every step whose
 * form is $invalid the same way (horizon/static/framework/widgets/wizard/
 * wizard.html); the two words tell a reader which of those they have
 * already seen.
 */
export function stepStatuses(
  steps: Step[],
  values: unknown,
  errors: FieldErrors<LaunchForm>,
): Record<string, StepStatus | undefined> {
  const parsed = launchSchema.safeParse(values);
  const rejected = new Set<string>();
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const root = issue.path[0];
      if (root !== undefined) rejected.add(String(root));
    }
  }
  const told = new Set(Object.keys(errors));
  const result: Record<string, StepStatus | undefined> = {};
  for (const step of steps) {
    const roots = step.fields.map((field) => field.split(".")[0]!);
    if (roots.some((root) => told.has(root))) result[step.id] = "invalid";
    else if (roots.some((root) => rejected.has(root))) {
      result[step.id] = "pending";
    } else result[step.id] = undefined;
  }
  return result;
}
