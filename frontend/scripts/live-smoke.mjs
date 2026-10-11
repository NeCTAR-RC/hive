#!/usr/bin/env node
// Drive a real browser through the manuka-style login against a running
// Hive (default http://127.0.0.1:8000, which must serve the built SPA), then
// screenshot the home page and My Details at desktop and phone widths and
// run an axe accessibility scan on each.
//
//   node scripts/live-smoke.mjs <one-shot login URL> [base URL] [out dir]
//
// The one-shot URL comes from `python scripts/dev-login.py --no-browser`.
import { chromium, devices } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [
  loginUrl,
  base = "http://127.0.0.1:8000",
  outDir = "smoke-out",
  device = "desktop",
] = process.argv.slice(2);
if (!loginUrl) {
  console.error(
    "usage: live-smoke.mjs <one-shot login URL> [base] [outDir] [desktop|phone]",
  );
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
let failures = 0;

async function scan(page, name) {
  // Third-party iframes (the welcome video) are outside Hive's control.
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("iframe")
    .analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  console.log(
    `${name}: ${results.violations.length} axe violations ` +
      `(${serious.length} serious or critical)`,
  );
  for (const v of results.violations) {
    console.log(
      `  - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`,
    );
    for (const node of v.nodes.slice(0, 3)) {
      console.log(`      ${node.target.join(" ")}`);
    }
  }
  if (serious.length) failures += 1;
}

async function run(label, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    console.log(`${label}: page error: ${error.message}`);
    failures += 1;
  });
  // The one-shot page auto-submits manuka's form to the receiver.
  await page.goto(loginUrl);
  await page.waitForURL((url) => url.origin === new URL(base).origin, {
    timeout: 30_000,
  });
  await page.waitForSelector("main h1", { timeout: 30_000 });
  await page.waitForTimeout(1500);
  const title = await page.title();
  const heading = await page.locator("main h1").first().innerText();
  console.log(`${label}: landed on ${page.url()} | ${title} | h1="${heading}"`);
  const scrollWidth = await page.evaluate(
    () => document.scrollingElement?.scrollWidth ?? 0,
  );
  const clientWidth = await page.evaluate(
    () => document.scrollingElement?.clientWidth ?? 0,
  );
  console.log(
    `${label}: page scrollWidth=${scrollWidth} clientWidth=${clientWidth}`,
  );
  if (scrollWidth > clientWidth) failures += 1;
  await page.screenshot({
    path: join(outDir, `${label}-home.png`),
    fullPage: true,
  });
  await scan(page, `${label} home`);

  await page.goto(`${base}/account/my-details`);
  await page.waitForSelector("main h1", { timeout: 30_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: join(outDir, `${label}-my-details.png`),
    fullPage: true,
  });
  await scan(page, `${label} my-details`);

  // Horizon redirect map through the backend.
  const response = await page.goto(`${base}/settings/my-details/?x=1`);
  console.log(
    `${label}: /settings/my-details/ -> ${page.url()} (${response?.status()})`,
  );
  await context.close();
}

try {
  if (device === "phone") {
    await run("phone", { ...devices["Pixel 5"] });
  } else {
    await run("desktop", { viewport: { width: 1366, height: 900 } });
  }
} finally {
  await browser.close();
}
console.log(failures ? `FAILED (${failures})` : "OK");
process.exit(failures ? 1 : 0);
