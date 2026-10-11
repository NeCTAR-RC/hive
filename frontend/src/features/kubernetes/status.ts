// Cluster and node group status wording (Heat-style states as magnum-ui
// shows them) and the node label and taint text formats.
import type { StatusTone } from "../../components/StatusPill/StatusPill";
import type { Cluster, NodeTaint } from "../../lib/api/types";

export function isTransitional(status: string | null | undefined): boolean {
  return Boolean(status && status.endsWith("_IN_PROGRESS"));
}

export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return "neutral";
  if (status.endsWith("_IN_PROGRESS")) return "progress";
  if (status.endsWith("_FAILED")) return "danger";
  if (status === "DELETE_COMPLETE") return "neutral";
  if (status.endsWith("_COMPLETE")) return "success";
  return "neutral";
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  const [verb, state] = status.split("_");
  const verbs: Record<string, string> = {
    CREATE: "Create",
    UPDATE: "Update",
    DELETE: "Delete",
    ROLLBACK: "Rollback",
    RESUME: "Resume",
    RESTORE: "Restore",
    SNAPSHOT: "Snapshot",
    CHECK: "Check",
    ADOPT: "Adopt",
  };
  const states: Record<string, string> = {
    COMPLETE: "complete",
    FAILED: "failed",
    IN: "in progress",
  };
  return `${verbs[verb ?? ""] ?? verb} ${states[state ?? ""] ?? status}`.trim();
}

export function healthTone(health: string | null | undefined): StatusTone {
  switch (health) {
    case "HEALTHY":
      return "success";
    case "UNHEALTHY":
      return "danger";
    case "UNKNOWN":
      return "neutral";
    default:
      return "neutral";
  }
}

export function healthLabel(health: string | null | undefined): string {
  if (!health) return "Unknown";
  return health.charAt(0) + health.slice(1).toLowerCase();
}

export function healthReason(cluster: Cluster): string {
  const reason = cluster.health_status_reason;
  if (!reason) return "";
  if (typeof reason === "string") return reason;
  return Object.entries(reason)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
}

export function formatTaints(taints: NodeTaint[]): string {
  return taints
    .map((t) =>
      t.value ? `${t.key}=${t.value}:${t.effect}` : `${t.key}:${t.effect}`,
    )
    .join(",");
}

export function formatLabels(labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

export const LABELS_PATTERN =
  /^([^,=:\s]+=[^,=:\s]*)(\s*,\s*[^,=:\s]+=[^,=:\s]*)*$/;
export const TAINTS_PATTERN =
  /^([^,=:\s]+(=[^,=:\s]*)?:(NoSchedule|PreferNoSchedule|NoExecute))(\s*,\s*[^,=:\s]+(=[^,=:\s]*)?:(NoSchedule|PreferNoSchedule|NoExecute))*$/;
