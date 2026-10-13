// Launch one small instance on rctest (pt-50) through the real wizard, wait
// for it to become ACTIVE, exercise the detail tabs, then delete it.
//   node live-launch.mjs <one-shot login URL> [base]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [loginUrl, base = "http://localhost:5173"] = process.argv.slice(2);
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

await page.goto(loginUrl);
await page.waitForURL((url) => url.origin === new URL(base).origin, {
  timeout: 30_000,
});
await page.waitForSelector("main h1");
console.log("logged in");

await page.goto(`${base}/compute/instances/launch`);
await page
  .getByRole("textbox", { name: "Instance name" })
  .waitFor({ timeout: 180_000 });
await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
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
await page.getByRole("button", { name: "Next" }).click();

const flavourRow = page
  .getByRole("row")
  .filter({ hasText: /^(?!.*Preemptible)/ })
  .nth(1);
console.log("flavour:", (await flavourRow.innerText()).replace(/\s+/g, " "));
await flavourRow.click();
await page.getByRole("button", { name: "Next" }).click();
console.log(
  "networks checked:",
  await page.getByRole("checkbox", { checked: true }).count(),
);
await page.getByRole("button", { name: "Next" }).click();
await page.getByRole("button", { name: "Next" }).click();
await page.getByRole("button", { name: /Key pair/ }).click();
await page.getByRole("option").nth(1).click();
await page.getByRole("button", { name: "Next" }).click();
console.log(
  "summary:",
  (
    await page.getByRole("complementary", { name: "Summary" }).innerText()
  ).replace(/\n/g, " | "),
);
await page.getByRole("button", { name: "Launch", exact: true }).click();
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
await page.getByRole("tab", { name: "Interfaces" }).click();
await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
console.log(
  "interfaces:",
  (await page.getByRole("tabpanel", { name: "Interfaces" }).innerText())
    .replace(/\s+/g, " ")
    .slice(0, 300),
);
await page.getByRole("tab", { name: "Log", exact: true }).click();
await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
console.log(
  "log head:",
  (await page.getByRole("tabpanel", { name: "Log" }).innerText())
    .replace(/\s+/g, " ")
    .slice(0, 160),
);
await page.getByRole("tab", { name: "Action log" }).click();
await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
console.log(
  "actions:",
  (await page.getByRole("tabpanel", { name: "Action log" }).innerText())
    .replace(/\s+/g, " ")
    .slice(0, 200),
);
await page.screenshot({
  path: join(OUT, "live-instance.png"),
  fullPage: true,
});

// Clean up through the page's own action menu.
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
await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
console.log(
  "list after delete:",
  (await page.locator("[role=status]").allInnerTexts()).filter(Boolean),
);
await browser.close();
