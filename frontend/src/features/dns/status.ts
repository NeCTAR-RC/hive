// Designate status wording and the per-type record hints the dashboard
// shows on the record set form.
import type { StatusTone } from "../../components/StatusPill/StatusPill";

export function statusTone(status: string | null | undefined): StatusTone {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "PENDING":
      return "progress";
    case "ERROR":
      return "danger";
    default:
      return "neutral";
  }
}

export function statusLabel(
  status: string | null | undefined,
  action?: string | null,
): string {
  if (!status) return "Unknown";
  const word = status.charAt(0) + status.slice(1).toLowerCase();
  if (status === "PENDING" && action && action !== "NONE") {
    return `${word} (${action.toLowerCase()})`;
  }
  return word;
}

export const RECORD_HINTS: Record<string, string> = {
  A: "An IPv4 address, such as 203.0.113.10",
  AAAA: "An IPv6 address, such as 2001:db8::10",
  CNAME: "A canonical name ending with a dot, such as www.example.com.",
  MX: "Priority and mail host, such as 10 mail.example.com.",
  NS: "A name server ending with a dot, such as ns1.example.com.",
  PTR: "A host name ending with a dot",
  SPF: "An SPF policy, such as v=spf1 -all",
  SRV: "Priority, weight, port and target, such as 10 5 5060 sip.example.com.",
  SSHFP: "Algorithm, type and fingerprint, such as 1 1 <hex>",
  TXT: "Free text; quotes are added for you",
  CAA: 'Flags, tag and value, such as 0 issue "letsencrypt.org"',
};

export const ZONE_TYPES = [
  { id: "PRIMARY", label: "Primary" },
  { id: "SECONDARY", label: "Secondary" },
];
