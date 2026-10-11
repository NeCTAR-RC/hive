// Every spec imports `test` and `expect` from here. The fixture blocks
// third-party hosts so remote content (news images, the welcome video, the
// help widget) never enters the test DOM or slows the run.
import { test as base, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BLOCKED = [
  "ardc.edu.au",
  "youtube.com",
  "youtube-nocookie.com",
  "freshworks.com",
  "googletagmanager.com",
  "google-analytics.com",
  "object-store.rc.nectar.org.au",
];

export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.route("**/*", (route) => {
      const host = new URL(route.request().url()).hostname;
      if (BLOCKED.some((blocked) => host.endsWith(blocked))) {
        return route.abort();
      }
      return route.continue();
    });
    await provide(page);
  },
});

export { expect };

/** Fail on serious or critical WCAG 2.1 A/AA findings, ignoring iframes. */
export async function expectNoSeriousA11yIssues(
  page: Parameters<typeof AxeBuilder>[0] extends { page: infer P } ? P : never,
) {
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

export async function expectNoHorizontalScroll(
  page: Parameters<typeof expectNoSeriousA11yIssues>[0],
) {
  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.scrollingElement?.scrollWidth ?? 0,
    document.scrollingElement?.clientWidth ?? 0,
  ]);
  expect(scrollWidth, "page must not scroll horizontally").toBeLessThanOrEqual(
    clientWidth,
  );
}
