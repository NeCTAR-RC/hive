// The name and description form that the share group edit, share group
// snapshot create and share group snapshot edit dialogs share.
import { z } from "zod";
import { maxLength } from "../../../../lib/validation";

/** A required name and an optional description, each up to 255 characters. */
export const nameSchema = z.object({
  name: maxLength(255).min(1, "Enter a name"),
  description: maxLength(255),
});
