#!/usr/bin/env node
// Log in the way manuka does (one-shot page from scripts/dev-login.py), then
// visit every M1 Compute page against a running Hive with real rctest data:
// report the heading, page errors, console errors, a scrollWidth check and an
// axe scan for each, and save a screenshot.
//
//   node scripts/live-m1.mjs <one-shot login URL> [base URL] [out dir] [desktop|phone]
import { chromium, devices } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [
  loginUrl,
  base = "http://localhost:5173",
  outDir = "smoke-out",
  device = "desktop",
] = process.argv.slice(2);
if (!loginUrl) {
  console.error(
    "usage: live-m1.mjs <one-shot login URL> [base] [outDir] [desktop|phone]",
  );
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const ROUTES = [
  "/compute/overview",
  "/compute/instances",
  "/compute/instances/launch",
  "/compute/images",
  "/compute/key-pairs",
  "/compute/server-groups",
  "/network/security-groups",
  "/network/topology",
  "/network/networks",
  "/network/routers",
  "/network/floating-ips",
  "/storage/volumes",
  "/storage/snapshots",
  "/storage/backups",
  "/api-access",
];

const browser = await chromium.launch();
let failures = 0;
const context = await browser.newContext(
  device === "phone"
    ? { ...devices["Pixel 5"] }
    : { viewport: { width: 1366, height: 900 } },
);
const page = await context.newPage();
page.on("pageerror", (error) => {
  console.log(`  page error: ${error.message}`);
  failures += 1;
});
page.on("console", (message) => {
  if (message.type() === "error")
    console.log(`  console error: ${message.text().slice(0, 300)}`);
});

await page.goto(loginUrl);
await page.waitForURL((url) => url.origin === new URL(base).origin, {
  timeout: 30_000,
});
await page.waitForSelector("main h1", { timeout: 30_000 });
console.log(`logged in, landed on ${page.url()}`);

async function visit(route) {
  console.log(route);
  await page.goto(`${base}${route}`);
  await page.waitForSelector("main h1", { timeout: 30_000 });
  // Let the data queries settle (rctest is slow); stop early when idle.
  await page
    .waitForLoadState("networkidle", { timeout: 45_000 })
    .catch(() => {});
  await page.waitForTimeout(800);
  const heading = await page.locator("main h1").first().innerText();
  const status = await page.locator('[role="status"]').allInnerTexts();
  const errors = await page.locator('[role="alert"]').allInnerTexts();
  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.scrollingElement?.scrollWidth ?? 0,
    document.scrollingElement?.clientWidth ?? 0,
  ]);
  console.log(
    `  h1="${heading}" status=${JSON.stringify(status.filter(Boolean).slice(0, 3))}`,
  );
  if (errors.length)
    console.log(`  alerts: ${JSON.stringify(errors.slice(0, 3))}`);
  if (scrollWidth > clientWidth) {
    console.log(`  HORIZONTAL SCROLL: ${scrollWidth} > ${clientWidth}`);
    failures += 1;
  }
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("iframe")
    .exclude("[data-live-announcer]")
    .analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  console.log(
    `  axe: ${results.violations.length} violations (${serious.length} serious)`,
  );
  for (const v of serious) {
    console.log(`    - [${v.impact}] ${v.id}: ${v.help}`);
    for (const node of v.nodes.slice(0, 2))
      console.log(`        ${node.target.join(" ")}`);
  }
  if (serious.length) failures += 1;
  await page.screenshot({
    path: join(
      outDir,
      `${device}-${route.replace(/\//g, "_").replace(/^_/, "")}.png`,
    ),
    fullPage: true,
  });
  return heading;
}

try {
  for (const route of ROUTES) await visit(route);
  // Follow the first instance, key pair and security group links if any exist.
  for (const [list, pattern] of /** @type {Array<[string, RegExp]>} */ ([
    ["/compute/instances", /\/compute\/instances\/[^/]+$/],
    ["/compute/key-pairs", /\/compute\/key-pairs\/[^/]+$/],
    ["/network/security-groups", /\/network\/security-groups\/[^/]+$/],
    ["/network/networks", /\/network\/networks\/[^/]+$/],
    ["/network/routers", /\/network\/routers\/[^/]+$/],
    ["/storage/volumes", /\/storage\/volumes\/[^/]+$/],
    ["/storage/snapshots", /\/storage\/snapshots\/[^/]+$/],
    ["/storage/backups", /\/storage\/backups\/[^/]+$/],
  ])) {
    await page.goto(`${base}${list}`);
    await page
      .waitForLoadState("networkidle", { timeout: 45_000 })
      .catch(() => {});
    const href = await page
      .locator("main a[href]")
      .evaluateAll((anchors, re) => {
        const regex = new RegExp(re);
        return (
          anchors
            .map((a) => a.getAttribute("href"))
            .find((h) => h && regex.test(h)) ?? null
        );
      }, pattern.source);
    if (href) await visit(href);
    else console.log(`${list}: no detail links to follow`);
  }
} finally {
  await context.close();
  await browser.close();
}
console.log(failures ? `FAILURES: ${failures}` : "all pages ok");
process.exit(failures ? 1 : 0);
