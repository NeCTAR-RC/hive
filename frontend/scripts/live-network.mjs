#!/usr/bin/env node
// Exercise the Network panels against rctest through a running Hive: switch
// to pt-50, create a network with a subnet through the real dialog, create
// a router with a gateway on the floating network, add the subnet as an
// interface, allocate a floating IP, then undo it all through the pages:
// release the IP, remove the interface, delete the router and the network.
// Cleans up by API if a step fails.
//
//   node scripts/live-network.mjs <one-shot login URL> [base] [project name]
import { chromium } from "@playwright/test";

const [
  loginUrl,
  base = "http://localhost:5173",
  projectName = "pt-50",
  // Smoke runs on rctest use the ardctest-artm floating network.
  floatingName = "ardctest-artm",
] = process.argv.slice(2);
if (!loginUrl) {
  console.error(
    "usage: live-network.mjs <one-shot login URL> [base] [project] [floating network]",
  );
  process.exit(2);
}
const NAME = `hive-smoke-${Date.now().toString(36)}`;
const CIDR = `10.${200 + (Date.now() % 50)}.0.0/24`;
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
let networkId = null;
let routerId = null;
let fipId = null;
let interfacePortId = null;

async function csrf() {
  const cookie = (await context.cookies()).find((c) => c.name === "hive_csrf");
  return cookie?.value ?? "";
}

async function toasts() {
  return (await page.locator("[role=alertdialog]").allInnerTexts()).map((t) =>
    t.replace(/\s+/g, " ").trim(),
  );
}

async function cleanup() {
  const headers = { "X-CSRF-Token": await csrf() };
  if (fipId) {
    await page.request
      .delete(`${base}/api/network/floating-ips/${fipId}`, { headers })
      .catch(() => {});
  }
  if (routerId && interfacePortId) {
    await page.request
      .delete(
        `${base}/api/network/routers/${routerId}/interfaces/${interfacePortId}`,
        { headers },
      )
      .catch(() => {});
  }
  if (routerId) {
    await page.request
      .delete(`${base}/api/network/routers/${routerId}`, { headers })
      .catch(() => {});
  }
  if (networkId) {
    await page.request
      .delete(`${base}/api/network/networks/${networkId}`, { headers })
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
    await page.request.get(`${base}/api/network/options`)
  ).json();
  console.log(
    "extensions:",
    Object.entries(options.extensions ?? {})
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", "),
    "| floating networks:",
    (options.floating_networks ?? []).map((n) => n.name).join(", "),
    "| quota:",
    ["network", "subnet", "router", "floatingip"]
      .map(
        (r) => `${r} ${options.quota?.[r]?.used}/${options.quota?.[r]?.limit}`,
      )
      .join(", "),
    "| errors:",
    JSON.stringify(options.errors),
  );

  // --- network with a subnet ---
  await page.goto(`${base}/network/networks`);
  await page.getByRole("button", { name: "Create network" }).click();
  const create = page.getByRole("dialog", { name: "Create network" });
  await create.getByRole("textbox", { name: "Network name" }).fill(NAME);
  await create.getByRole("textbox", { name: "Network address" }).fill(CIDR);
  await create.getByRole("button", { name: "Create network" }).click();
  await page.locator("[role=alertdialog]").first().waitFor({ timeout: 60_000 });
  console.log("create network toast:", await toasts());
  const link = page
    .getByRole("grid", { name: "Networks" })
    .getByRole("link", { name: NAME, exact: true });
  await link.waitFor({ timeout: 60_000 });
  networkId = new URL(await link.getAttribute("href"), base).pathname
    .split("/")
    .pop();
  console.log("network id:", networkId);
  await link.click();
  await page
    .getByRole("heading", { name: NAME, level: 1 })
    .waitFor({ timeout: 30_000 });
  await page.getByRole("tab", { name: "Subnets" }).click();
  console.log(
    "subnets:",
    await page
      .getByRole("grid", { name: "Subnets" })
      .getByRole("row")
      .allInnerTexts(),
  );

  // --- router with a gateway ---
  await page.goto(`${base}/network/routers`);
  await page.getByRole("button", { name: "Create router" }).click();
  const router = page.getByRole("dialog", { name: "Create router" });
  await router.getByRole("textbox", { name: "Router name" }).fill(NAME);
  await router.getByRole("button", { name: /External network/ }).click();
  const gateway = page.getByRole("option", { name: floatingName, exact: true });
  if (await gateway.count()) {
    await gateway.click();
  } else {
    console.log(
      "no option named",
      floatingName,
      "; options:",
      await page.getByRole("option").allInnerTexts(),
    );
    await page.getByRole("option").nth(1).click();
  }
  await router.getByRole("button", { name: "Create router" }).click();
  await page.locator("[role=alertdialog]").first().waitFor({ timeout: 60_000 });
  console.log("create router toast:", await toasts());
  const routerLink = page
    .getByRole("grid", { name: "Routers" })
    .getByRole("link", { name: NAME, exact: true });
  await routerLink.waitFor({ timeout: 60_000 });
  routerId = new URL(await routerLink.getAttribute("href"), base).pathname
    .split("/")
    .pop();
  console.log("router id:", routerId);

  // --- interface on the new subnet ---
  await page.goto(`${base}/network/routers/${routerId}?tab=interfaces`);
  await page.getByRole("button", { name: "Add interface" }).click();
  const iface = page.getByRole("dialog", { name: /Add interface/ });
  await iface.getByRole("button", { name: /Subnet/ }).click();
  const subnetOption = page.getByRole("option", { name: new RegExp(NAME) });
  console.log(
    "subnet options:",
    await page.getByRole("option").allInnerTexts(),
  );
  await subnetOption.first().click();
  await iface.getByRole("button", { name: "Add interface" }).click();
  await page.locator("[role=alertdialog]").first().waitFor({ timeout: 60_000 });
  console.log("add interface toast:", await toasts());
  await page.waitForTimeout(3000);
  const detail = await (
    await page.request.get(`${base}/api/network/routers/${routerId}`)
  ).json();
  interfacePortId =
    (detail.interfaces ?? []).find((p) => p.kind === "interface")?.id ?? null;
  console.log(
    "interfaces:",
    (detail.interfaces ?? []).map(
      (p) =>
        `${p.kind} ${p.network_name} ${p.fixed_ips.map((ip) => ip.ip_address).join(",")}`,
    ),
  );

  // --- floating IP ---
  await page.goto(`${base}/network/floating-ips`);
  const allocate = page.getByRole("button", { name: /Allocate IP to project/ });
  if (await allocate.isDisabled()) {
    console.log("floating IP quota exhausted; skipping allocation");
  } else {
    await allocate.click();
    const dialog = page.getByRole("dialog", { name: "Allocate floating IP" });
    // Several pools on rctest: take the ardctest-artm one.
    await dialog.getByRole("button", { name: /Pool/ }).click();
    const pool = page.getByRole("option", { name: floatingName, exact: true });
    if (await pool.count()) await pool.click();
    else await page.getByRole("option").first().click();
    await dialog.getByRole("textbox", { name: "Description" }).fill(NAME);
    await dialog.getByRole("button", { name: "Allocate IP" }).click();
    await page
      .locator("[role=alertdialog]")
      .first()
      .waitFor({ timeout: 60_000 });
    console.log("allocate toast:", await toasts());
    const fips = await (
      await page.request.get(`${base}/api/network/floating-ips`)
    ).json();
    const mine = fips.items.find((f) => f.description === NAME);
    fipId = mine?.id ?? null;
    console.log(
      "floating ip:",
      mine?.floating_ip_address,
      "pool:",
      mine?.pool_name,
    );
    const targets = await (
      await page.request.get(`${base}/api/network/floating-ips/targets`)
    ).json();
    console.log("targets:", targets.items.map((t) => t.name).slice(0, 5));
    if (fipId) {
      const row = page
        .getByRole("grid", { name: "Floating IPs" })
        .getByRole("row", {
          name: new RegExp(mine.floating_ip_address.replace(/\./g, "\\.")),
        });
      await row.getByRole("button", { name: "Actions" }).click();
      await page.getByRole("menuitem", { name: "Release floating IP" }).click();
      await page
        .getByRole("dialog", { name: /Release floating IP/ })
        .getByRole("button", { name: "Release" })
        .click();
      await page.waitForTimeout(2000);
      console.log("release toast:", await toasts());
      fipId = null;
    }
  }

  await page
    .screenshot({
      path: "/tmp/claude-1000/-home-sam-projects-nectar-hive/0e7a60ed-707d-4d4d-8a7a-7b90458a8566/scratchpad/smoke-m3/live-topology.png",
      fullPage: true,
    })
    .catch(() => {});
  await page.goto(`${base}/network/topology`);
  await page
    .getByRole("heading", { name: "Network Topology", level: 1 })
    .waitFor();
  await page
    .waitForLoadState("networkidle", { timeout: 60_000 })
    .catch(() => {});
  console.log(
    "topology networks:",
    await page
      .getByRole("list", { name: "Networks" })
      .getByRole("heading", { level: 2 })
      .allInnerTexts(),
  );
  await page
    .screenshot({
      path: "/tmp/claude-1000/-home-sam-projects-nectar-hive/0e7a60ed-707d-4d4d-8a7a-7b90458a8566/scratchpad/smoke-m3/live-topology.png",
      fullPage: true,
    })
    .catch(() => {});

  // --- undo through the pages ---
  await page.goto(`${base}/network/routers/${routerId}?tab=interfaces`);
  // A row is named by its row header (the port id), so match on the
  // network link inside it instead.
  const ifaceRow = page
    .getByRole("grid", { name: "Interfaces" })
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: NAME, exact: true }) });
  await ifaceRow.first().getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Delete interface" }).click();
  await page
    .getByRole("dialog", { name: /Delete interface/ })
    .getByRole("button", { name: "Delete" })
    .click();
  await page.waitForTimeout(2000);
  console.log("delete interface toast:", await toasts());
  interfacePortId = null;

  await page.getByRole("button", { name: "Actions" }).first().click();
  await page.getByRole("menuitem", { name: "Delete router" }).click();
  await page
    .getByRole("dialog", { name: /Delete router/ })
    .getByRole("button", { name: "Delete" })
    .click();
  await page.waitForTimeout(2000);
  console.log("delete router toast:", await toasts());
  routerId = null;

  await page.goto(`${base}/network/networks/${networkId}`);
  await page
    .getByRole("heading", { name: NAME, level: 1 })
    .waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Delete network" }).click();
  await page
    .getByRole("dialog", { name: /Delete network/ })
    .getByRole("button", { name: "Delete" })
    .click();
  await page.waitForTimeout(2000);
  console.log("delete network toast:", await toasts());
  networkId = null;
  await page.goto(`${base}/network/networks`);
  await page
    .waitForLoadState("networkidle", { timeout: 60_000 })
    .catch(() => {});
  console.log(
    "networks after delete:",
    await page
      .getByRole("grid", { name: "Networks" })
      .getByRole("link")
      .allInnerTexts(),
  );
} catch (error) {
  console.log("FAILED:", String(error).slice(0, 500));
  await page
    .screenshot({
      path: "/tmp/claude-1000/-home-sam-projects-nectar-hive/0e7a60ed-707d-4d4d-8a7a-7b90458a8566/scratchpad/smoke-m3/live-network-failure.png",
      fullPage: true,
    })
    .catch(() => {});
  await cleanup();
  process.exitCode = 1;
} finally {
  await browser.close();
}
