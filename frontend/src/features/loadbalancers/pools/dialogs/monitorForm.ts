// The health monitor form (octavia-dashboard monitor step): its fields and
// the request body its values become.
import { z } from "zod";
import type { MonitorSpec } from "../../../../lib/api/types/loadbalancers";
import { httpCheckPart } from "../../bodies";
import { monitorFields, refineMonitor } from "../../schemas";

/** The monitor dialog's fields, for a create and an edit alike. */
export const monitorSchema = z
  .object({
    ...monitorFields,
    name: z.string().trim(),
    admin_state_up: z.boolean(),
  })
  .superRefine(refineMonitor);

export type MonitorValues = z.infer<typeof monitorSchema>;

/**
 * The create or update body without the type, which only a create sends:
 * the timings, and for an HTTP monitor its check, a blank path or codes
 * read as Octavia's defaults ("/" and 200).
 */
export function monitorBody(v: MonitorValues): Omit<MonitorSpec, "type"> {
  return {
    name: v.name,
    delay: v.delay,
    timeout: v.timeout,
    max_retries: v.max_retries,
    max_retries_down: v.max_retries_down,
    admin_state_up: v.admin_state_up,
    ...httpCheckPart(v),
  };
}
