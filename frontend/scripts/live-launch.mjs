// Launch one small instance on rctest (pt-50) through the real wizard, wait
// for it to become ACTIVE, exercise the detail tabs, then delete it.
//   node live-launch.mjs <one-shot login URL> [base] [outDir]
// With HIVE_LIVE_NEW_VOLUME=1 the image boots onto a new volume (deleted
// with the instance) and the networks are reordered when two are offered,
// so the volume and interface order can be checked on the instance.
// The delete step runs in a `finally`, so a failure after the Launch click
// (a missing tab, a full disk for the screenshot) never leaves the instance
// running on rctest.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [
  loginUrl,
  base = "http://localhost:5173",
  // Screenshots land here (git-ignored by default).
  outDir = process.env.HIVE_SMOKE_OUT ?? "smoke-out",
] = process.argv.slice(2);
if (!loginUrl) {
  console.error("usage: node live-launch.mjs <login URL> [base] [outDir]");
  process.exit(2);
}
const NEW_VOLUME = process.env.HIVE_LIVE_NEW_VOLUME === "1";
// The one-shot login lands in the account's first project; the test
// project is where the zone, networks and quota for the smoke run live.
const PROJECT = process.env.HIVE_LIVE_PROJECT ?? "pt-50";
const NAME = `hive-smoke-${Date.now().toString(36)}`;
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));

/** A same-origin API call from inside the page, with its session cookie. */
async function api(path) {
  return page.evaluate(async (p) => {
    const r = await fetch(p, { credentials: "same-origin" });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, path);
}

let launched = false;
let failed = false;
try {
  await page.goto(loginUrl);
  await page.waitForURL((url) => url.origin === new URL(base).origin, {
    timeout: 30_000,
  });
  await page.waitForSelector("main h1");
  const me = await api("/api/me");
  const target = me.body.projects.find((p) => p.name === PROJECT);
  if (!target) throw new Error(`project ${PROJECT} not available`);
  if (me.body.project.id !== target.id) {
    await page.goto(`${base}/auth/switch/${target.id}`);
    await page.waitForURL(`${base}/`, { timeout: 30_000 });
  }
  const who = await api("/api/me");
  console.log(`logged in as ${who.body.user.name} in ${who.body.project.name}`);

  await page.goto(`${base}/compute/instances/launch`);
  await page
    .getByRole("textbox", { name: "Instance name" })
    .waitFor({ timeout: 180_000 });
  await page
    .waitForLoadState("networkidle", { timeout: 60_000 })
    .catch(() => {});
  await page.getByRole("textbox", { name: "Instance name" }).fill(NAME);
  await page.getByRole("button", { name: /Availability zone/ }).click();
  // rctest smoke runs use the ardctest-artm zone wherever possible.
  const preferred = page.getByRole("option", {
    name: "ardctest-artm",
    exact: true,
  });
  const zone = (await preferred.count())
    ? preferred
    : page.getByRole("option").first();
  console.log("zone:", await zone.innerText());
  await zone.click();
  await page.getByRole("button", { name: "Next" }).click();

  await page
    .getByRole("searchbox", { name: "Search sources" })
    .fill("Ubuntu 24.04");
  const image = page.getByRole("radio").first();
  await image.waitFor();
  const imageLabel = await page
    .locator("label")
    .filter({ has: image })
    .innerText()
    .catch(() => "?");
  console.log("image:", imageLabel.split("\n")[0]);
  await page
    .getByText(/Ubuntu 24\.04/)
    .first()
    .click();
  console.log(
    "selected row:",
    (
      await page
        .getByText(/^Selected:/)
        .locator("..")
        .innerText()
    ).replace(/\s+/g, " "),
  );
  if (NEW_VOLUME) {
    await page.getByText("Create a new volume from the image").click();
    const size = page.getByRole("textbox", { name: /Volume size/ });
    await size.waitFor();
    console.log("volume size:", await size.inputValue());
    await page.getByRole("button", { name: /Volume type/ }).click();
    const types = await page.getByRole("option").allInnerTexts();
    console.log("volume types:", types.join(" | "));
    await page.getByRole("option").first().click();
    await page
      .getByText("Delete the volume when the instance is deleted")
      .click();
  }
  await page.getByRole("button", { name: "Next" }).click();

  // The class tabs first, then the cheapest non-preemptible flavour.
  // The class cards are React Aria radios whose label is the card.
  const classes = page.getByRole("radiogroup", { name: "Flavour class" });
  console.log(
    "flavour classes:",
    (
      await classes
        .getByRole("radio")
        .evaluateAll((inputs) =>
          inputs.map(
            (i) => i.closest("label")?.innerText.replace(/\n/g, " - ") ?? "?",
          ),
        )
    ).join(" | "),
  );
  await classes
    .getByText(/Balanced|standard/)
    .first()
    .click();
  const flavourRow = page
    .getByRole("row")
    .filter({ hasText: /^(?!.*Preemptible)/ })
    .nth(1);
  console.log("flavour:", (await flavourRow.innerText()).replace(/\s+/g, " "));
  await flavourRow.click();
  if (NEW_VOLUME) {
    console.log(
      "summary volume:",
      (
        await page.getByRole("complementary", { name: "Summary" }).innerText()
      ).match(/Volume\s*\n?[^\n]*/)?.[0],
    );
  }
  await page.getByRole("button", { name: "Next" }).click();
  console.log(
    "networks checked:",
    await page.getByRole("checkbox", { checked: true }).count(),
  );
  if (NEW_VOLUME) {
    // Tick a second network when one is offered and make it the first
    // interface.
    const unchecked = page.getByRole("checkbox", { checked: false }).first();
    if (await unchecked.count()) {
      // RAC checkboxes are hidden inputs: click the label around it.
      await page.locator("label").filter({ has: unchecked }).first().click();
      // Drag the new row to the top from the keyboard: the handle lifts
      // it, ArrowUp picks the drop point before the first row, Enter drops.
      await page
        .getByRole("button", { name: /^Drag / })
        .last()
        .focus();
      await page.keyboard.press("Enter");
      // The drop targets appear once the drag starts; wait for the one
      // before the first row, move to it, then drop.
      const before = page
        .getByRole("button", { name: /^Insert before / })
        .first();
      await before.waitFor({ timeout: 10_000 });
      await page.keyboard.press("ArrowUp");
      await page.waitForTimeout(300);
      await page.keyboard.press("Enter");
      console.log(
        "interface order:",
        (
          await page.getByRole("grid", { name: "Interface order" }).innerText()
        ).replace(/\s+/g, " "),
      );
    }
  }
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  // The step list also has a "Key pair" button, and the select is named by
  // its value (a sole key pair is preselected) and its label, so look inside
  // the step's own panel.
  await page
    .getByRole("group", { name: "Key pair" })
    .getByRole("button", { name: /Key pair/ })
    .click();
  await page.getByRole("option").nth(1).click();
  await page.getByRole("button", { name: "Next" }).click();
  console.log(
    "summary:",
    (
      await page.getByRole("complementary", { name: "Summary" }).innerText()
    ).replace(/\n/g, " | "),
  );
  await page.getByRole("button", { name: "Launch", exact: true }).click();
  launched = true;
  await page.waitForURL(/\/compute\/instances$/, { timeout: 60_000 });
  console.log(
    "launched; toast:",
    await page.locator("[role=alertdialog]").allInnerTexts(),
  );

  const link = page
    .getByRole("grid", { name: "Instances" })
    .getByRole("link", { name: NAME });
  await link.waitFor({ timeout: 60_000 });
  await link.click();
  await page
    .getByRole("heading", { name: NAME, level: 1 })
    .waitFor({ timeout: 30_000 });
  const started = Date.now();
  while (Date.now() - started < 240_000) {
    const pill = await page
      .locator("main [data-tone]")
      .first()
      .innerText()
      .catch(() => "");
    if (pill === "ACTIVE" || pill === "ERROR") break;
    await page.waitForTimeout(5000);
  }
  console.log(
    "status:",
    await page.locator("main [data-tone]").first().innerText(),
  );
  // The detail route carries the instance id; its API detail has the fault
  // and the boot volume, which the tabs below do not spell out.
  const instanceId = page
    .url()
    .split("/compute/instances/")[1]
    ?.split(/[/?#]/)[0];
  if (instanceId) {
    const detail = await api(`/api/compute/instances/${instanceId}`);
    const body = detail.body ?? {};
    if (body.fault)
      console.log("fault:", JSON.stringify(body.fault).slice(0, 400));
    const volumes = await api(`/api/compute/instances/${instanceId}/volumes`);
    console.log(
      "volumes:",
      JSON.stringify(volumes.body?.items ?? volumes.body).slice(0, 300),
    );
  }
  await page.getByRole("tab", { name: "Interfaces" }).click();
  await page
    .waitForLoadState("networkidle", { timeout: 60_000 })
    .catch(() => {});
  console.log(
    "interfaces:",
    (await page.getByRole("tabpanel", { name: "Interfaces" }).innerText())
      .replace(/\s+/g, " ")
      .slice(0, 300),
  );
  await page.getByRole("tab", { name: "Log", exact: true }).click();
  await page
    .waitForLoadState("networkidle", { timeout: 60_000 })
    .catch(() => {});
  console.log(
    "log head:",
    (await page.getByRole("tabpanel", { name: "Log" }).innerText())
      .replace(/\s+/g, " ")
      .slice(0, 160),
  );
  await page.getByRole("tab", { name: "Action log" }).click();
  await page
    .waitForLoadState("networkidle", { timeout: 60_000 })
    .catch(() => {});
  console.log(
    "actions:",
    (await page.getByRole("tabpanel", { name: "Action log" }).innerText())
      .replace(/\s+/g, " ")
      .slice(0, 200),
  );
  await page.screenshot({
    path: join(outDir, "live-instance.png"),
    fullPage: true,
  });
} catch (error) {
  failed = true;
  console.log(`FAILED: ${error instanceof Error ? error.message : error}`);
} finally {
  if (launched) await deleteInstance();
  await browser.close();
}
process.exitCode = failed ? 1 : 0;

// Clean up through the instance's own action menu, starting from the list
// so it works whichever step failed.
async function deleteInstance() {
  try {
    await page.goto(`${base}/compute/instances`);
    const row = page
      .getByRole("grid", { name: "Instances" })
      .getByRole("link", { name: NAME });
    await row.waitFor({ timeout: 60_000 });
    await row.click();
    await page
      .getByRole("heading", { name: NAME, level: 1 })
      .waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Delete instance" }).click();
    await page
      .getByRole("dialog", { name: /Delete/ })
      .getByRole("button", { name: "Delete" })
      .click();
    await page.waitForTimeout(3000);
    console.log(
      "delete toast:",
      await page.locator("[role=alertdialog]").allInnerTexts(),
    );
    await page.goto(`${base}/compute/instances`);
    await page
      .waitForLoadState("networkidle", { timeout: 60_000 })
      .catch(() => {});
    console.log(
      "list after delete:",
      (await page.locator("[role=status]").allInnerTexts()).filter(Boolean),
    );
  } catch (error) {
    failed = true;
    console.log(
      `CLEANUP FAILED: delete ${NAME} by hand (${error instanceof Error ? error.message : error})`,
    );
  }
}
