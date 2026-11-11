// The form field rule the network dialogs share across panels.
import { maxLength } from "../../lib/validation";

/** A name or description: trimmed, at most neutron's 255 characters. */
export const NAME = maxLength(255);
