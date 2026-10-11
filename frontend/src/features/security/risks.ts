// Grouping and wording for the Security Risks page and the home alert
// (varroa-dashboard security/index.html, dashboard-home.js:360-375).
import type { SecurityRisk } from "../../lib/api/types";

export const SECURITY_HELP =
  "https://support.ehelp.edu.au/support/solutions/articles/6000277030";

export interface RiskGroup {
  resourceId: string;
  resourceType: string;
  risks: SecurityRisk[];
}

/** Risks grouped per resource, sorted by resource id as Horizon lists them. */
export function groupRisks(risks: SecurityRisk[]): RiskGroup[] {
  const groups = new Map<string, RiskGroup>();
  for (const risk of [...risks].sort((a, b) =>
    a.resource_id.localeCompare(b.resource_id),
  )) {
    const group = groups.get(risk.resource_id) ?? {
      resourceId: risk.resource_id,
      resourceType: risk.resource_type,
      risks: [],
    };
    group.risks.push(risk);
    groups.set(risk.resource_id, group);
  }
  return [...groups.values()];
}

/** Green at zero, amber for one or two, red from three. */
export function riskTone(count: number): "success" | "warning" | "danger" {
  if (count === 0) return "success";
  return count >= 3 ? "danger" : "warning";
}

export function riskName(risk: SecurityRisk): string {
  return risk.type?.display_name || risk.type?.name || "Security risk";
}
