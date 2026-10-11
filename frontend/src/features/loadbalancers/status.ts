// Status wording and tones for load balancers and their children
// (octavia-dashboard loadbalancers.service.js labels).
import type { StatusTone } from "../../components/StatusPill/StatusPill";

export function provisioningTone(
  status: string | null | undefined,
): StatusTone {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "PENDING_CREATE":
    case "PENDING_UPDATE":
    case "PENDING_DELETE":
      return "progress";
    case "ERROR":
      return "danger";
    case "INACTIVE":
      return "neutral";
    default:
      return "neutral";
  }
}

export function provisioningLabel(status: string | null | undefined): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "INACTIVE":
      return "Inactive";
    case "PENDING_CREATE":
      return "Creating";
    case "PENDING_UPDATE":
      return "Updating";
    case "PENDING_DELETE":
      return "Deleting";
    case "ERROR":
      return "Error";
    default:
      return status ?? "Unknown";
  }
}

export function operatingTone(status: string | null | undefined): StatusTone {
  switch (status) {
    case "ONLINE":
      return "success";
    case "DEGRADED":
    case "DRAINING":
      return "warning";
    case "ERROR":
    case "OFFLINE":
      return "danger";
    case "NO_MONITOR":
      return "neutral";
    default:
      return "neutral";
  }
}

export function operatingLabel(status: string | null | undefined): string {
  switch (status) {
    case "ONLINE":
      return "Online";
    case "DRAINING":
      return "Draining";
    case "OFFLINE":
      return "Offline";
    case "DEGRADED":
      return "Degraded";
    case "ERROR":
      return "Error";
    case "NO_MONITOR":
      return "No monitor";
    default:
      return status ?? "Unknown";
  }
}

export function isPending(status: string | null | undefined): boolean {
  return Boolean(status && status.startsWith("PENDING_"));
}

export const DEFAULT_PORTS: Record<string, number> = {
  HTTP: 80,
  HTTPS: 443,
  TERMINATED_HTTPS: 443,
};

export function defaultPort(protocol: string, used: number[]): number {
  let port = DEFAULT_PORTS[protocol] ?? 80;
  while (used.includes(port)) port += 1;
  return port;
}

export function poolProtocolFor(listenerProtocol: string): string {
  return listenerProtocol === "TERMINATED_HTTPS" ? "HTTP" : listenerProtocol;
}

export const EXPECTED_CODES = /^\d+((\s*-\s*\d+)|(\s*,\s*\d+)+)?$/;
export const URL_PATH = /^((\/)|(\/[^/]+)+)$/;
export const CIDR = /^([0-9a-fA-F.:]+)\/\d{1,3}$/;
export const IP = /^([0-9.]+|[0-9a-fA-F:]+)$/;
