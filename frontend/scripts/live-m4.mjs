#!/usr/bin/env node
// Log in the way manuka does, switch to the test project, then exercise the
// M4 Nectar panels against a running Hive with real rctest data: every page
// with an axe scan, the member list, a user lookup, an application
// credential create and delete, the EC2 pair, the usage pages, security
// risks and the reservation pages. The password reset is never run here:
// it would invalidate the test credential.
//
//   node scripts/live-m4.mjs <one-shot login URL> [base] [project=pt-50] [outDir]
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [
  loginUrl,
  base = "http://localhost:5173",
  projectName = "pt-50",
  outDir = "smoke-m4",
] = process.argv.slice(2);
if (!loginUrl) {
  console.error(
    "usage: live-m4.mjs <one-shot login URL> [base] [project] [outDir]",
  );
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
});
const page = await context.newPage();
let failures = 0;
page.on("pageerror", (error) => {
  console.log(`  page error: ${error.message}`);
  failures += 1;
});
page.on("console", (message) => {
  if (message.type() === "error")
    console.log(`  console error: ${message.text().slice(0, 300)}`);
});

const api = (path) =>
  page.evaluate(async (p) => {
    const r = await fetch(p, { credentials: "same-origin" });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, path);

async function settle() {
  await page.waitForSelector("main h1", { timeout: 30_000 });
  await page
    .waitForLoadState("networkidle", { timeout: 45_000 })
    .catch(() => {});
  await page.waitForTimeout(800);
}

async function check(label) {
  const heading = await page.locator("main h1").first().innerText();
  const status = await page.locator('[role="status"]').allInnerTexts();
  const alerts = await page.locator('[role="alert"]').allInnerTexts();
  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.scrollingElement?.scrollWidth ?? 0,
    document.scrollingElement?.clientWidth ?? 0,
  ]);
  console.log(
    `  h1="${heading}" status=${JSON.stringify(
      status
        .filter(Boolean)
        .slice(0, 3)
        .map((s) => s.slice(0, 120)),
    )}`,
  );
  if (alerts.length)
    console.log(`  alerts: ${JSON.stringify(alerts.slice(0, 3))}`);
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
    path: join(outDir, `${label.replace(/[^a-z0-9]+/gi, "_")}.png`),
    fullPage: true,
  });
}

async function visit(route) {
  console.log(route);
  await page.goto(`${base}${route}`);
  await settle();
  await check(route);
}

try {
  await page.goto(loginUrl);
  await page.waitForURL((url) => url.origin === new URL(base).origin, {
    timeout: 30_000,
  });
  await page.waitForSelector("main h1", { timeout: 30_000 });
  const me = await api("/api/me");
  const target = me.body.projects.find((p) => p.name === projectName);
  if (!target) throw new Error(`project ${projectName} not available`);
  if (me.body.project.id !== target.id) {
    await page.goto(`${base}/auth/switch/${target.id}`);
    await page.waitForURL(`${base}/`, { timeout: 30_000 });
  }
  const who = await api("/api/me");
  console.log(
    `logged in as ${who.body.user.name} in ${who.body.project.name} (roles: ${who.body.roles.join(", ")})`,
  );

  // --- account ---------------------------------------------------------------
  await visit("/account/my-details");
  console.log(
    `  orcid connected: ${(await page.getByText("Connected", { exact: false }).count()) > 0}`,
  );
  await visit("/account/reset-password");
  console.log(
    "  (reset password not exercised: it would change the test credential)",
  );

  // --- identity --------------------------------------------------------------
  await visit("/members");
  const members = await api("/api/identity/members");
  console.log(
    `  members: ${members.status} ${members.body?.items?.length ?? "?"} rows`,
  );

  await visit("/identity/user-lookup?q=sorrison");
  const found = await api("/api/identity/users/search?q=sorrison");
  console.log(
    `  lookup: ${found.status} ${found.body?.items?.length ?? found.body?.error} results`,
  );
  if (found.body?.items?.[0]) {
    await visit(`/identity/users/${found.body.items[0].id}`);
  }

  await visit("/identity/application-credentials");
  const name = `hive-smoke-${Date.now().toString(36)}`;
  await page
    .getByRole("button", { name: "Create application credential" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Create application credential",
  });
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await dialog
    .getByRole("button", { name: "Create application credential" })
    .click();
  const secret = page.getByRole("dialog", {
    name: "Application credential created",
  });
  await secret.waitFor({ timeout: 30_000 });
  console.log(`  created application credential ${name} (secret shown once)`);
  await check("appcred-secret");
  await secret
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  await page.getByRole("link", { name }).click();
  await settle();
  await check("appcred-detail");
  await page.goto(`${base}/identity/application-credentials`);
  await settle();
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
  await row.getByRole("button", { name: /actions/i }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete" })
    .click();
  await page
    .getByText(`Application credential ${name} deleted.`)
    .waitFor({ timeout: 30_000 });
  console.log(`  deleted application credential ${name}`);

  await visit("/identity/credentials");
  const ec2 = await api("/api/identity/ec2-credentials");
  console.log(
    `  ec2 pair for project: ${ec2.body?.credential ? "present" : "none"}`,
  );

  // --- usage and security ----------------------------------------------------
  await visit("/usage/trend");
  const instances = await api("/api/usage/instances");
  console.log(
    `  usage instances: ${instances.status} ${instances.body?.items?.length ?? "?"} rows, sum ${instances.body?.sum}, partial ${instances.body?.partial}`,
  );
  await page.getByRole("button", { name: "Past 30 days" }).click();
  await settle();
  await check("usage-trend-30d");
  await visit("/usage/allocation");
  const allocation = await api("/api/usage/allocation");
  console.log(
    `  allocation usage: available ${allocation.body?.available} ${allocation.body?.reason ?? ""}`,
  );
  await visit("/security/risks");

  // --- reservations ----------------------------------------------------------
  await visit("/reservations");
  const reservations = await api("/api/reservations");
  console.log(
    `  reservations: ${reservations.body?.items?.length} rows, limits ${JSON.stringify(reservations.body?.limits)}`,
  );
  await visit("/reservations/new");
  const slots = await api("/api/reservations/slots");
  console.log(
    `  slots: ${slots.body?.slots?.length} windows across ${slots.body?.flavors?.length} flavours`,
  );
  await visit("/reservations/new?category=GPU&zone=ardctest-artm");
} catch (error) {
  console.log(`FAILED: ${error instanceof Error ? error.message : error}`);
  failures += 1;
} finally {
  await context.close();
  await browser.close();
}
console.log(failures ? `FAILURES: ${failures}` : "all pages ok");
process.exit(failures ? 1 : 0);
