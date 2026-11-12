import { defineConfig, devices } from "@playwright/test";
import type { HiveOptions } from "./e2e/options";
import { LIVE_SESSION } from "./e2e/live/session";

// End-to-end tests run against a production build with the API mocked in
// the browser by MSW (VITE_MOCK=1). The mock build goes to dist-mock so a
// mocked bundle can never be mistaken for the shipping one in dist/.
//
// Setting HIVE_LIVE_URL switches to the live project instead: the specs in
// e2e/live/ against a running Hive with a real backend (see the README's
// testing section).

/**
 * Hive's own port, so a run can never test another app's preview server.
 * `HIVE_E2E_PORT` moves it, for runs side by side in separate checkouts.
 */
const PORT = Number(process.env.HIVE_E2E_PORT ?? 4183);

const CI = Boolean(process.env.CI);
const LIVE_URL = process.env.HIVE_LIVE_URL;

const mockedProjects = [
  {
    name: "chromium",
    testIgnore: "live/**",
    use: { ...devices["Desktop Chrome"] },
  },
  {
    name: "mobile-chrome",
    testIgnore: "live/**",
    use: { ...devices["Pixel 5"] },
  },
];

const liveProjects = [
  {
    name: "live-login",
    testMatch: "live/login.setup.ts",
    use: { ...devices["Desktop Chrome"], clockStart: null },
  },
  {
    name: "live",
    testMatch: "live/*.spec.ts",
    dependencies: ["live-login"],
    use: {
      ...devices["Desktop Chrome"],
      clockStart: null,
      storageState: LIVE_SESSION,
    },
  },
  {
    name: "live-phone",
    testMatch: "live/smoke.spec.ts",
    dependencies: ["live-login"],
    use: {
      ...devices["Pixel 5"],
      clockStart: null,
      storageState: LIVE_SESSION,
    },
  },
];

export default defineConfig<HiveOptions>({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // A test that passes only on a retry still fails the CI run.
  failOnFlakyTests: CI,
  // Half the cores on CI as well (Playwright's local default): the
  // scaffold's single worker on CI made the 810-test run take 36 minutes
  // on the Jenkins agents. A race that a parallel run exposes is a test
  // bug to fix, never a reason to go back to one worker.
  workers: "50%",
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: LIVE_URL ?? `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // Toasts and dialogs settle instantly, so axe never samples a fade.
    reducedMotion: "reduce",
    // Dates and numbers render as for an Australian user on every machine.
    timezoneId: "Australia/Melbourne",
    locale: "en-AU",
  },
  projects: LIVE_URL ? liveProjects : mockedProjects,
  webServer: LIVE_URL
    ? undefined
    : {
        // Type-check first: a spec must not pass on code that cannot build.
        command: `tsc -b && VITE_MOCK=1 vite build --outDir dist-mock && vite preview --outDir dist-mock --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        // Always start our own server: whatever already answers on the port
        // may be a stale build.
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
