#!/usr/bin/env node
// Log in the way manuka does, switch to the test project, then exercise
// the database instance pages against a running Hive with real rctest
// data: the launch form's flavours per datastore version, the first
// active instance's resize candidates, Defaults tab and Logs tab. On the
// first active instance a USER log is enabled, published, viewed and
// downloaded, then disabled and its published data discarded. Nothing
// else is changed. Every page gets an axe scan.
//
//   node scripts/live-trove.mjs <one-shot login URL> [base] [project=pt-50] [outDir]
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [
  loginUrl,
  base = "http://localhost:5173",
  projectName = "pt-50",
  outDir = "smoke-trove",
] = process.argv.slice(2);
if (!loginUrl) {
  console.error(
    "usage: live-trove.mjs <one-shot login URL> [base] [project] [outDir]",
  );
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  acceptDownloads: true,
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

const api = (path, init) =>
  page.evaluate(
    async ([p, i]) => {
      const csrf = document.cookie
        .split("; ")
        .find((c) => c.startsWith("hive_csrf="))
        ?.slice("hive_csrf=".length);
      const r = await fetch(p, {
        credentials: "same-origin",
        ...i,
        headers: {
          ...(i?.headers ?? {}),
          ...(i?.method && i.method !== "GET"
            ? { "X-CSRF-Token": decodeURIComponent(csrf ?? "") }
            : {}),
        },
      });
      const text = await r.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return { status: r.status, body };
    },
    [path, init ?? null],
  );
const post = (path) => api(path, { method: "POST" });

async function settle() {
  await page.waitForSelector("main h1", { timeout: 30_000 });
  await page
    .waitForLoadState("networkidle", { timeout: 60_000 })
    .catch(() => {});
  await page.waitForTimeout(800);
}

async function check(label) {
  const heading = await page.locator("main h1").first().innerText();
  const alerts = await page.locator('[role="alert"]').allInnerTexts();
  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.scrollingElement?.scrollWidth ?? 0,
    document.scrollingElement?.clientWidth ?? 0,
  ]);
  console.log(`  h1="${heading}"`);
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

async function waitForLog(instanceId, name, done, timeoutMs = 180_000) {
  const started = Date.now();
  for (;;) {
    const r = await api(`/api/databases/instances/${instanceId}/logs`);
    const log = r.body.items?.find((l) => l.name === name);
    if (log && done(log)) return log;
    if (Date.now() - started > timeoutMs)
      throw new Error(`timeout waiting on log ${name}`);
    await page.waitForTimeout(5000);
  }
}

let instanceId = null;
let logName = null;
let enabledByUs = false;
let publishedByUs = false;

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
  console.log(`logged in in ${projectName}`);

  // --- flavours per datastore version -------------------------------------
  const options = await api("/api/databases/options");
  console.log(
    `  ${options.body.flavors.length} Trove flavours: ${options.body.flavors
      .map((f) => f.name)
      .join(", ")}`,
  );
  for (const [key, list] of Object.entries(options.body.flavors_by_version)) {
    console.log(`  ${key}: ${list.map((f) => f.name).join(", ")}`);
    if (list.length > options.body.flavors.length) {
      console.log(`  MORE FLAVOURS THAN TROVE LISTS for ${key}`);
      failures += 1;
    }
  }
  await visit("/databases/instances/new");

  // --- the first active instance ------------------------------------------
  const instances = await api("/api/databases/instances");
  const active = instances.body.items.find((i) => i.status === "ACTIVE");
  if (!active) {
    console.log("  no ACTIVE instance; skipping the instance checks");
  } else {
    instanceId = active.id;
    console.log(
      `  instance ${active.name} (${instanceId}) ${active.datastore} ${active.datastore_version} flavour ${active.flavor_name}`,
    );
    const candidates = await api(
      `/api/databases/instances/${instanceId}/resize-flavors`,
    );
    console.log(
      `  resize candidates: ${candidates.body.items.map((f) => f.name).join(", ")} (current ${candidates.body.current})`,
    );
    if (candidates.body.items.some((f) => f.id === candidates.body.current)) {
      console.log("  CURRENT FLAVOUR OFFERED FOR RESIZE");
      failures += 1;
    }
    await visit(`/databases/instances/${instanceId}`);
    await page.getByRole("button", { name: "Resize", exact: true }).click();
    await page
      .getByRole("dialog", { name: /^Resize / })
      .waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1200);
    await check("resize-dialog");
    await page.keyboard.press("Escape");

    await visit(`/databases/instances/${instanceId}?tab=defaults`);
    const defaults = await api(
      `/api/databases/instances/${instanceId}/configuration-defaults`,
    );
    console.log(`  ${defaults.body.items?.length ?? 0} configuration defaults`);

    await visit(`/databases/instances/${instanceId}?tab=logs`);
    const logs = await api(`/api/databases/instances/${instanceId}/logs`);
    for (const log of logs.body.items)
      console.log(
        `  log ${log.name} ${log.type} ${log.status} published=${log.published} pending=${log.pending}`,
      );
    const candidate = logs.body.items.find((l) => l.type === "USER");
    if (!candidate) {
      console.log("  no USER log to exercise");
    } else {
      logName = candidate.name;
      if (candidate.status === "Disabled") {
        const enabled = await post(
          `/api/databases/instances/${instanceId}/logs/${logName}/actions/enable`,
        );
        console.log(
          `  enable ${logName} -> ${enabled.status} ${enabled.body.status}`,
        );
        if (enabled.status !== 200) throw new Error("enable failed");
        enabledByUs = true;
      }
      const published = await post(
        `/api/databases/instances/${instanceId}/logs/${logName}/actions/publish`,
      );
      console.log(
        `  publish ${logName} -> ${published.status} ${published.body.status} published=${published.body.published}`,
      );
      if (published.status !== 200) throw new Error("publish failed");
      publishedByUs = true;
      const ready = await waitForLog(
        instanceId,
        logName,
        (log) => log.published > 0,
      );
      console.log(
        `  ${logName} ${ready.status} published=${ready.published} container=${ready.container}`,
      );
      const contents = await api(
        `/api/databases/instances/${instanceId}/logs/${logName}/contents?lines=20`,
      );
      console.log(
        `  contents -> ${contents.status} parts=${contents.body.parts} partial=${contents.body.partial} chars=${contents.body.text?.length}`,
      );
      if (contents.status !== 200) failures += 1;
      await visit(
        `/databases/instances/${instanceId}?tab=logs&log=${encodeURIComponent(logName)}`,
      );
      await page
        .getByRole("dialog", { name: `Log ${logName}` })
        .waitFor({ timeout: 30_000 });
      await page.waitForTimeout(1200);
      await check("log-viewer");
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 60_000 }),
        page.getByRole("button", { name: "Download" }).click(),
      ]);
      console.log(`  downloaded ${download.suggestedFilename()}`);
      await page.keyboard.press("Escape");
    }
  }
} catch (error) {
  console.log(`FAILED: ${error.message}`);
  failures += 1;
} finally {
  if (instanceId && logName) {
    if (enabledByUs) {
      const r = await post(
        `/api/databases/instances/${instanceId}/logs/${logName}/actions/disable`,
      );
      console.log(`  cleanup: disable ${logName} -> ${r.status}`);
    }
    if (publishedByUs) {
      const r = await post(
        `/api/databases/instances/${instanceId}/logs/${logName}/actions/discard`,
      );
      console.log(`  cleanup: discard ${logName} -> ${r.status}`);
    }
  }
  await browser.close();
}
console.log(failures ? `${failures} problem(s)` : "all pages ok");
process.exit(failures ? 1 : 0);
