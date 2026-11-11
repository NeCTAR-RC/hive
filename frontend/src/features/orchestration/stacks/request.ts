// The request bodies of the launch and change template flows: the template
// source sent to validate, then the stack create and update bodies built on
// the validated source.
import type {
  StackCreateRequest,
  StackUpdateRequest,
  TemplateSource,
} from "../../../lib/api/types/orchestration";
import type { TemplateFormValues } from "../status";

/** The stack settings both flows send beside the template and parameters. */
export interface StackSettings {
  timeout_mins: number;
  rollback: boolean;
}

/**
 * The template step's values as a template source: the pasted template or
 * the URL, whichever the source picks, and the environment only when it has
 * text. `templateFormValues` in `status.ts` reads it back.
 */
export function templateSource(values: TemplateFormValues): TemplateSource {
  const body: TemplateSource = {};
  if (values.source === "text") body.template = values.template;
  else body.template_url = values.template_url;
  if (values.environment.trim()) body.environment = values.environment;
  return body;
}

/** The create body: the validated source with the stack's name and settings. */
export function stackCreateRequest(
  source: TemplateSource,
  details: StackSettings & { name: string },
  parameters: Record<string, unknown>,
): StackCreateRequest {
  return {
    ...source,
    name: details.name,
    parameters,
    timeout_mins: details.timeout_mins,
    rollback: details.rollback,
  };
}

/** The update body: the validated new source with the stack's settings. */
export function stackUpdateRequest(
  source: TemplateSource,
  details: StackSettings,
  parameters: Record<string, unknown>,
): StackUpdateRequest {
  return {
    ...source,
    parameters,
    timeout_mins: details.timeout_mins,
    rollback: details.rollback,
  };
}
