// The TTL field of the zone and record set dialogs.
import { z } from "zod";

const TTL_MESSAGE = "Enter a whole number of seconds";

/**
 * A TTL as the dialogs take it: a whole number of seconds, or blank
 * (`undefined`, what the number field reports when cleared). Every way a
 * value can be wrong gets the one message, rather than zod's wording.
 */
export const ttlSeconds = z
  .number(TTL_MESSAGE)
  .int(TTL_MESSAGE)
  .min(0, TTL_MESSAGE)
  .optional();
