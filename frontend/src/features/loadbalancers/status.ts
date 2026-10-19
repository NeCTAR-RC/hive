// Status wording and tones for load balancers and their children
// (octavia-dashboard loadbalancers.service.js labels).
import type { StatusTone } from "../../components/StatusPill/StatusPill";
import { parseCidr, parseIp } from "../network/networks/subnetRules";

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

/** Listener default ports (listener.controller.js `protocolChange`, with
 * HTTPS as `hive.nectar.loadbalancer.DEFAULT_PORTS`). Other protocols have
 * no default: the user picks the port. */
export const DEFAULT_PORTS: Record<string, number> = {
  HTTP: 80,
  HTTPS: 443,
  TERMINATED_HTTPS: 443,
};

/** The listener port for `protocol`, stepped past ports already `used` on
 * the load balancer; undefined when the protocol has no default. */
export function defaultPort(
  protocol: string,
  used: number[],
): number | undefined {
  let port = DEFAULT_PORTS[protocol];
  if (port === undefined) return undefined;
  while (used.includes(port)) port += 1;
  return port;
}

/** A new member's port for a pool of `poolProtocol`: 80 for HTTP and
 * nothing otherwise (model.service.js `{HTTP: 80}[pool.protocol]`). */
export function memberDefaultPort(poolProtocol: string): number | undefined {
  return poolProtocol === "HTTP" ? 80 : undefined;
}

/** Help for the TERMINATED_HTTPS certificate field. The Angular wizard
 * lists the project's Barbican certificates and hides the protocol without
 * Barbican; Hive's options do not say whether Barbican is there, so the
 * protocol stays and the reference is typed in. */
export const TLS_REF_HELP =
  "Paste the Barbican reference (a URL ending in /containers/<id> or " +
  "/secrets/<id>) of the certificate and key to terminate TLS with. " +
  "Create it in the Key Manager (Barbican) first; this form cannot list " +
  "or upload certificates.";

export function poolProtocolFor(listenerProtocol: string): string {
  return listenerProtocol === "TERMINATED_HTTPS" ? "HTTP" : listenerProtocol;
}

/** Session persistence types a pool can use: Octavia accepts only
 * SOURCE_IP on UDP and SCTP pools, as the create wizard already offers. */
export function persistenceTypesFor(
  protocol: string | null | undefined,
  types: string[],
): string[] {
  return ["UDP", "SCTP"].includes(protocol ?? "")
    ? types.filter((t) => t === "SOURCE_IP")
    : types;
}

export const EXPECTED_CODES = /^\d+((\s*-\s*\d+)|(\s*,\s*\d+)+)?$/;
export const URL_PATH = /^((\/)|(\/[^/]+)+)$/;

/** An IPv4 or IPv6 address. */
export function isIp(value: string): boolean {
  return parseIp(value) !== null;
}

/** An IPv4 or IPv6 network with a prefix in range for its version. */
export function isCidr(value: string): boolean {
  return parseCidr(value) !== null;
}

/** Labels for the load-balancer chain steps the backend records. */
const CHAIN_STEPS: Record<string, string> = {
  listener: "creating the listener",
  pool: "creating the pool",
  member: "adding a member",
  delete_member: "removing a member",
  monitor: "creating the health monitor",
};

export function chainStepLabel(step: string | undefined): string {
  return (step && CHAIN_STEPS[step]) || "working";
}
