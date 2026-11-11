// Pure rules of the home page's outage notices: which outages raise an
// alert, in which tone, and the detail line under an announcement.
import type { Outage } from "../../lib/api/types/home";
import { formatDate } from "../../lib/format";

/**
 * The alert tone of an outage still under way or coming: danger from
 * severity 3, warning at severity 2. An ended or cancelled outage, or one of
 * lower severity, raises no alert.
 */
export function outageTone(outage: Outage): "warning" | "danger" | null {
  if (outage.end || outage.cancelled) return null;
  if (outage.severity >= 3) return "danger";
  if (outage.severity === 2) return "warning";
  return null;
}

/**
 * The outages that raise an alert, each with its tone, in the feed's order.
 */
export function outageAlerts(
  outages: readonly Outage[],
): { outage: Outage; tone: "warning" | "danger" }[] {
  return outages.flatMap((outage) => {
    const tone = outageTone(outage);
    return tone ? [{ outage, tone }] : [];
  });
}

/**
 * An announcement's detail line: its schedule, status and start date, the
 * missing ones left out, joined by " | "; empty when all are missing.
 */
export function outageMeta(outage: Outage): string {
  return [
    outage.scheduled_display,
    outage.status_display,
    formatDate(outage.start),
  ]
    .filter(Boolean)
    .join(" | ");
}
