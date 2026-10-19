// Cluster and node group status wording (Heat-style states as magnum-ui
// shows them) and the node label and taint text formats.
import type { StatusTone } from "../../components/StatusPill/StatusPill";
import type { Cluster, ClusterOptions, NodeTaint } from "../../lib/api/types";

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

// The create-cluster cascade (magnum-ui Nectar workflow.service.js): the
// Kubernetes version narrows the availability zones, the two narrow the
// network drivers, and the three name exactly one template.

export function zonesFor(
  options: ClusterOptions | undefined,
  version: string,
): string[] {
  return [
    ...new Set(
      (options?.combinations ?? [])
        .filter((c) => c.kubernetes_version === version)
        .map((c) => c.availability_zone),
    ),
  ].sort();
}

export function driversFor(
  options: ClusterOptions | undefined,
  version: string,
  zone: string,
): string[] {
  return [
    ...new Set(
      (options?.combinations ?? [])
        .filter(
          (c) =>
            c.kubernetes_version === version && c.availability_zone === zone,
        )
        .map((c) => c.network_driver),
    ),
  ].sort();
}

export function templateFor(
  options: ClusterOptions | undefined,
  version: string,
  zone: string,
  driver: string,
) {
  const combination = options?.combinations.find(
    (c) =>
      c.kubernetes_version === version &&
      c.availability_zone === zone &&
      c.network_driver === driver,
  );
  return combination
    ? options?.templates.find((t) => t.id === combination.template_id)
    : undefined;
}
