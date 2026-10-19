// Trove status wording (trove-dashboard databases/tables.py STATUS_CHOICES
// and STATUS_DISPLAY_CHOICES, plus the Nectar UPGRADE state).
import type { StatusTone } from "../../components/StatusPill/StatusPill";
import type { DbBackup, DbFlavor } from "../../lib/api/types";
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

/** Completed backups of one instance: the parents an incremental backup of
 * it can build on (trove-dashboard database_backups/workflows.py). */
export function parentBackups(
  backups: readonly DbBackup[],
  instanceId: string,
): DbBackup[] {
  return backups.filter(
    (b) => b.status === "COMPLETED" && b.instance_id === instanceId,
  );
}

/** The chosen parent when it still belongs to the instance, else "". */
export function validParentId(
  backups: readonly DbBackup[],
  instanceId: string,
  parentId: string,
): string {
  if (!parentId) return "";
  return parentBackups(backups, instanceId).some((b) => b.id === parentId)
    ? parentId
    : "";
}

export type ParameterKind = "boolean" | "integer" | "float" | "string";

/** The input a configuration parameter takes, from its spec type
 * (trove config_param_manager.py:155-186: integer and long are whole
 * numbers, float a number, boolean true or false, anything else text). */
export function parameterKind(type: string | null | undefined): ParameterKind {
  switch ((type ?? "").toLowerCase()) {
    case "boolean":
      return "boolean";
    case "integer":
    case "long":
      return "integer";
    case "float":
      return "float";
    default:
      return "string";
  }
}

/** The string the values endpoint takes for one parameter. */
export function parameterValue(
  kind: ParameterKind,
  values: { text: string; number?: number | undefined; flag: boolean },
): string {
  if (kind === "boolean") return values.flag ? "true" : "false";
  if (kind === "integer" || kind === "float")
    return String(values.number ?? "");
  return values.text.trim();
}

/** A Trove quota limit for display: a missing or negative limit (Trove's
 * -1) is unlimited, so no limit ever shows as "-1". */
export function quotaLimit(
  limit: number | null | undefined,
  format: (value: number) => string = String,
): string {
  if (limit === null || limit === undefined || limit < 0) return "Unlimited";
  return format(limit);
}
