// Pure rules of the reserve dialog: reading its ISO dates and checking the
// chosen dates against the flavour and the project's limits.
import { parseDate, type CalendarDate } from "@internationalized/date";
import { z } from "zod";
import type {
  ReservationFlavor,
  ReservationOptions,
} from "../../../lib/api/types/reservations";
import { spanDays } from "../gantt";
import { eligibility } from "../status";

/**
 * An ISO date ("YYYY-MM-DD") as the date pickers' calendar date; null when
 * the value is missing or not a valid date.
 */
export function safeDate(
  value: string | null | undefined,
): CalendarDate | null {
  if (!value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

/** The dates a reservation runs from and to, ISO dates ("" when unset). */
export const reserveFields = z.object({ start: z.string(), end: z.string() });

export type ReserveForm = z.infer<typeof reserveFields>;

/**
 * The days the dates span (0 until both are set) and whether the project
 * may reserve the flavour for them.
 */
export function checkDates(
  { start, end }: ReserveForm,
  flavor: ReservationFlavor,
  options: ReservationOptions,
) {
  const days = start && end ? spanDays(start, end) : 0;
  const check = eligibility(
    days,
    options.limits.days_left,
    flavor,
    options.su_used,
    options.su_budget,
  );
  return { days, check };
}

/** The reserve schema for one flavour: the dates must be eligible. */
export function reserveSchema(
  flavor: ReservationFlavor,
  options: ReservationOptions,
) {
  return reserveFields.superRefine((values, ctx) => {
    const { check } = checkDates(values, flavor, options);
    if (!check.eligible) {
      ctx.addIssue({
        code: "custom",
        path: ["end"],
        message: check.reasons.join(" "),
      });
    }
  });
}
