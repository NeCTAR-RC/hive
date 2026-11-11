// The L7 policy form (octavia-dashboard workflow/l7policy): its fields, the
// target each redirect action needs, and the request body its values become.
import { z } from "zod";
import { offered } from "../../../../lib/api/offered";
import type { L7PolicySpec } from "../../../../lib/api/types/loadbalancers";
import { maxLength } from "../../../../lib/validation";

/**
 * The policy's fields. A redirect names its target: an http or https URL or
 * prefix, or a pool.
 */
export const policySchema = z
  .object({
    name: maxLength(255),
    description: maxLength(255),
    action: z.string().min(1, "Choose an action"),
    redirect_url: z.string().trim(),
    redirect_pool_id: z.string(),
    redirect_prefix: z.string().trim(),
    position: z.number().int().min(1).optional(),
    admin_state_up: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (
      v.action === "REDIRECT_TO_URL" &&
      !/^https?:\/\//.test(v.redirect_url)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["redirect_url"],
        message: "Enter an http or https URL",
      });
    }
    if (v.action === "REDIRECT_TO_POOL" && !v.redirect_pool_id) {
      ctx.addIssue({
        code: "custom",
        path: ["redirect_pool_id"],
        message: "Choose a pool",
      });
    }
    if (
      v.action === "REDIRECT_PREFIX" &&
      !/^https?:\/\//.test(v.redirect_prefix)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["redirect_prefix"],
        message: "Enter an http or https prefix",
      });
    }
  });

export type PolicyValues = z.infer<typeof policySchema>;

/**
 * The create or update body: the name, description and position only when
 * set, and only the redirect target the chosen action uses.
 */
export function policyBody(v: PolicyValues): L7PolicySpec {
  return {
    action: offered<L7PolicySpec["action"]>(v.action),
    admin_state_up: v.admin_state_up,
    ...(v.name ? { name: v.name } : {}),
    ...(v.description ? { description: v.description } : {}),
    ...(v.position ? { position: v.position } : {}),
    ...(v.action === "REDIRECT_TO_URL" ? { redirect_url: v.redirect_url } : {}),
    ...(v.action === "REDIRECT_TO_POOL"
      ? { redirect_pool_id: v.redirect_pool_id }
      : {}),
    ...(v.action === "REDIRECT_PREFIX"
      ? { redirect_prefix: v.redirect_prefix }
      : {}),
  };
}
