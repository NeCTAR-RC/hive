/**
 * Form rules shared across features, each with Hive's own message, so a
 * field never shows the schema library's default wording ("Too big:
 * expected string to have <=255 characters"). A schema builds its text
 * limits here rather than calling zod's `.max(n)` bare.
 */
import { z } from "zod";

/** The message under a text field longer than `max` characters. */
export function tooLongMessage(max: number): string {
  return `Use ${max} characters or fewer`;
}

/**
 * A text field of at most `max` characters. The text is trimmed before the
 * count, as names and descriptions are sent trimmed; pass `trim: false`
 * where spaces are part of the value (a password).
 */
export function maxLength(
  max: number,
  { trim = true }: { trim?: boolean } = {},
) {
  const text = trim ? z.string().trim() : z.string();
  return text.max(max, tooLongMessage(max));
}
