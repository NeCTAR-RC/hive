// Keeps the in-browser mocked API answering after a tab has sat idle.
//
// MSW's service worker remembers which tabs it mocks for in memory only.
// Chrome stops a service worker that has been idle for about 30 seconds;
// MSW's five-second keepalive normally prevents that, but a hidden tab's
// timers are throttled to about once a minute (and stop when Chrome freezes
// the tab), so the worker is stopped. The next request starts a fresh worker
// that knows no tabs and lets every /api request through to the dev
// server's proxy, where no backend answers: the page fails until a reload.
import { http, HttpResponse } from "msw";

/** The path the mocks answer to prove the worker still mocks this tab. */
export const WAKE_PATH = "/__mock/awake";

/** Answers the probe with 204; an unmocked request never gets one. */
export const wakeHandler = http.get(
  WAKE_PATH,
  () => new HttpResponse(null, { status: 204 }),
);

/**
 * Asks the worker whether it still mocks this tab and, when it does not,
 * restarts the mocking (MSW then registers the tab with the worker again).
 * Resolves true when it had to restart.
 */
export async function wakeMocks({
  probe,
  restart,
}: {
  /** Fetches `WAKE_PATH`; the dev server answers it with a page, not 204. */
  probe: () => Promise<Response>;
  restart: () => Promise<void>;
}): Promise<boolean> {
  const answer = await probe().catch(() => null);
  if (answer?.status === 204) return false;
  await restart();
  return true;
}
