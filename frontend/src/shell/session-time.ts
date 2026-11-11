import type { Me } from "../lib/api/types/session";

/** How long before the session ends the warning shows, in seconds. */
export const WARN_BEFORE_S = 10 * 60;

/**
 * Seconds until the session ends, by the server's clock. `server_time` is
 * the server's clock when /api/me answered and `receivedAtMs` the browser's
 * clock then, so only time elapsed in the browser counts: a browser clock
 * that is minutes fast or slow does not move the warning.
 */
export function secondsLeft(
  session: Me["session"],
  receivedAtMs: number,
  nowMs: number,
): number {
  const elapsedS = Math.max(0, nowMs - receivedAtMs) / 1000;
  return Math.round(session.expires_at - session.server_time - elapsedS);
}

/**
 * The whole minutes the warning names (at least one), or null while the
 * session has longer than WARN_BEFORE_S to run.
 */
export function warningMinutes(secondsLeft: number): number | null {
  if (secondsLeft > WARN_BEFORE_S) return null;
  return Math.max(1, Math.round(secondsLeft / 60));
}
