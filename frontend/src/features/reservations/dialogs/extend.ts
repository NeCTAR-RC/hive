// Pure rules of the extend dialog: the new end date against the window the
// backend offers.
import { formatCalendarDate } from "../../../lib/format";

/** The days an extension may end on; all ISO dates ("2026-10-20"). */
export interface ExtendBounds {
  /** The reservation's last day now, in UTC. */
  currentEnd: string | undefined;
  /** The earliest allowed end, when the window has loaded. */
  minEnd: string | null | undefined;
  /** The latest allowed end, when the window has loaded. */
  maxEnd: string | null | undefined;
}

/**
 * Why `end` cannot be the reservation's new last day, or null when it can:
 * it must be a day after the current end and inside the window. A date
 * typed past the window is not stopped by the date picker, which only marks
 * it, so the form checks it here; the backend refuses it with 400 as well.
 */
export function extendError(
  end: string,
  { currentEnd, minEnd, maxEnd }: ExtendBounds,
): string | null {
  if (!end) return "Choose a new end date";
  if (currentEnd && end <= currentEnd) {
    return "Choose a day after the current end";
  }
  if ((minEnd && end < minEnd) || (maxEnd && end > maxEnd)) {
    if (minEnd && maxEnd) {
      return `Choose a date from ${formatCalendarDate(minEnd)} to ${formatCalendarDate(maxEnd)}`;
    }
    return maxEnd
      ? `Choose a date up to ${formatCalendarDate(maxEnd)}`
      : `Choose ${formatCalendarDate(minEnd)} or a later date`;
  }
  return null;
}
