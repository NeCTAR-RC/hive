// Manila status wording (manila-ui shares/tables.py STATUS_CHOICES).
import type { StatusTone } from "../../components/StatusPill/StatusPill";

const TRANSITIONAL = [
  "creating",
  "deleting",
  "reverting",
  "migrating",
  "migrating_to",
  "extending",
  "shrinking",
];

export function statusTone(status: string | null | undefined): StatusTone {
  const value = (status ?? "").toLowerCase();
  if (!value) return "neutral";
  if (TRANSITIONAL.includes(value)) return "progress";
  if (value === "available" || value === "in-use") return "success";
  if (value.includes("error")) return "danger";
  return "neutral";
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  const words = status.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function ruleStateTone(state: string | null | undefined): StatusTone {
  switch (state) {
    case "active":
      return "success";
    case "error":
      return "danger";
    case "queued_to_apply":
    case "applying":
    case "queued_to_deny":
    case "denying":
      return "progress";
    default:
      return "neutral";
  }
}

// Labels for the option ids the backend serves (`/api/shares/options`
// `access_types`, `access_levels` and `security_service_types`, from
// hive.nectar.shares). The lists themselves come from the backend; an id
// without a label here is shown as it is.
const ACCESS_TYPE_LABELS: Record<string, string> = {
  ip: "IP address or network",
  user: "User",
  cert: "Certificate",
  cephx: "CephX user",
};

const ACCESS_LEVEL_LABELS: Record<string, string> = {
  rw: "Read and write",
  ro: "Read only",
};

const SECURITY_SERVICE_TYPE_LABELS: Record<string, string> = {
  active_directory: "Active Directory",
  ldap: "LDAP",
  kerberos: "Kerberos",
};

function labelled(ids: string[], labels: Record<string, string>) {
  return ids.map((id) => ({ id, label: labels[id] ?? id }));
}

export const accessTypeOptions = (ids: string[]) =>
  labelled(ids, ACCESS_TYPE_LABELS);
export const accessLevelOptions = (ids: string[]) =>
  labelled(ids, ACCESS_LEVEL_LABELS);
export const securityServiceTypeOptions = (ids: string[]) =>
  labelled(ids, SECURITY_SERVICE_TYPE_LABELS);

/** The access type a new rule starts on: CephFS shares take CephX users,
 * everything else an IP rule (manila-ui shares/forms.py AddRule). */
export function defaultAccessType(protocol: string | null | undefined) {
  return (protocol ?? "").toUpperCase() === "CEPHFS" ? "cephx" : "ip";
}

export function formatMetadata(metadata: Record<string, string>): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

/**
 * The text a share deletion asks the user to type, the same on the list
 * and the detail page: the share's name (or id) for one share, and
 * "delete N shares" for several. Deleting a share loses its data.
 */
export function shareDeleteConfirmText(
  shares: { id: string; name: string | null }[],
): string {
  if (shares.length === 1) return shares[0]?.name || shares[0]?.id || "";
  return `delete ${shares.length} shares`;
}
