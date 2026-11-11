// Logs in once for the whole live run, the way manuka does: the one-shot
// page (HIVE_LIVE_LOGIN_URL, from `make login`) posts the token to Hive's
// receiver. With HIVE_LIVE_PROJECT set, it then switches to that project.
// The session is saved for every live spec (see playwright.config.ts).
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { getJson } from "./api";
import { LIVE_SESSION } from "./session";

interface MeProjects {
  projects: { id: string; name: string }[];
}

/** The one-shot login URL; it works once, so each run needs a fresh one. */
function oneShotUrl(): string {
  const url = process.env.HIVE_LIVE_LOGIN_URL;
  if (!url) throw new Error("set HIVE_LIVE_LOGIN_URL to a one-shot URL");
  return url;
}

/** Switches to the project HIVE_LIVE_PROJECT names, when it names one. */
async function switchToLiveProject(page: Page) {
  const name = process.env.HIVE_LIVE_PROJECT;
  if (!name) return;
  const me = await getJson<MeProjects>(page, "/api/me");
  const target = me.projects.find((project) => project.name === name);
  if (!target) throw new Error(`project ${name} is not available`);
  await page.goto(`/auth/switch/${target.id}`);
  await expect(page).toHaveURL(/\/$/);
}

test("log in through the one-shot page", async ({ page, baseURL }) => {
  await page.goto(oneShotUrl());
  await page.waitForURL((url) => url.origin === new URL(baseURL ?? "").origin);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await switchToLiveProject(page);
  await page.context().storageState({ path: LIVE_SESSION });
});
