// The request body parts that the create wizard and the listener, pool and
// monitor dialogs share: a pool's session persistence, a listener's
// forwarded headers and timeouts, and an HTTP monitor's check.
import { offered } from "../../lib/api/offered";
import type { MonitorSpec, PoolSpec } from "../../lib/api/types/loadbalancers";
import { isHttpMonitor } from "./schemas";

/**
 * A pool's session persistence: null for "None" (which also clears it on
 * an update), otherwise its type, with the cookie name only for
 * APP_COOKIE.
 */
export function sessionPersistence(
  persistence: string,
  cookieName: string,
): PoolSpec["session_persistence"] {
  if (!persistence) return null;
  return {
    type: offered<SessionPersistenceType>(persistence),
    ...(persistence === "APP_COOKIE" ? { cookie_name: cookieName } : {}),
  };
}

type SessionPersistenceType = NonNullable<
  NonNullable<PoolSpec["session_persistence"]>["type"]
>;
type HttpMethod = NonNullable<MonitorSpec["http_method"]>;

/** The listener form's three forwarded-header switches. */
export interface ForwardedHeaders {
  xff: boolean;
  xfp: boolean;
  xfproto: boolean;
}

/**
 * The `insert_headers` part of a listener body: the forwarded headers on
 * HTTP and terminated HTTPS, and nothing on any other protocol, which
 * cannot carry them.
 */
export function insertHeadersPart(
  protocol: string,
  headers: ForwardedHeaders,
): { insert_headers?: Record<string, boolean> } {
  if (!["HTTP", "TERMINATED_HTTPS"].includes(protocol)) return {};
  return {
    insert_headers: {
      "X-Forwarded-For": headers.xff,
      "X-Forwarded-Port": headers.xfp,
      "X-Forwarded-Proto": headers.xfproto,
    },
  };
}

/** The listener form's four timeouts, in milliseconds. */
export interface ListenerTimeouts {
  timeout_client_data: number;
  timeout_member_connect: number;
  timeout_member_data: number;
  timeout_tcp_inspect: number;
}

/** Whether a listener of `protocol` has timeouts: every one but UDP and SCTP. */
export function hasTimeouts(protocol: string): boolean {
  return !["UDP", "SCTP"].includes(protocol);
}

/**
 * The timeouts part of a listener body: the four timeouts on a protocol
 * that has them, and nothing on UDP or SCTP.
 */
export function timeoutsPart(
  protocol: string,
  timeouts: ListenerTimeouts,
): Partial<ListenerTimeouts> {
  if (!hasTimeouts(protocol)) return {};
  return {
    timeout_client_data: timeouts.timeout_client_data,
    timeout_member_connect: timeouts.timeout_member_connect,
    timeout_member_data: timeouts.timeout_member_data,
    timeout_tcp_inspect: timeouts.timeout_tcp_inspect,
  };
}

/** The monitor form's HTTP check fields. */
export interface HttpCheck {
  type: string;
  http_method: string;
  url_path: string;
  expected_codes: string;
}

/**
 * The HTTP check part of a monitor body: for an HTTP or HTTPS monitor its
 * method, path and expected codes, a blank path or codes read as Octavia's
 * defaults ("/" and 200); nothing for any other type.
 */
export function httpCheckPart(
  check: HttpCheck,
): Pick<MonitorSpec, "http_method" | "url_path" | "expected_codes"> {
  if (!isHttpMonitor(check.type)) return {};
  return {
    http_method: offered<HttpMethod>(check.http_method),
    url_path: check.url_path || "/",
    expected_codes: check.expected_codes || "200",
  };
}
