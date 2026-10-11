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

export const ACCESS_TYPES = [
  { id: "ip", label: "IP address or network" },
  { id: "user", label: "User" },
  { id: "cert", label: "Certificate" },
  { id: "cephx", label: "CephX user" },
];

export const ACCESS_LEVELS = [
  { id: "rw", label: "Read and write" },
  { id: "ro", label: "Read only" },
];

export const SECURITY_SERVICE_TYPES = [
  { id: "active_directory", label: "Active Directory" },
  { id: "ldap", label: "LDAP" },
  { id: "kerberos", label: "Kerberos" },
];

export function formatMetadata(metadata: Record<string, string>): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}
