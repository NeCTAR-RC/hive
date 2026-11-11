// The request bodies the mocked orchestration endpoints accept, each tied to
// the frontend's request type so the two cannot drift apart unnoticed.
import { z } from "zod";
import type {
  StackActionRequest,
  StackCreateRequest,
  TemplateSource,
} from "../../lib/api/types/orchestration";

const templateSource = z.object({
  template: z.string().optional(),
  template_url: z.string().optional(),
  environment: z.string().optional(),
  files: z.record(z.string(), z.string()).optional(),
}) satisfies z.ZodType<TemplateSource>;

export const validateTemplateBody = templateSource;

export const stackCreateBody = templateSource.extend({
  name: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()),
  timeout_mins: z.number().int().min(1),
  rollback: z.boolean(),
  tags: z.array(z.string()).optional(),
}) satisfies z.ZodType<StackCreateRequest>;

/** A stack action: its name alone, as the backend's `StackAction`. */
export const stackActionBody = z.strictObject({
  action: z.enum(["suspend", "resume", "check", "cancel_update"]),
}) satisfies z.ZodType<StackActionRequest>;
