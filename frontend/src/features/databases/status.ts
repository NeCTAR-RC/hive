// Trove status wording (trove-dashboard databases/tables.py STATUS_CHOICES
// and STATUS_DISPLAY_CHOICES, plus the Nectar UPGRADE state).
import type { StatusTone } from "../../components/StatusPill/StatusPill";
import type { DbFlavor } from "../../lib/api/types";
import { formatMb } from "../../lib/format";

export function statusTone(
  kind: "ok" | "error" | "transitional" | "warning" | "unknown",
): StatusTone {
  switch (kind) {
    case "ok":
      return "success";
    case "error":
      return "danger";
    case "transitional":
      return "progress";
    case "warning":
      return "warning";
    default:
      return "neutral";
  }
}

const LABELS: Record<string, string> = {
  ACTIVE: "Active",
  HEALTHY: "Healthy",
  BLOCKED: "Blocked",
  BUILD: "Building",
  FAILED: "Failed",
  REBOOT: "Rebooting",
  RESIZE: "Resizing",
  BACKUP: "Backing up",
  SHUTDOWN: "Shutdown",
  SHUTOFF: "Shut off",
  ERROR: "Error",
  RESTART_REQUIRED: "Restart required",
  UPGRADE: "Upgrading",
  COMPLETED: "Completed",
  RESTORED: "Restored",
  DELETE_FAILED: "Delete failed",
  BUILDING: "Building",
  NEW: "New",
  SAVING: "Saving",
  // guest log statuses (trove/guestagent/guest_log.py LogStatus)
  Restart_Required: "Restart required",
  Restart_Completed: "Restart completed",
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return LABELS[status] ?? status;
}

export function flavorLabel(flavor: DbFlavor): string {
  const parts = [
    flavor.vcpus ? `${flavor.vcpus} vCPU` : null,
    flavor.ram ? formatMb(flavor.ram) : null,
  ].filter(Boolean);
  return parts.length
    ? `${flavor.name} (${parts.join(", ")})`
    : (flavor.name ?? "");
}

export const CIDR_WARNING =
  "Allowing 0.0.0.0/0 may expose the database instance to the whole Internet. Restrict access to the networks that need it.";

export function hasOpenCidr(cidrs: string[]): boolean {
  return cidrs.some((c) => c.trim() === "0.0.0.0/0" || c.trim() === "::/0");
}

export function splitCidrs(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((c) => c.trim())
    .filter(Boolean);
}

export const CONNECTION_EXAMPLES: Record<string, (host: string) => string> = {
  mysql: (host) => `mysql -h ${host} -P 3306 -u <user> -p`,
  mariadb: (host) => `mysql -h ${host} -P 3306 -u <user> -p`,
  postgresql: (host) => `psql -h ${host} -p 5432 -U <user> <database>`,
};
