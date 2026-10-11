// Reservation status wording and tones (warre-dashboard tables.py:200-240
// and the detail template's status boxes).
import type { StatusTone } from "../../components/StatusPill/StatusPill";
import type { Reservation, ReservationFlavor } from "../../lib/api/types";
import { formatMb, formatNumber } from "../../lib/format";

export function statusLabel(status: string): string {
  switch (status) {
    case "PENDING_CREATE":
      return "Pending";
    case "ALLOCATED":
      return "Allocated";
    case "ACTIVE":
      return "Active";
    case "COMPLETE":
      return "Complete";
    case "ERROR":
      return "Error";
    default:
      return status || "Unknown";
  }
}

export function statusTone(status: string): StatusTone {
  switch (status) {
    case "PENDING_CREATE":
      return "progress";
    case "ALLOCATED":
      return "info";
    case "ACTIVE":
      return "success";
    case "COMPLETE":
      return "neutral";
    case "ERROR":
      return "danger";
    default:
      return "neutral";
  }
}

export function isPending(reservation: Reservation): boolean {
  return reservation.status === "PENDING_CREATE";
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

/** The last whole day a free slot covers: a slot ending at midnight ends
 * on the previous day. */
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

export function slotFirstDay(start: string | null, today: string): string {
  if (!start) return today;
  const day = start.slice(0, 10);
  return day < today ? today : day;
}

/** Inclusive days between two ISO dates. */
export function daysBetween(start: string, end: string): number {
  const a = Date.UTC(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)) - 1,
    Number(start.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(end.slice(0, 4)),
    Number(end.slice(5, 7)) - 1,
    Number(end.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000) + 1;
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
    suEstimate = Math.round(flavor.rate * 24 * Math.max(days, 0) * 100) / 100;
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
export const LAUNCH_HELP =
  "https://support.ehelp.edu.au/support/solutions/articles/6000259638";
