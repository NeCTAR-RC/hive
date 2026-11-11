// Direct calls to the live Hive backend for setup and cleanup around the
// browser steps: looking up ids, waiting for the cloud to finish, and
// removing scratch resources whatever happened in the test. They share the
// browser's session cookies and send the CSRF header the backend expects.
import { expect, type Page } from "@playwright/test";

/** Names every scratch resource a live run creates, so leftovers are found. */
export const SCRATCH_PREFIX = "hive-smoke-";

/** A scratch name unique to this run. */
export function scratchName(): string {
  return `${SCRATCH_PREFIX}${Date.now().toString(36)}`;
}

async function csrfHeader(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((cookie) => cookie.name === "hive_csrf");
  return { "X-CSRF-Token": csrf?.value ?? "" };
}

/** GETs `path` and returns its JSON, failing the test on an error status. */
export async function getJson<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(path);
  expect(response.status(), `GET ${path}`).toBeLessThan(400);
  return (await response.json()) as T;
}

/** POSTs `body` as JSON to `path` and returns the response's JSON. */
export async function postJson<T>(
  page: Page,
  path: string,
  body: unknown,
): Promise<T> {
  const response = await page.request.post(path, {
    data: body,
    headers: await csrfHeader(page),
  });
  expect(response.status(), `POST ${path}`).toBeLessThan(400);
  return (await response.json()) as T;
}

/** DELETEs `path`; cleanup tolerates a resource that is already gone. */
export async function remove(page: Page, path: string): Promise<void> {
  await page.request.delete(path, { headers: await csrfHeader(page) });
}

/**
 * Polls `path` until `done` holds for its JSON, as the cloud finishes a
 * change (a stack, a share, a record set).
 */
export async function waitUntil<T>(
  page: Page,
  path: string,
  done: (body: T) => boolean,
  timeoutMs = 300_000,
): Promise<T> {
  let last: T | undefined;
  await expect
    .poll(
      async () => {
        last = await getJson<T>(page, path);
        return done(last);
      },
      { timeout: timeoutMs, intervals: [5000] },
    )
    .toBe(true);
  return last as T;
}
