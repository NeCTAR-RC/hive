// The key pair name rules both key pair dialogs share.
import { maxLength } from "../../../../lib/validation";

/** A key pair name as Nova accepts it. */
export const keyPairNameSchema = maxLength(255)
  .min(1, "Enter a name")
  .regex(
    /^[\w.\- ]+$/,
    "Letters, numbers, spaces, dots, dashes and underscores only",
  );

/**
 * A key pair name that no key pair in `existing` has, so a duplicate is
 * caught before the request (Nova would refuse it with a conflict).
 */
export function newKeyPairNameSchema(existing: readonly string[]) {
  return keyPairNameSchema.refine((name) => !existing.includes(name), {
    message: "A key pair with this name already exists",
  });
}
