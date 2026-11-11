// Reservation status wording and tones (warre-dashboard tables.py:200-240
// and the detail template's status boxes), and the row action rules.
import { offerActions, type ActionTable } from "../../lib/actions";
import type {
  Reservation,
  ReservationAction,
  ReservationFlavor,
} from "../../lib/api/types/reservations";
import { formatMb, formatNumber } from "../../lib/format";
import { defineStatus } from "../../lib/status";

const readers = defineStatus({
  transitional: ["PENDING_CREATE"],
  success: ["ACTIVE"],
  info: ["ALLOCATED"],
  danger: ["ERROR"],
  labels: {
    PENDING_CREATE: "Pending",
    ALLOCATED: "Allocated",
    ACTIVE: "Active",
    COMPLETE: "Complete",
    ERROR: "Error",
  },
  unlisted: "as-is",
});

export const statusLabel = readers.label;
export const statusTone = readers.tone;

/** Whether Blazar is still creating the reservation, so it polls. */
export function isPending(reservation: Reservation): boolean {
  return readers.isTransitional(reservation.status);
}

/** A check on the actions the backend allows the reservation now. */
function backendAllows(action: ReservationAction, reason: string) {
  return (reservation: Reservation) =>
    !reservation.actions.includes(action) && reason;
}

/**
 * The reservation menu (warre-dashboard tables.py row actions); the
 * backend works out from the status which of them the reservation allows.
 */
const RESERVATION_ACTIONS: ActionTable<ReservationAction, Reservation> = {
  rules: [
    {
      id: "launch",
      label: "Launch instance",
      checks: [backendAllows("launch", "The reservation is not active yet")],
    },
    {
      id: "extend",
      label: "Extend reservation",
      checks: [
        backendAllows(
          "extend",
          "Only active reservations with days left can be extended",
        ),
      ],
    },
    {
      id: "calendar",
      label: "Add to calendar (.ics)",
      checks: [
        backendAllows(
          "calendar",
          "Only allocated or active reservations have a calendar entry",
        ),
      ],
    },
    {
      id: "delete",
      label: "Delete reservation",
      tone: "danger",
      checks: [
        backendAllows(
          "delete",
          "A reservation still being created cannot be deleted",
        ),
      ],
    },
  ],
};

/** The reservation's menu, every action with its availability. */
export function availableReservationActions(reservation: Reservation) {
  return offerActions(RESERVATION_ACTIONS, reservation);
}

/** "64 VCPUs, 48 GB RAM" as the flavour popover shows it. */
export function flavorSize(flavor: ReservationFlavor): string {
  const parts: string[] = [];
  if (flavor.vcpu !== null) {
    parts.push(`${flavor.vcpu} ${flavor.vcpu === 1 ? "VCPU" : "VCPUs"}`);
  }
  if (flavor.memory_mb !== null)
    parts.push(`${formatMb(flavor.memory_mb)} RAM`);
  return parts.join(", ");
}

/** "30 GB + 200 GB ephemeral" or "30 GB" (tables.py:177-193). */
export function flavorDisk(flavor: ReservationFlavor): string {
  if (flavor.disk_gb === null) return "";
  const disk = `${formatNumber(flavor.disk_gb)} GB`;
  if (flavor.ephemeral_gb) {
    return `${disk} + ${formatNumber(flavor.ephemeral_gb)} GB ephemeral`;
  }
  return disk;
}

/** "0.9 SU/hour" or "Free" (nectar_reservations.js:125-140). */
export function flavorRate(flavor: ReservationFlavor): string {
  if (!flavor.rate) return "Free";
  return `${formatNumber(flavor.rate)} SU/hour`;
}

/** The last day a maintenance window covers: a window ending at midnight
 * ends on the previous day. (Free slots come from the backend with the
 * days they can be reserved for already worked out.) */
export function slotLastDay(end: string | null): string | null {
  if (!end) return null;
  const date = new Date(end);
  if (Number.isNaN(date.getTime())) return null;
  if (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0
  ) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}

export interface Eligibility {
  eligible: boolean;
  reasons: string[];
  maxDays: number;
  suEstimate: number | null;
}

/** The browser-side mirror of the backend check, so the dialog can say
 * why before the user submits (nectar_reservations.js:581-620). */
export function eligibility(
  days: number,
  daysLeft: number | null,
  flavor: ReservationFlavor,
  suUsed: number | null,
  suBudget: number | null,
): Eligibility {
  const maxDays =
    daysLeft === null ? flavor.max_days : Math.min(daysLeft, flavor.max_days);
  const reasons: string[] = [];
  if (days <= 0) {
    reasons.push("Choose at least one day.");
  } else if (days > maxDays) {
    reasons.push(
      `This flavour can be reserved for at most ${maxDays} ${maxDays === 1 ? "day" : "days"} with your project's remaining limit.`,
    );
  }
  let suEstimate: number | null = null;
  if (flavor.rate) {
    suEstimate = estimateSu(flavor.rate, days);
    if (
      suBudget !== null &&
      suBudget !== -1 &&
      suBudget > 0 &&
      (suEstimate + (suUsed ?? 0)) / suBudget > 1
    ) {
      reasons.push(
        "The number of selected days exceeds your project's usage limit. If you require more, please amend your allocation.",
      );
    }
  }
  return { eligible: reasons.length === 0, reasons, maxDays, suEstimate };
}

export const RESERVATIONS_HELP =
  "https://support.ehelp.edu.au/support/solutions/articles/6000258960";
/** The feedback form linked from every reservation page (_feedback.html). */
export const FEEDBACK_FORM =
  "https://docs.google.com/forms/d/e/1FAIpQLSddgKesBdril36Xk-VkVF4ejazbUM5i82DelJDQbNCt1d9IWg/viewform";
export const LAUNCH_HELP =
  "https://support.ehelp.edu.au/support/solutions/articles/6000259638";

/**
 * The service units a reservation of `days` whole days costs at `rate` SU
 * per hour, to two decimal places. Negative day counts cost nothing.
 */
export function estimateSu(rate: number, days: number): number {
  return Math.round(rate * 24 * Math.max(days, 0) * 100) / 100;
}
