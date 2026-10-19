#!/usr/bin/env node
// Log in the way manuka does, switch to the test project, then exercise the
// M5 pages against a running Hive with real rctest data: the object store
// (create a scratch container, upload a file from the browser through a
// signed URL, download it, delete it and the container), the Kubernetes
// pages (clusters, a cluster's node groups, templates, the create form's
// pickers) and the load balancer pages (list, tree, listener and pool
// details, the wizard's options). Every page gets an axe scan.
//
//   node scripts/live-m5.mjs <one-shot login URL> [base] [project=pt-50] [outDir]
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [
  loginUrl,
  base = "http://localhost:5173",
  projectName = "pt-50",
  outDir = "smoke-m5",
] = process.argv.slice(2);
if (!loginUrl) {
  console.error(
    "usage: live-m5.mjs <one-shot login URL> [base] [project] [outDir]",
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

const container = `hive-smoke-${Date.now().toString(36)}`;

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

  // --- object store ---------------------------------------------------------
  await visit("/object-store/containers");
  const info = await api("/api/object-store/info");
  console.log(
    `  store: mode ${info.body.upload_mode}, ${info.body.account.container_count} containers, policies ${info.body.policies.map((p) => p.name).join(",")}`,
  );
  await page.getByRole("button", { name: "Create container" }).click();
  const dialog = page.getByRole("dialog", { name: "Create container" });
  await dialog.getByRole("textbox", { name: "Container name" }).fill(container);
  await dialog.getByRole("button", { name: "Create container" }).click();
  await page
    .getByText(`Container ${container} created.`)
    .waitFor({ timeout: 30_000 });
  console.log(`  created container ${container}`);
  await page.goto(
    `${base}/object-store/containers/${encodeURIComponent(container)}`,
  );
  await settle();
  await check("container-empty");

  await page.getByRole("button", { name: "Create folder" }).click();
  await page
    .getByRole("dialog", { name: "Create folder" })
    .getByRole("textbox", { name: "Folder name" })
    .fill("uploads");
  await page
    .getByRole("dialog", { name: "Create folder" })
    .getByRole("button", { name: "Create folder" })
    .click();
  await page.getByText("Folder uploads created.").waitFor({ timeout: 30_000 });

  await page.getByRole("button", { name: "Upload files" }).click();
  const upload = page.getByRole("dialog", { name: "Upload files" });
  await upload.getByRole("button", { name: "Choose files" }).click();
  await page.setInputFiles('input[type="file"]', {
    name: "hello.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello from hive live smoke\n".repeat(40)),
  });
  await upload.getByRole("button", { name: /^Upload 1 file/ }).click();
  await page.getByText("Uploaded hello.txt.").waitFor({ timeout: 60_000 });
  console.log("  uploaded hello.txt through a signed URL");
  await upload
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  await settle();
  await check("container-with-object");

  const downloadWaiter = page.waitForEvent("download", { timeout: 30_000 });
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: "hello.txt" }) });
  await row.getByRole("button", { name: /actions/i }).click();
  await page.getByRole("menuitem", { name: "Download" }).click();
  const download = await downloadWaiter;
  const path = await download.path();
  console.log(
    `  downloaded ${download.suggestedFilename()} (${path ? "saved" : "no file"})`,
  );

  await row.getByRole("button", { name: /actions/i }).click();
  await page.getByRole("menuitem", { name: "View details" }).click();
  await page
    .getByRole("dialog", { name: "hello.txt" })
    .waitFor({ timeout: 30_000 });
  // Let the dialog's entry transition finish before axe measures contrast.
  await page.waitForTimeout(600);
  await check("object-details");
  await page.keyboard.press("Escape");

  const del = await api(
    `/api/object-store/containers/${encodeURIComponent(container)}/delete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: ["hello.txt", "uploads/"] }),
    },
  );
  console.log(`  deleted objects: ${JSON.stringify(del.body)}`);
  const gone = await api(
    `/api/object-store/containers/${encodeURIComponent(container)}`,
    { method: "DELETE" },
  );
  console.log(`  deleted container: ${gone.status}`);

  // --- kubernetes -----------------------------------------------------------
  await visit("/kubernetes/clusters");
  const clusters = await api("/api/kubernetes/clusters");
  console.log(
    `  clusters: ${clusters.body.items.map((c) => `${c.name} ${c.status}/${c.health_status}`).join(", ")} quota ${JSON.stringify(clusters.body.quota)}`,
  );
  const first = clusters.body.items[0];
  if (first) {
    await visit(`/kubernetes/clusters/${first.id}`);
    await visit(`/kubernetes/clusters/${first.id}?tab=nodegroups`);
    const groups = await api(`/api/kubernetes/clusters/${first.id}/nodegroups`);
    console.log(
      `  node groups: ${groups.body.items.map((g) => `${g.name}(${g.role},${g.node_count})`).join(", ")} can_change ${groups.body.can_change}`,
    );
    const upgrade = await api(
      `/api/kubernetes/clusters/${first.id}/upgrade-options`,
    );
    console.log(
      `  upgrade targets: ${upgrade.body.targets?.map((t) => t.kubernetes_version).join(", ") || "none"}`,
    );
  }
  await visit("/kubernetes/cluster-templates");
  await visit("/kubernetes/clusters/new");
  const options = await api("/api/kubernetes/clusters/options");
  console.log(
    `  versions ${options.body.versions.join(",")} zones ${options.body.availability_zones.join(",")} drivers ${options.body.network_drivers.join(",")} combos ${options.body.combinations.length}`,
  );

  // --- load balancers -------------------------------------------------------
  await visit("/load-balancers");
  const lbs = await api("/api/load-balancers");
  console.log(
    `  load balancers: ${lbs.body.items.map((l) => `${l.name?.slice(0, 40)} ${l.provisioning_status}/${l.operating_status}`).join("; ")}`,
  );
  const lb = lbs.body.items[0];
  if (lb) {
    await visit(`/load-balancers/${lb.id}`);
    await visit(`/load-balancers/${lb.id}?tab=listeners`);
    const tree = await api(`/api/load-balancers/${lb.id}/tree`);
    console.log(
      `  tree: ${tree.body.listeners.length} listeners, ${tree.body.pools.length} pools, ${tree.body.monitors.length} monitors, ${tree.body.l7policies.length} policies`,
    );
    const listener = tree.body.listeners[0];
    if (listener)
      await visit(`/load-balancers/${lb.id}/listeners/${listener.id}`);
    const pool = tree.body.pools[0];
    if (pool) await visit(`/load-balancers/${lb.id}/pools/${pool.id}`);
  }
  await visit("/load-balancers/new");
  const lbOptions = await api("/api/load-balancers/options");
  console.log(
    `  options: ${lbOptions.body.subnets.length} subnets, ${lbOptions.body.instances.length} instances, zones ${lbOptions.body.availability_zones.map((z) => z.name).join(",")}, flavors ${lbOptions.body.flavors.map((f) => f.name).join(",")}`,
  );
} catch (error) {
  console.log(`FAILED: ${error instanceof Error ? error.message : error}`);
  failures += 1;
  // Best effort cleanup of the scratch container.
  await api(
    `/api/object-store/containers/${encodeURIComponent(container)}/delete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: ["hello.txt", "uploads/"] }),
    },
  ).catch(() => {});
  await api(`/api/object-store/containers/${encodeURIComponent(container)}`, {
    method: "DELETE",
  }).catch(() => {});
} finally {
  await context.close();
  await browser.close();
}
console.log(failures ? `FAILURES: ${failures}` : "all pages ok");
process.exit(failures ? 1 : 0);
