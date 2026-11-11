// Forced failures, so end-to-end tests can drive the error paths the happy
// mocks never reach. The e2e helper `failRequest` (e2e/fixtures.ts) sets the
// cookie; the handler here runs before every domain's handlers.
import { http, HttpResponse } from "msw";
import { apiError } from "./http";

export const FAULT_COOKIE = "hive_mock_fail";

/** How a forced failure ends: an HTTP status, or no response at all. */
export type FaultOutcome = number | "network";

export interface Fault {
  method: string;
  path: string;
  outcome: FaultOutcome;
}

/** The backend's error code for each status (backend/hive/errors.py). */
const ERROR_CODES: Record<number, string> = {
  400: "bad_request",
  401: "session_expired",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  413: "payload_too_large",
  429: "rate_limited",
  501: "service_not_enabled",
  502: "upstream_error",
  504: "upstream_timeout",
};

/**
 * Reads a fault cookie of "<METHOD> <path> [<status>|network]". Without an
 * outcome the request fails with a 409, the backend's answer to a request
 * the cloud refuses.
 */
export function parseFault(rule: string | undefined): Fault | null {
  if (!rule) return null;
  const [method, path, outcome = "409"] = decodeURIComponent(rule).split(" ");
  if (!method || !path) return null;
  return {
    method,
    path,
    outcome: outcome === "network" ? "network" : Number(outcome),
  };
}

/** What the mocked backend answers instead of the real handler. */
export function faultResponse(outcome: FaultOutcome): Response {
  if (outcome === "network") return HttpResponse.error();
  return apiError(
    outcome,
    ERROR_CODES[outcome] ?? "internal_error",
    "the mock API refused this request",
  );
}

/** Answers a request the fault cookie names; passes every other one on. */
export const faultHandler = http.all("/api/*", ({ request, cookies }) => {
  const fault = parseFault(cookies[FAULT_COOKIE]);
  if (
    !fault ||
    fault.method !== request.method ||
    fault.path !== new URL(request.url).pathname
  ) {
    return undefined;
  }
  return faultResponse(fault.outcome);
});
