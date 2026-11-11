// The schema of a key and value list (metadata, properties), shared by
// every form that edits one so the rules cannot drift between them.
import { z } from "zod";
import { maxLength } from "../../lib/validation";

/**
 * Key and value rows with Nova's 255-character limits. Keys must be unique:
 * the rows become an object, where a repeated key would silently keep only
 * the last value.
 */
export const keyValueSchema = z
  .array(
    z.object({
      key: maxLength(255).min(1, "Enter a key"),
      value: maxLength(255, { trim: false }),
    }),
  )
  .refine(
    (entries) => new Set(entries.map((e) => e.key)).size === entries.length,
    { message: "Keys must be unique" },
  );

export type KeyValueEntry = z.infer<typeof keyValueSchema>[number];

/** The rows as the object the API takes. */
export function keyValueRecord(
  entries: KeyValueEntry[],
): Record<string, string> {
  return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
}
