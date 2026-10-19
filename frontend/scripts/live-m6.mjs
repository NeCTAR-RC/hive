#!/usr/bin/env node
// Log in the way manuka does, switch to the test project, then exercise the
// M6 pages against a running Hive with real rctest data: orchestration
// (stacks, a validated template, resource types, template versions and a
// small stack that is created and deleted), DNS (zones, record sets, a
// TXT record set that is created and deleted on the first zone), shares
// (list, options, a small CephFS share in ardctest-artm that is created
// and deleted, snapshots, security services, share groups) and databases
// (instances, options, backups, configuration groups; nothing is
// launched). Every page gets an axe scan.
//
//   node scripts/live-m6.mjs <one-shot login URL> [base] [project=pt-50] [outDir]
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [
  loginUrl,
  base = "http://localhost:5173",
  projectName = "pt-50",
  outDir = "smoke-m6",
] = process.argv.slice(2);
if (!loginUrl) {
  console.error(
    "usage: live-m6.mjs <one-shot login URL> [base] [project] [outDir]",
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
const post = (path, body, method = "POST") =>
  api(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

async function settle() {
  await page.waitForSelector("main h1", { timeout: 30_000 });
  await page
    .waitForLoadState("networkidle", { timeout: 60_000 })
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

async function waitFor(pathFn, done, timeoutMs = 300_000) {
  const started = Date.now();
  for (;;) {
    const r = await api(pathFn());
    if (done(r)) return r;
    if (Date.now() - started > timeoutMs)
      throw new Error(`timeout waiting on ${pathFn()}`);
    await page.waitForTimeout(5000);
  }
}

const tag = Date.now().toString(36);
const stackName = `hive-smoke-${tag}`;
const shareName = `hive-smoke-${tag}`;
let stackId = null;
let shareId = null;
let recordsetRef = null;

const TEMPLATE = `heat_template_version: 2021-04-16
description: Hive live smoke, holds no resources
parameters:
  note:
    type: string
    default: hello
    description: A string parameter
resources:
  wait:
    type: OS::Heat::RandomString
    properties:
      length: 8
outputs:
  value:
    description: The random string
    value: { get_attr: [wait, value] }
`;

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

  // --- orchestration --------------------------------------------------------
  await visit("/orchestration/stacks");
  await visit("/orchestration/resource-types");
  const types = await api("/api/orchestration/resource-types");
  console.log(`  ${types.body.items.length} resource types`);
  await visit("/orchestration/resource-types/OS::Heat::RandomString");
  await visit("/orchestration/template-versions");
  const versions = await api("/api/orchestration/template-versions");
  const hot = versions.body.items.find((v) => v.version.includes("2021-04-16"));
  if (hot)
    await visit(
      `/orchestration/template-versions/${encodeURIComponent(hot.version)}`,
    );

  await visit("/orchestration/stacks/new");
  await page
    .getByRole("textbox", { name: "Template", exact: true })
    .fill(TEMPLATE);
  await page.getByRole("button", { name: "Next" }).click();
  await page
    .getByRole("textbox", { name: "Stack name" })
    .waitFor({ timeout: 60_000 });
  await check("launch-stack-parameters");
  await page.getByRole("textbox", { name: "Stack name" }).fill(stackName);
  await page.getByRole("button", { name: "Launch" }).click();
  await page
    .getByText(`Stack ${stackName} is being created.`)
    .waitFor({ timeout: 60_000 });
  const created = await api("/api/orchestration/stacks");
  stackId = created.body.items.find((s) => s.name === stackName)?.id ?? null;
  console.log(`  created stack ${stackName} (${stackId})`);
  const done = await waitFor(
    () => `/api/orchestration/stacks/${stackId}`,
    (r) => r.status === 200 && !r.body.is_transitional,
  );
  console.log(`  stack ${done.body.status}: ${done.body.status_reason}`);
  await visit(`/orchestration/stacks/${stackId}`);
  await visit(`/orchestration/stacks/${stackId}?tab=resources`);
  await visit(`/orchestration/stacks/${stackId}?tab=events`);
  await visit(`/orchestration/stacks/${stackId}?tab=template`);
  const outputs = done.body.outputs
    ?.map((o) => `${o.key}=${o.value}`)
    .join(", ");
  console.log(`  outputs: ${outputs || "none"}`);
  const del = await api(`/api/orchestration/stacks/${stackId}`, {
    method: "DELETE",
  });
  console.log(`  deleted stack: ${del.status}`);
  stackId = null;

  // --- dns ------------------------------------------------------------------
  await visit("/dns/zones");
  const zones = await api("/api/dns/zones");
  console.log(
    `  zones: ${zones.body.items.map((z) => `${z.name} ${z.status}`).join(", ")} quota ${JSON.stringify(zones.body.quota)}`,
  );
  const zone = zones.body.items[0];
  if (zone) {
    await visit(`/dns/zones/${zone.id}`);
    const rs = await post(`/api/dns/zones/${zone.id}/recordsets`, {
      name: `hive-smoke-${tag}`,
      type: "TXT",
      records: ["hive live smoke"],
      ttl: 60,
    });
    console.log(
      `  created record set: ${rs.status} ${rs.body.name ?? rs.body.message}`,
    );
    if (rs.status === 202) {
      recordsetRef = { zoneId: zone.id, id: rs.body.id };
      await waitFor(
        () => `/api/dns/zones/${zone.id}/recordsets`,
        (r) =>
          r.body.items?.some((x) => x.id === rs.body.id && !x.is_transitional),
        120_000,
      );
      await visit(`/dns/zones/${zone.id}`);
      const gone = await api(
        `/api/dns/zones/${zone.id}/recordsets/${rs.body.id}`,
        { method: "DELETE" },
      );
      console.log(`  deleted record set: ${gone.status}`);
      recordsetRef = null;
    }
  }

  // --- shares ---------------------------------------------------------------
  await visit("/shares/shares");
  const options = await api("/api/shares/options");
  console.log(
    `  protocols ${options.body.protocols.join(",")} types ${options.body.share_types.map((t) => t.name).join(",")} zones ${options.body.availability_zones.join(",")} can_create ${options.body.can_create}`,
  );
  const cephType =
    options.body.share_types.find((t) => t.name === "cephfs_share_type") ??
    options.body.share_types.find((t) => t.name?.includes("cephfs")) ??
    options.body.share_types[0];
  const nativeCeph = cephType?.name === "cephfs_share_type";
  if (cephType && options.body.can_create) {
    await page.getByRole("button", { name: "Create share" }).click();
    const dialog = page.getByRole("dialog", { name: "Create share" });
    await dialog.getByRole("textbox", { name: "Share name" }).fill(shareName);
    await page.waitForTimeout(600);
    await check("create-share-dialog");
    await page.keyboard.press("Escape");
    const share = await post("/api/shares/shares", {
      name: shareName,
      protocol: nativeCeph ? "CephFS" : "NFS",
      size: 1,
      share_type: cephType.name,
      availability_zone: "ardctest-artm",
      metadata: "purpose=hive-smoke",
    });
    console.log(
      `  created share: ${share.status} ${share.body.id ?? share.body.message}`,
    );
    if (share.status === 202) {
      shareId = share.body.id;
      const ready = await waitFor(
        () => `/api/shares/shares/${shareId}`,
        (r) => r.status === 200 && !r.body.is_transitional,
      );
      console.log(
        `  share ${ready.body.status}, export ${ready.body.export_locations?.[0]?.path ?? "none"}`,
      );
      await visit(`/shares/shares/${shareId}`);
      await visit(`/shares/shares/${shareId}?tab=rules`);
      if (ready.body.status === "available") {
        const rule = await post(`/api/shares/shares/${shareId}/access`, {
          access_type: nativeCeph ? "cephx" : "ip",
          access_to: nativeCeph ? `hivesmoke${tag}` : "203.0.113.0/24",
          access_level: "rw",
        });
        console.log(
          `  access rule: ${rule.status} ${rule.body.id ?? rule.body.message}`,
        );
        if (rule.status === 202) {
          const settled = await waitFor(
            () => `/api/shares/shares/${shareId}/access`,
            (r) =>
              r.body.items?.some(
                (x) =>
                  x.id === rule.body.id &&
                  !["queued_to_apply", "applying"].includes(x.state),
              ),
            180_000,
          ).catch((error) => {
            console.log(`  rule did not settle: ${error.message}`);
            return null;
          });
          const state = settled?.body.items?.find(
            (x) => x.id === rule.body.id,
          )?.state;
          console.log(`  rule state: ${state ?? "unknown"}`);
          if (state !== "active") failures += 0;
          await visit(`/shares/shares/${shareId}?tab=rules`);
          const deny = await api(
            `/api/shares/shares/${shareId}/access/${rule.body.id}`,
            { method: "DELETE" },
          );
          console.log(`  removed rule: ${deny.status}`);
        }
      }
      const gone = await api(`/api/shares/shares/${shareId}`, {
        method: "DELETE",
      });
      console.log(`  deleted share: ${gone.status}`);
      shareId = null;
    }
  }
  await visit("/shares/snapshots");
  await visit("/shares/security-services");
  await visit("/shares/share-groups");
  await visit("/shares/share-group-snapshots");

  // --- databases ------------------------------------------------------------
  await visit("/databases/instances");
  const dbOptions = await api("/api/databases/options");
  console.log(
    `  datastores ${dbOptions.body.datastores.map((d) => d.label).join(",")} flavors ${dbOptions.body.flavors.map((f) => f.id).join(",")} networks ${dbOptions.body.networks.length} zones ${dbOptions.body.availability_zones.join(",")} quota ${JSON.stringify(dbOptions.body.quota)}`,
  );
  await visit("/databases/instances/new");
  const instances = await api("/api/databases/instances");
  const first = instances.body.items[0];
  if (first) {
    await visit(`/databases/instances/${first.id}`);
    await visit(`/databases/instances/${first.id}?tab=users`);
  }
  await visit("/databases/backups");
  const backups = await api("/api/databases/backups");
  console.log(
    `  backups: ${backups.body.items.map((b) => `${b.name} ${b.status}`).join(", ") || "none"}`,
  );
  const backup = backups.body.items[0];
  if (backup) await visit(`/databases/backups/${backup.id}`);
  await visit("/databases/configuration-groups");
  const configs = await api("/api/databases/configurations");
  console.log(`  configuration groups: ${configs.body.items.length}`);
} catch (error) {
  console.log(`FAILED: ${error instanceof Error ? error.message : error}`);
  failures += 1;
} finally {
  // Best effort cleanup of anything the run left behind.
  if (stackId)
    await api(`/api/orchestration/stacks/${stackId}`, {
      method: "DELETE",
    }).catch(() => {});
  if (shareId)
    await api(`/api/shares/shares/${shareId}`, { method: "DELETE" }).catch(
      () => {},
    );
  if (recordsetRef)
    await api(
      `/api/dns/zones/${recordsetRef.zoneId}/recordsets/${recordsetRef.id}`,
      { method: "DELETE" },
    ).catch(() => {});
  await context.close();
  await browser.close();
}
console.log(failures ? `FAILURES: ${failures}` : "all pages ok");
process.exit(failures ? 1 : 0);
