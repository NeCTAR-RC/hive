// Every spec imports `test` and `expect` from here. The fixture:
// - blocks third-party hosts, so remote content (news images, the welcome
//   video, the help widget, the ARDC mega menu and footer) never enters the
//   test DOM or slows the run; the route is on the context, not the page,
//   because MSW's service worker fetches passthrough requests itself and
//   page.route never sees those;
// - starts the browser clock at one fixed instant, so seed data, relative
//   dates and "today" are the same on every run (the mocked API runs in the
//   page, so it shares that clock);
// - fails a test on an uncaught error in the page, and when the mocked API
//   reports a contract problem: an /api request no handler serves ("[MSW]")
//   or a request body the backend would reject ("[mock]", see
//   src/mocks/http.ts).
// It also holds the checks every page must pass and the controls for the
// mocked API (the cookies it reads).
import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";
import type { HiveOptions } from "./options";

/** The instant every mocked run starts at: 11:00 in Melbourne. */
export const E2E_NOW = new Date("2026-10-14T00:00:00Z");

/** Hosts whose content changes without notice; their requests are aborted. */
const THIRD_PARTY =
  /^https?:\/\/([^/]+\.)?(ardc\.edu\.au|youtube\.com|youtube-nocookie\.com|freshworks\.com|googletagmanager\.com|google-analytics\.com|object-store\.rc\.nectar\.org\.au)(:\d+)?\//;

/** Console errors the mocked API logs when a request breaks its contract. */
const MOCK_CONTRACT_ERROR = /^\[(MSW|mock)\]/;

export const test = base.extend<HiveOptions>({
  clockStart: [E2E_NOW, { option: true }],
  page: async ({ page, clockStart }, provide) => {
    await page.context().route(THIRD_PARTY, (route) => route.abort());
    if (clockStart) await page.clock.install({ time: clockStart });
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(`uncaught: ${error.message}`);
    });
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        MOCK_CONTRACT_ERROR.test(message.text())
      ) {
        errors.push(message.text());
      }
    });
    await provide(page);
    expect(errors, errors.join("\n")).toEqual([]);
  },
});

export { expect };

/** The longest a page is given to finish its transitions before axe runs. */
const SETTLE_MS = 2000;
/** How often the runner looks again while transitions are running. */
const SETTLE_STEP_MS = 50;

/**
 * Waits for the running CSS transitions and finite animations to end. A
 * button changing state fades its colours; sampled halfway, its text can
 * read as failing contrast although neither end state does. The wait is
 * paced from the runner, not inside the page: the suite installs a fake
 * clock there, so an in-page wait on an animation's `finished` promise can
 * stall. A page still animating after the bound is checked as it is.
 */
async function settleTransitions(page: Page) {
  const deadline = Date.now() + SETTLE_MS;
  while (Date.now() < deadline) {
    const running = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.playState === "running" &&
              animation.effect?.getComputedTiming().endTime !== Infinity,
          ).length,
    );
    if (running === 0) return;
    await new Promise((resolve) => setTimeout(resolve, SETTLE_STEP_MS));
  }
}

/**
 * Fail on serious or critical WCAG 2.1 A/AA findings, ignoring iframes, on
 * the page at rest.
 */
export async function expectNoSeriousA11yIssues(page: Page) {
  await settleTransitions(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("iframe")
    // React Aria's hidden live announcer copies announced markup into a
    // role="log" node; its img-role fragments reference ids outside it.
    .exclude("[data-live-announcer]")
    .analyze();
  const serious = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(
    serious,
    serious
      .map(
        (v) =>
          `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`,
      )
      .join("\n"),
  ).toEqual([]);
}

/**
 * Fail when the page is wider than its frame: the window, or one of the
 * layout's own scrolling columns (the content column and the sidebar,
 * marked with their scroll restoration ids), which would otherwise take a
 * too-wide page in a horizontal scroll of their own.
 */
export async function expectNoHorizontalScroll(page: Page) {
  const frames = await page.evaluate(() =>
    [
      document.scrollingElement,
      ...document.querySelectorAll("[data-scroll-restoration-id]"),
    ]
      .filter((frame) => frame !== null)
      .map((frame) => ({
        name: frame.getAttribute("data-scroll-restoration-id") ?? "the window",
        scrollWidth: frame.scrollWidth,
        clientWidth: frame.clientWidth,
      })),
  );
  for (const { name, scrollWidth, clientWidth } of frames) {
    expect(
      scrollWidth,
      `${name} must not scroll horizontally`,
    ).toBeLessThanOrEqual(clientWidth);
  }
}

/** How a forced failure ends: an HTTP status, or no response at all. */
export type Failure = number | "network";

/**
 * Sets a cookie the mocked API reads, on the app's origin. Cookies ignore
 * the port, so this works before or after the first navigation.
 */
async function setMockCookie(page: Page, name: string, value: string) {
  const baseURL = test.info().project.use.baseURL;
  if (!baseURL) throw new Error("the project needs a baseURL");
  await page.context().addCookies([{ name, value, url: baseURL }]);
}

/**
 * Makes the mocked API fail one request (method and exact path) for the
 * rest of the test, or until clearFailure: with `failure` as the HTTP
 * status in the backend's error envelope (message "the mock API refused
 * this request"), or with no response at all for "network".
 */
export async function failRequest(
  page: Page,
  method: string,
  path: string,
  failure: Failure = 409,
) {
  await setMockCookie(
    page,
    "hive_mock_fail",
    encodeURIComponent(`${method} ${path} ${failure}`),
  );
}

/** Lets the request failRequest named succeed again. */
export async function clearFailure(page: Page) {
  await page.context().clearCookies({ name: "hive_mock_fail" });
}

/**
 * Answers the built files whose URL matches `files` with a 404, as a
 * deploy that replaced them would, until the returned function restores
 * them. The mock service worker forwards the app's file requests, which
 * only a context route sees (the third-party block is one already).
 */
export async function failBuiltFiles(
  page: Page,
  files: RegExp,
): Promise<() => Promise<void>> {
  const context = page.context();
  await context.route(files, (route) => route.fulfill({ status: 404 }));
  return () => context.unroute(files);
}

/**
 * Switches the mocked API into a whole-session state: "anon" answers as
 * logged out, "me_down" as if Keystone were down, "helpdesk" as a user
 * with the user lookup capability.
 */
export async function setMockSession(
  page: Page,
  state: "anon" | "me_down" | "helpdesk",
) {
  await setMockCookie(page, "hive_mock", state);
}

/** Caps the instances list at `size` rows, as a long project's first page. */
export async function setInstancePageSize(page: Page, size: number) {
  await setMockCookie(page, "hive_mock_page_size", String(size));
}
