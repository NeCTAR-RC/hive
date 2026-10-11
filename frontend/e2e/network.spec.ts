import {
  expect,
  expectNoHorizontalScroll,
  expectNoSeriousA11yIssues,
  test,
} from "./fixtures";

test.describe("networks", () => {
  test("lists networks with subnets, classic first", async ({ page }) => {
    await page.goto("/network/networks");
    await expect(
      page.getByRole("heading", { name: "Networks", level: 1 }),
    ).toBeVisible();
    const table = page.getByRole("grid", { name: "Networks" });
    const rows = table.getByRole("row");
    await expect(rows.nth(1)).toContainText("classic");
    await expect(
      table.getByRole("link", { name: "private-net" }),
    ).toBeVisible();
    await expect(table.getByText("10.0.0.0/24")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("creates a network with a subnet and default name servers", async ({
    page,
  }) => {
    await page.goto("/network/networks");
    await page.getByRole("button", { name: "Create network" }).click();
    const dialog = page.getByRole("dialog", { name: "Create network" });
    await dialog.getByRole("textbox", { name: "Network name" }).fill("backend");
    await expect(
      dialog.getByRole("textbox", { name: "DNS name servers" }),
    ).toHaveValue("1.1.1.1\n1.0.0.1");
    await dialog.getByRole("button", { name: "Create network" }).click();
    await expect(dialog.getByText("Specify a network address")).toBeVisible();
    await dialog
      .getByRole("textbox", { name: "Network address" })
      .fill("10.5.0.1/32");
    await dialog.getByRole("button", { name: "Create network" }).click();
    await expect(dialog.getByText(/too small/)).toBeVisible();
    await dialog
      .getByRole("textbox", { name: "Network address" })
      .fill("10.5.0.0/24");
    await expectNoSeriousA11yIssues(page);
    await dialog.getByRole("button", { name: "Create network" }).click();
    await expect(page.getByText("Created network backend.")).toBeVisible();
    await expect(
      page.getByRole("grid", { name: "Networks" }).getByRole("link", {
        name: "backend",
      }),
    ).toBeVisible();
  });

  test("shows a network with its subnets and ports", async ({ page }) => {
    await page.goto("/network/networks/net-private?tab=subnets");
    await expect(
      page.getByRole("heading", { name: "private-net", level: 1 }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("grid", { name: "Subnets" })
        .getByRole("link", { name: "private-subnet" }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
    await page.goto("/network/networks/net-private?tab=ports");
    const ports = page.getByRole("grid", { name: "Ports" });
    await expect(ports.getByRole("link", { name: "spare-port" })).toBeVisible();
    await page.getByRole("button", { name: "Create port" }).click();
    const dialog = page.getByRole("dialog", { name: /Create port/ });
    await dialog.getByRole("textbox", { name: "Port name" }).fill("extra");
    await dialog.getByRole("button", { name: "Create port" }).click();
    await expect(page.getByText(/Created port extra/)).toBeVisible();
  });
});

test.describe("routers", () => {
  test("lists routers and their gateways", async ({ page, isMobile }) => {
    await page.goto("/network/routers");
    await expect(
      page.getByRole("heading", { name: "Routers", level: 1 }),
    ).toBeVisible();
    const row = page
      .getByRole("grid", { name: "Routers" })
      .getByRole("row", { name: /default/ });
    await expect(row).toContainText("ardctest-artm");
    if (!isMobile) await expect(row).toContainText("203.0.113.50");
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("creates a router with a floating gateway", async ({ page }) => {
    await page.goto("/network/routers");
    await page.getByRole("button", { name: "Create router" }).click();
    const dialog = page.getByRole("dialog", { name: "Create router" });
    await dialog.getByRole("textbox", { name: "Router name" }).fill("edge");
    await dialog.getByRole("button", { name: /External network/ }).click();
    await page.getByRole("option", { name: "ardctest-artm" }).click();
    await dialog.getByRole("button", { name: "Create router" }).click();
    await expect(page.getByText("Router edge was created.")).toBeVisible();
    await expect(
      page.getByRole("grid", { name: "Routers" }).getByRole("link", {
        name: "edge",
      }),
    ).toBeVisible();
  });

  test("adds an interface and a static route", async ({ page }) => {
    await page.goto("/network/routers/r-2?tab=interfaces");
    await expect(
      page.getByRole("heading", { name: "backup", level: 1 }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add interface" }).click();
    const dialog = page.getByRole("dialog", { name: /Add interface/ });
    await dialog.getByRole("button", { name: /Subnet/ }).click();
    await page.getByRole("option", { name: /10\.0\.0\.0\/24/ }).click();
    await dialog.getByRole("button", { name: "Add interface" }).click();
    await expect(page.getByText(/Interface added/)).toBeVisible();
    await expect(
      page.getByRole("grid", { name: "Interfaces" }).getByText("10.0.0.1"),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);

    await page.goto("/network/routers/r-1?tab=routes");
    await page.getByRole("button", { name: "Add static route" }).click();
    const route = page.getByRole("dialog", { name: /Add static route/ });
    await route.getByRole("textbox", { name: "Destination CIDR" }).fill("bad");
    await route.getByRole("textbox", { name: "Next hop" }).fill("10.0.0.7");
    await route.getByRole("button", { name: "Add route" }).click();
    await expect(route.getByText(/Enter a CIDR/)).toBeVisible();
    await route
      .getByRole("textbox", { name: "Destination CIDR" })
      .fill("10.8.0.0/16");
    await route.getByRole("button", { name: "Add route" }).click();
    await expect(page.getByText("Static route added.")).toBeVisible();
    await expect(
      page
        .getByRole("grid", { name: "Static routes" })
        .getByText("10.8.0.0/16"),
    ).toBeVisible();
  });
});

test.describe("floating IPs", () => {
  test("lists floating IPs with their instances", async ({ page }) => {
    await page.goto("/network/floating-ips");
    await expect(
      page.getByRole("heading", { name: "Floating IPs", level: 1 }),
    ).toBeVisible();
    const table = page.getByRole("grid", { name: "Floating IPs" });
    await expect(table.getByText("203.0.113.100")).toBeVisible();
    await expect(
      table.getByRole("link", { name: "db-1 10.0.0.5" }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("allocates and associates a floating IP", async ({ page }) => {
    await page.goto("/network/floating-ips");
    await page.getByRole("button", { name: "Allocate IP to project" }).click();
    const dialog = page.getByRole("dialog", { name: "Allocate floating IP" });
    await expect(dialog.getByRole("button", { name: /Pool/ })).toContainText(
      "ardctest-artm",
    );
    await dialog.getByRole("button", { name: "Allocate IP" }).click();
    await expect(
      page.getByText(/Allocated floating IP 203\.0\.113\./),
    ).toBeVisible();

    const row = page
      .getByRole("grid", { name: "Floating IPs" })
      .getByRole("row", { name: /203\.0\.113\.101/ });
    await row.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Associate" }).click();
    const associate = page.getByRole("dialog", {
      name: /Associate 203\.0\.113\.101/,
    });
    await associate.getByRole("button", { name: /Port to associate/ }).click();
    // The database instance already holds a floating IP; the spare port is free.
    await page.getByRole("option", { name: /spare-port 10\.0\.0\.20/ }).click();
    await associate
      .getByRole("button", { name: "Associate", exact: true })
      .click();
    await expect(
      page.getByText(/Floating IP 203\.0\.113\.101 associated with/),
    ).toBeVisible();
  });

  test("associates a floating IP from the instance menu", async ({ page }) => {
    await page.goto("/compute/instances/i-web-1");
    await page.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Associate floating IP" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Associate a floating IP with web-1",
    });
    await expect(dialog.getByText("No reachable ports")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/compute/instances/i-db-1");
    await page.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Associate floating IP" }).click();
    const db = page.getByRole("dialog", {
      name: "Associate a floating IP with db-1",
    });
    await db.getByRole("button", { name: /Floating IP/ }).click();
    await page.getByRole("option", { name: /203\.0\.113\.101/ }).click();
    await expect(
      db.getByRole("button", { name: /Port to associate/ }),
    ).toContainText("db-1 10.0.0.5");
    await expectNoSeriousA11yIssues(page);
    await db.getByRole("button", { name: "Associate", exact: true }).click();
    await expect(
      page.getByText(/already associated with another floating IP/),
    ).toBeVisible();
  });

  test("manages port forwarding rules", async ({ page }) => {
    await page.goto("/network/port-forwardings?floating_ip_id=fip-3");
    await expect(
      page.getByRole("heading", {
        name: "Port forwarding rules for 203.0.113.102",
        level: 1,
      }),
    ).toBeVisible();
    const table = page.getByRole("grid", { name: "Port forwarding rules" });
    await expect(table.getByText("203.0.113.102:2222")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Add rule" }).click();
    const dialog = page.getByRole("dialog", {
      name: /Add port forwarding rule/,
    });
    await dialog.getByRole("textbox", { name: "External port" }).fill("80:70");
    await dialog.getByRole("textbox", { name: "Internal port" }).fill("80");
    await dialog.getByRole("button", { name: "Add rule" }).click();
    await expect(dialog.getByText(/must not be after/)).toBeVisible();
    await dialog.getByRole("textbox", { name: "External port" }).fill("8080");
    await dialog.getByRole("button", { name: /Internal IP address/ }).click();
    await page.getByRole("option", { name: /spare-port 10\.0\.0\.20/ }).click();
    await dialog.getByRole("button", { name: "Add rule" }).click();
    await expect(
      page.getByText(/Added the TCP rule for port 8080/),
    ).toBeVisible();
    await expect(table.getByText("203.0.113.102:8080")).toBeVisible();
  });
});

test.describe("trunks and topology", () => {
  test("creates a trunk with a subport", async ({ page }) => {
    await page.goto("/network/trunks");
    await expect(
      page.getByRole("heading", { name: "Trunks", level: 1 }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("grid", { name: "Trunks" })
        .getByRole("link", { name: "trunk-1" }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Create trunk" }).click();
    const dialog = page.getByRole("dialog", { name: "Create trunk" });
    await dialog.getByRole("textbox", { name: "Trunk name" }).fill("trunk-2");
    // The database instance's port can be a parent; only a free port can
    // be a subport.
    await dialog.getByRole("button", { name: /Parent port/ }).click();
    await page.getByRole("option", { name: /10\.0\.0\.5/ }).click();
    await dialog.getByRole("button", { name: "Add subport" }).click();
    await dialog.getByRole("button", { name: /Subport 1/ }).click();
    await page.getByRole("option", { name: /spare-port/ }).click();
    await dialog.getByRole("textbox", { name: "VLAN id" }).fill("200");
    await dialog.getByRole("button", { name: "Create trunk" }).click();
    await expect(page.getByText("Created trunk trunk-2.")).toBeVisible();
  });

  test("lists the topology by network", async ({ page }) => {
    await page.goto("/network/topology");
    await expect(
      page.getByRole("heading", { name: "Network Topology", level: 1 }),
    ).toBeVisible();
    const external = page
      .getByRole("list", { name: "Networks" })
      .getByRole("listitem")
      .first();
    await expect(external).toContainText("ardctest-artm");
    await expect(external).toContainText("router gateway");
    await expect(
      page.getByRole("list", { name: "Connected to private-net" }),
    ).toContainText("db-1");
    await expect(page.getByText("Not connected to a network")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });
});
