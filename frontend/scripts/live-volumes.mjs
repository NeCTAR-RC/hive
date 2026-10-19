#!/usr/bin/env node
// Exercise the Volumes panels against rctest through a running Hive: switch
// to pt-50, create a 1 GB volume through the real dialog (zone required,
// zone-filtered types), extend it, snapshot it, then delete the snapshot
// and the volume through the pages. Cleans up by API if a step fails.
//
//   node scripts/live-volumes.mjs <one-shot login URL> [base] [project name]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [
  loginUrl,
  base = "http://localhost:5173",
  projectName = "pt-50",
  // Smoke runs on rctest use the ardctest-artm zone wherever possible.
  zoneName = "ardctest-artm",
  typeName = "",
] = process.argv.slice(2);
if (!loginUrl) {
  console.error(
    "usage: live-volumes.mjs <one-shot login URL> [base] [project] [zone] [type]",
  );
  process.exit(2);
}
const NAME = `hive-smoke-${Date.now().toString(36)}`;
// Screenshots land here (git-ignored by default); override with HIVE_SMOKE_OUT.
const OUT = process.env.HIVE_SMOKE_OUT ?? "smoke-out";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
let volumeId = null;
let snapshotId = null;

async function csrf() {
  const cookie = (await context.cookies()).find((c) => c.name === "hive_csrf");
  return cookie?.value ?? "";
}

async function waitForPill(text, timeout = 240_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const pill = await page
      .locator("main [data-tone]")
      .first()
      .innerText()
      .catch(() => "");
    if (pill === text) return pill;
    if (pill.startsWith("Error")) return pill;
    await page.waitForTimeout(4000);
  }
  return "timeout";
}

async function cleanup() {
  const headers = { "X-CSRF-Token": await csrf() };
  if (snapshotId) {
    await page.request
      .delete(`${base}/api/volumes/snapshots/${snapshotId}`, { headers })
      .catch(() => {});
    await page.waitForTimeout(8000);
  }
  if (volumeId) {
    await page.request
      .delete(`${base}/api/volumes/${volumeId}`, { headers })
      .catch(() => {});
  }
}

try {
  await page.goto(loginUrl);
  await page.waitForURL((url) => url.origin === new URL(base).origin, {
    timeout: 30_000,
  });
  await page.waitForSelector("main h1");
  const me = await (await page.request.get(`${base}/api/me`)).json();
  const target = me.projects.find((p) => p.name === projectName);
  if (!target) throw new Error(`no project called ${projectName}`);
  if (me.project.id !== target.id) {
    await page.goto(`${base}/auth/switch/${target.id}`);
    await page.waitForURL((url) => !url.pathname.startsWith("/auth/"), {
      timeout: 30_000,
    });
  }
  console.log(
    "project:",
    (await (await page.request.get(`${base}/api/me`)).json()).project.name,
  );

  const options = await (
    await page.request.get(`${base}/api/volumes/options`)
  ).json();
  console.log(
    "zones:",
    options.availability_zones.map((z) => z.name).join(", "),
    "| zoned types:",
    options.has_zoned_types,
    "| types:",
    options.volume_types
      .map((t) => `${t.name}${t.zones ? `[${t.zones.join("+")}]` : ""}`)
      .join(", "),
    "| gigabytes:",
    `${options.limits.totalGigabytesUsed}/${options.limits.maxTotalVolumeGigabytes}`,
    "| errors:",
    JSON.stringify(options.errors),
  );

  await page.goto(`${base}/storage/volumes`);
  await page.getByRole("button", { name: "Create volume" }).click();
  const dialog = page.getByRole("dialog", { name: "Create volume" });
  await dialog.getByRole("textbox", { name: "Volume name" }).fill(NAME);
  await dialog.getByRole("button", { name: /Availability zone/ }).click();
  const zone = zoneName
    ? page.getByRole("option", { name: zoneName, exact: true })
    : page.getByRole("option").first();
  console.log("zone:", await zone.innerText());
  await zone.click();
  const typeButton = dialog.getByRole("button", { name: /Volume type/ });
  if (await typeButton.count()) {
    await typeButton.click();
    console.log(
      "types offered:",
      (await page.getByRole("option").allInnerTexts()).join(", "),
    );
    if (typeName) {
      await page
        .getByRole("option", { name: new RegExp(`^${typeName}`) })
        .click();
      console.log("type chosen:", typeName);
    } else {
      await page.keyboard.press("Escape");
    }
  }
  await dialog.getByRole("button", { name: "Create volume" }).click();
  await page.locator("[role=alertdialog]").first().waitFor({ timeout: 60_000 });
  console.log(
    "create toast:",
    await page.locator("[role=alertdialog]").allInnerTexts(),
  );

  const link = page
    .getByRole("grid", { name: "Volumes" })
    .getByRole("link", { name: NAME });
  await link.waitFor({ timeout: 60_000 });
  volumeId = new URL((await link.getAttribute("href")) ?? "", base).pathname
    .split("/")
    .pop();
  console.log("volume id:", volumeId);
  await link.click();
  await page
    .getByRole("heading", { name: NAME, level: 1 })
    .waitFor({ timeout: 30_000 });
  console.log("status:", await waitForPill("Available"));

  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Extend volume" }).click();
  const extend = page.getByRole("dialog", { name: /Extend volume/ });
  await extend.getByRole("textbox", { name: "New size" }).fill("2");
  await extend.getByRole("button", { name: "Extend volume" }).click();
  await page.waitForTimeout(2000);
  console.log(
    "extend toast:",
    await page.locator("[role=alertdialog]").allInnerTexts(),
  );
  console.log("status after extend:", await waitForPill("Available"));
  await page.waitForTimeout(3000);
  console.log(
    "size shown:",
    (await page.getByText(/^2 GB$/).count()) > 0 ? "2 GB" : "not yet",
  );

  const snapshotQuota = options.limits.maxTotalSnapshots;
  const snapshotsLeft =
    snapshotQuota === undefined || snapshotQuota < 0
      ? 1
      : snapshotQuota - (options.limits.totalSnapshotsUsed ?? 0);
  await page.getByRole("button", { name: "Actions" }).click();
  const snapshotItem = page.getByRole("menuitem", { name: "Create snapshot" });
  console.log(
    "create snapshot item:",
    (await snapshotItem.getAttribute("aria-disabled")) === "true"
      ? `disabled (${(await snapshotItem.innerText()).replace(/\s+/g, " ")})`
      : "enabled",
  );
  if (snapshotsLeft <= 0) {
    console.log(
      `snapshot quota exhausted (${snapshotQuota}); skipping the snapshot steps`,
    );
    await page.keyboard.press("Escape");
  } else {
    await snapshotItem.click();
    const snap = page.getByRole("dialog", { name: /Create snapshot/ });
    await snap
      .getByRole("textbox", { name: "Snapshot name" })
      .fill(`${NAME}-snap`);
    await snap.getByRole("button", { name: "Create snapshot" }).click();
    // Either the toast (accepted) or the dialog's own error (refused, for
    // example a per-type snapshot quota of 0 that the limits do not show).
    const outcome = await Promise.race([
      page
        .locator("[role=alertdialog]")
        .first()
        .waitFor({ timeout: 60_000 })
        .then(() => "toast"),
      snap
        .getByText("Could not save")
        .waitFor({ timeout: 60_000 })
        .then(() => "error"),
    ]);
    if (outcome === "error") {
      const text = (await snap.innerText()).replace(/\s+/g, " ");
      console.log(
        "snapshot refused:",
        text.match(/Could not save.{0,160}/)?.[0] ?? text.slice(0, 200),
      );
      await snap.getByRole("button", { name: "Cancel" }).click();
      snapshotId = null;
    }
    const snapLink = page
      .getByRole("grid", { name: "Snapshots of this volume" })
      .getByRole("link", { name: `${NAME}-snap` });
    if (outcome === "toast") {
      console.log(
        "snapshot toast:",
        await page.locator("[role=alertdialog]").allInnerTexts(),
      );
      await snapLink.waitFor({ timeout: 60_000 });
      snapshotId = new URL(
        (await snapLink.getAttribute("href")) ?? "",
        base,
      ).pathname
        .split("/")
        .pop();
      console.log("snapshot id:", snapshotId);
    }
  }
  if (snapshotId) {
    await page.screenshot({
      path: join(OUT, "live-volume.png"),
      fullPage: true,
    });

    await page.goto(`${base}/storage/snapshots/${snapshotId}`);
    await page
      .getByRole("heading", { name: `${NAME}-snap`, level: 1 })
      .waitFor({ timeout: 30_000 });
    console.log("snapshot status:", await waitForPill("Available"));
    await page.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Delete snapshot" }).click();
    await page
      .getByRole("dialog", { name: /Delete snapshot/ })
      .getByRole("button", { name: "Delete" })
      .click();
    await page.waitForTimeout(2000);
    console.log(
      "delete snapshot toast:",
      await page.locator("[role=alertdialog]").allInnerTexts(),
    );
    snapshotId = null;

    // Cinder refuses to delete a volume with snapshots; wait for the snapshot to go.
    for (let i = 0; i < 30; i += 1) {
      const list = await (
        await page.request.get(`${base}/api/volumes/snapshots`)
      ).json();
      if (!list.items.some((s) => s.volume_id === volumeId)) break;
      await page.waitForTimeout(4000);
    }
  }
  await page.goto(`${base}/storage/volumes/${volumeId}`);
  await page
    .getByRole("heading", { name: NAME, level: 1 })
    .waitFor({ timeout: 30_000 });
  await page.screenshot({
    path: join(OUT, "live-volume-detail.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Delete volume" }).click();
  await page
    .getByRole("dialog", { name: /Delete volume/ })
    .getByRole("button", { name: "Delete" })
    .click();
  await page.waitForTimeout(2000);
  console.log(
    "delete volume toast:",
    await page.locator("[role=alertdialog]").allInnerTexts(),
  );
  volumeId = null;
  await page.goto(`${base}/storage/volumes`);
  await page
    .waitForLoadState("networkidle", { timeout: 60_000 })
    .catch(() => {});
  console.log(
    "list after delete:",
    (await page.locator("[role=status]").allInnerTexts()).filter(Boolean),
  );
} catch (error) {
  console.log("FAILED:", String(error).slice(0, 500));
  await page
    .screenshot({
      path: join(OUT, "live-volume-failure.png"),
      fullPage: true,
    })
    .catch(() => {});
  await cleanup();
  process.exitCode = 1;
} finally {
  await browser.close();
}
