import {
  clearFailure,
  expect,
  expectNoSeriousA11yIssues,
  failRequest,
  test,
} from "./fixtures";
import {
  checkPage,
  dialog,
  expectPage,
  expectSearchSurvivesBack,
  expectToast,
  main,
  openNav,
  openSection,
  row,
  rowAction,
  table,
} from "./helpers";

test.describe("networks", () => {
  test("lists networks with subnets, classic first", async ({ page }) => {
    await page.goto("/network/networks");
    await expectPage(page, "Networks");
    const networks = table(page, "Networks");
    // Row 0 is the header row.
    await expect(networks.getByRole("row").nth(1)).toContainText("classic");
    await expect(
      networks.getByRole("link", { name: "private-net" }),
    ).toBeVisible();
    await expect(networks.getByText("10.0.0.0/24")).toBeVisible();
    await checkPage(page);
  });

  test("creates a network with a subnet and no default name servers", async ({
    page,
  }) => {
    await page.goto("/network/networks");
    await page.getByRole("button", { name: "Create network" }).click();
    const create = dialog(page, "Create network");
    await create.getByRole("textbox", { name: "Network name" }).fill("backend");
    // The Nectar Horizon fork sets no default; the cloud's resolvers apply.
    await expect(
      create.getByRole("textbox", { name: "DNS name servers" }),
    ).toHaveValue("");
    await create.getByRole("button", { name: "Create network" }).click();
    await expect(create.getByText("Specify a network address")).toBeVisible();
    const address = create.getByRole("textbox", { name: "Network address" });
    await address.fill("10.5.0.1/32");
    await create.getByRole("button", { name: "Create network" }).click();
    await expect(create.getByText(/too small/)).toBeVisible();
    await address.fill("10.5.0.0/24");
    await expectNoSeriousA11yIssues(page);
    await create.getByRole("button", { name: "Create network" }).click();
    await expectToast(page, "Created network backend.");
    await expect(
      table(page, "Networks").getByRole("link", { name: "backend" }),
    ).toBeVisible();
  });

  test("checks the gateway, pools and MTU before creating", async ({
    page,
  }) => {
    await page.goto("/network/networks?create=true");
    const create = dialog(page, "Create network");
    await create
      .getByRole("textbox", { name: "Network address" })
      .fill("10.0.0.0/24");
    const gateway = create.getByRole("textbox", { name: "Gateway IP" });
    await gateway.fill("192.168.5.1");
    const mtu = create.getByRole("textbox", { name: "MTU" });
    await mtu.fill("99999");
    const pools = create.getByRole("textbox", { name: "Allocation pools" });
    await pools.fill("10.0.0.10-10.0.0.20");
    await create.getByRole("button", { name: "Create network" }).click();
    await expect(
      create.getByText("The gateway must be inside 10.0.0.0/24"),
    ).toBeVisible();
    await expect(
      create.getByText("The MTU runs from 68 to 9000 bytes"),
    ).toBeVisible();
    await expect(
      create.getByText(
        'Write "10.0.0.10-10.0.0.20" as a start and an end address, such as 10.0.0.10,10.0.0.20',
      ),
    ).toBeVisible();
    await gateway.fill("10.0.0.15");
    await mtu.fill("1450");
    await pools.fill("10.0.0.10,10.0.0.20");
    await create.getByRole("button", { name: "Create network" }).click();
    await expect(
      create.getByText(
        "The pool 10.0.0.10-10.0.0.20 holds the gateway 10.0.0.15",
      ),
    ).toBeVisible();
    await gateway.fill("10.0.0.1");
    await create.getByRole("button", { name: "Create network" }).click();
    await expectToast(page, /Created network/);
  });

  test("creates an IPv6 network without port security", async ({ page }) => {
    await page.goto("/network/networks?create=true");
    const create = dialog(page, "Create network");
    await create.getByRole("textbox", { name: "Network name" }).fill("v6");
    // React Aria hides the native inputs; the keyboard toggles them.
    const portSecurity = create.getByRole("switch", {
      name: /Enable port security/,
    });
    await portSecurity.focus();
    await portSecurity.press("Space");
    await expect(portSecurity).not.toBeChecked();
    const ipv6 = create.getByRole("radio", { name: "IPv6" });
    await ipv6.focus();
    await ipv6.press("Space");
    await create
      .getByRole("button", { name: /IPv6 address configuration mode/ })
      .click();
    await page
      .getByRole("option", {
        name: "SLAAC: address discovered from an OpenStack router",
      })
      .click();
    await create
      .getByRole("textbox", { name: "Network address" })
      .fill("fd00:1::/64");
    const mtu = create.getByRole("textbox", { name: "MTU" });
    await mtu.fill("1000");
    await create.getByRole("button", { name: "Create network" }).click();
    await expect(
      create.getByText("An IPv6 subnet needs an MTU of at least 1280 bytes"),
    ).toBeVisible();
    await mtu.fill("");
    await expectNoSeriousA11yIssues(page);
    await create.getByRole("button", { name: "Create network" }).click();
    await expectToast(page, "Created network v6.");
  });

  test("offers no delete for a network that still holds ports", async ({
    page,
  }) => {
    await page.goto("/network/networks/net-private");
    await expectPage(page, "private-net");
    await page.getByRole("button", { name: "Actions" }).click();
    const remove = page.getByRole("menuitem", {
      name: "Delete network",
      exact: true,
    });
    await expect(remove).toBeDisabled();
    await expect(remove).toHaveAccessibleDescription(
      "Remove the router interface and instance ports first",
    );
  });

  test("links each port to its instance or router", async ({ page }) => {
    await page.goto("/network/networks/net-private?tab=ports");
    const ports = table(page, "Ports");
    await expect(ports.getByRole("link", { name: "spare-port" })).toBeVisible();
    // The device column hides on a phone; the port page shows it anyway.
    await ports.getByRole("link", { name: "spare-port" }).click();
    await expectPage(page, "spare-port");
    await expect(main(page).getByText("Detached")).toBeVisible();

    await page.goto("/network/ports/port-db-2");
    await expect(
      main(page).getByRole("link", { name: "db-1", exact: true }),
    ).toHaveAttribute("href", "/compute/instances/i-db-1");
    await page.goto("/network/ports/port-router-1");
    await expect(
      main(page).getByRole("link", { name: "default", exact: true }),
    ).toHaveAttribute("href", "/network/routers/r-1");
  });

  test("adds and deletes an allowed address pair", async ({ page }) => {
    await page.goto("/network/ports/port-spare");
    await expectPage(page, "spare-port");
    const pairs = table(page, "Allowed address pairs");
    await expect(pairs.getByText("No allowed address pairs")).toBeVisible();
    await page.getByRole("button", { name: "Add pair" }).click();
    const add = dialog(page, /Add allowed address pair/);
    const address = add.getByRole("textbox", { name: "IP address or range" });
    await address.fill("10.0.0.300");
    await add.getByRole("button", { name: "Add pair" }).click();
    await expect(add.getByText(/Enter an IP address such as/)).toBeVisible();
    await address.fill("10.0.0.50");
    await expectNoSeriousA11yIssues(page);
    await add.getByRole("button", { name: "Add pair" }).click();
    await expectToast(page, "Allowed 10.0.0.50 on port spare-port.");
    await expect(pairs.getByText("10.0.0.50")).toBeVisible();

    await rowAction(row(pairs, "10.0.0.50"), "Delete address pair");
    await dialog(page, /Delete address pair/)
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(pairs.getByText("No allowed address pairs")).toBeVisible();
  });

  test("drops an error toast once the user moves to another page", async ({
    page,
  }) => {
    await page.goto("/network/routers/r-2");
    await expectPage(page, "backup");
    await failRequest(page, "DELETE", "/api/network/routers/r-2");
    await page.getByRole("button", { name: "Actions" }).click();
    await page
      .getByRole("menuitem", { name: "Delete router", exact: true })
      .click();
    await dialog(page, /Delete router backup/)
      .getByRole("button", { name: "Delete" })
      .click();
    await expectToast(page, /Could not delete router backup/);
    await clearFailure(page);
    // The error stays while the user is on the router's page...
    await openSection(page, "Interfaces");
    await expectToast(page, /Could not delete router backup/);
    // ...and goes when they leave it.
    await main(page).getByRole("link", { name: "Routers" }).first().click();
    await expectPage(page, "Routers");
    await expect(
      page
        .getByRole("region", { name: /notifications/i })
        .getByText(/Could not delete router backup/),
    ).toBeHidden();
  });

  test("shows a network with its subnets and ports", async ({ page }) => {
    await page.goto("/network/networks/net-private?tab=subnets");
    await expectPage(page, "private-net");
    await expect(
      table(page, "Subnets").getByRole("link", { name: "private-subnet" }),
    ).toBeVisible();
    await checkPage(page);
    await page.goto("/network/networks/net-private?tab=ports");
    await expect(
      table(page, "Ports").getByRole("link", { name: "spare-port" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create port" }).click();
    const create = dialog(page, /Create port/);
    await create.getByRole("textbox", { name: "Port name" }).fill("extra");
    await create.getByRole("button", { name: "Create port" }).click();
    await expectToast(page, /Created port extra/);
  });
});

test.describe("routers", () => {
  test("lists routers and their gateways", async ({ page }) => {
    await page.goto("/network/routers");
    await expectPage(page, "Routers");
    // The gateway's address column is hidden on a phone; its network shows.
    await expect(row(table(page, "Routers"), "default")).toContainText(
      "ardctest-artm",
    );
    await checkPage(page);
  });

  test("creates a router with a floating gateway", async ({ page }) => {
    await page.goto("/network/routers");
    await page.getByRole("button", { name: "Create router" }).click();
    const create = dialog(page, "Create router");
    await create.getByRole("textbox", { name: "Router name" }).fill("edge");
    await create.getByRole("button", { name: /External network/ }).click();
    await page.getByRole("option", { name: "ardctest-artm" }).click();
    await create.getByRole("button", { name: "Create router" }).click();
    await expectToast(page, "Router edge was created.");
    await expect(
      table(page, "Routers").getByRole("link", { name: "edge" }),
    ).toBeVisible();
  });

  test("adds an interface and a static route", async ({ page }) => {
    await page.goto("/network/routers/r-2?tab=interfaces");
    await expectPage(page, "backup");
    await page.getByRole("button", { name: "Add interface" }).click();
    const add = dialog(page, /Add interface/);
    await add.getByRole("button", { name: /Subnet/ }).click();
    await page.getByRole("option", { name: /10\.0\.0\.0\/24/ }).click();
    await add.getByRole("button", { name: "Add interface" }).click();
    await expectToast(page, /Interface added/);
    await expect(table(page, "Interfaces").getByText("10.0.0.1")).toBeVisible();
    await expectNoSeriousA11yIssues(page);

    await page.goto("/network/routers/r-1?tab=routes");
    await page.getByRole("button", { name: "Add static route" }).click();
    const route = dialog(page, /Add static route/);
    const destination = route.getByRole("textbox", {
      name: "Destination CIDR",
    });
    await destination.fill("bad");
    await route.getByRole("textbox", { name: "Next hop" }).fill("10.0.0.7");
    await route.getByRole("button", { name: "Add route" }).click();
    await expect(route.getByText(/Enter an address range/)).toBeVisible();
    await destination.fill("10.8.0.0/16");
    await route.getByRole("button", { name: "Add route" }).click();
    await expectToast(page, "Static route added.");
    await expect(
      table(page, "Static routes").getByText("10.8.0.0/16"),
    ).toBeVisible();
  });
});

test.describe("security groups", () => {
  test("checks the CIDR and fills in the user's own address", async ({
    page,
  }) => {
    await page.goto("/network/security-groups/secgroup-web");
    await page.getByRole("button", { name: "Add rule" }).click();
    const add = dialog(page, "Add rule to web");
    await add.getByRole("textbox", { name: "Port" }).fill("22");
    const cidr = add.getByRole("textbox", { name: "CIDR" });
    await cidr.fill("1.2.3.4/40");
    await add.getByRole("button", { name: "Add rule" }).click();
    await expect(
      add.getByText("Enter an address range such as 203.0.113.0/24"),
    ).toBeVisible();
    await add
      .getByRole("button", { name: "Use my address (198.51.100.23)" })
      .click();
    await expect(cidr).toHaveValue("198.51.100.23/32");
    await add.getByRole("button", { name: "Add rule" }).click();
    await expectToast(page, "Rule added to web.");
    await expect(
      table(page, "Rules").getByText("198.51.100.23/32"),
    ).toBeVisible();
  });

  test("lists groups and adds a rule, warning when open to the world", async ({
    page,
  }) => {
    await page.goto("/network/security-groups");
    await expectPage(page, "Security groups");
    await checkPage(page);
    await table(page, "Security groups")
      .getByRole("link", { name: "web", exact: true })
      .click();
    await expectPage(page, "web");
    const rules = table(page, "Rules");
    // A header row and three rules, two of them open to the internet.
    await expect(rules.getByRole("row")).toHaveCount(4);
    await expect(rules.getByText("Open to the internet")).toHaveCount(2);

    await page.getByRole("button", { name: "Add rule" }).click();
    const add = dialog(page, "Add rule to web");
    const cidr = add.getByRole("textbox", { name: "CIDR" });
    await add.getByRole("textbox", { name: "Port" }).fill("8080");
    await cidr.fill("0.0.0.0/0");
    await expect(
      add.getByText(/opens the port to every address/),
    ).toBeVisible();
    await cidr.fill("203.0.113.0/24");
    await add.getByRole("button", { name: "Add rule" }).click();
    await expectToast(page, "Rule added to web.");
    await expect(rules.getByRole("row")).toHaveCount(5);
    await expectNoSeriousA11yIssues(page);
  });

  test("Manage rules opens the group inside the app", async ({ page }) => {
    await page.goto("/network/security-groups");
    let loads = 0;
    page.on("load", () => {
      loads += 1;
    });
    await rowAction(row(table(page, "Security groups"), "web"), "Manage rules");
    await expectPage(page, "web");
    await expect(page).toHaveURL(/\/network\/security-groups\/secgroup-web$/);
    // A router navigation, not a document reload that drops the cache.
    expect(loads).toBe(0);
  });

  test("a preset rule opens only its own port", async ({ page }) => {
    await page.goto("/network/security-groups/secgroup-web");
    await page.getByRole("button", { name: "Add rule" }).click();
    const add = dialog(page, "Add rule to web");
    await add.getByRole("button", { name: /Rule$/ }).click();
    await page.getByRole("option", { name: "SSH (22)" }).click();
    await add.getByRole("textbox", { name: "CIDR" }).fill("198.51.100.0/24");
    await add.getByRole("button", { name: "Add rule" }).click();
    await expectToast(page, "Rule added to web.");
    await expect(
      row(table(page, "Rules"), /198\.51\.100\.0\/24/).getByRole("gridcell", {
        name: "22",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("keeps the create dialog in the address of the list", async ({
    page,
  }) => {
    await page.goto("/network/security-groups?create=true");
    const create = dialog(page, "Create security group");
    await expect(create).toBeVisible();
    await create.getByRole("button", { name: "Cancel" }).click();
    await expect(page).not.toHaveURL(/create/);
    await page.getByRole("button", { name: "Create security group" }).click();
    await expect(page).toHaveURL(/create=true/);
  });

  test("refuses an ICMP code without a type, and an unknown protocol", async ({
    page,
  }) => {
    await page.goto("/network/security-groups/secgroup-web");
    await page.getByRole("button", { name: "Add rule" }).click();
    const add = dialog(page, "Add rule to web");
    await add.getByRole("button", { name: /Rule$/ }).click();
    await page.getByRole("option", { name: "Custom ICMP rule" }).click();
    await add.getByRole("textbox", { name: "ICMP code" }).fill("3");
    await add.getByRole("textbox", { name: "CIDR" }).fill("198.51.100.0/24");
    await add.getByRole("button", { name: "Add rule" }).click();
    await expect(
      add.getByText("Enter an ICMP type to set a code"),
    ).toBeVisible();

    await add.getByRole("button", { name: /Rule$/ }).click();
    await page.getByRole("option", { name: "Other protocol" }).click();
    await add.getByRole("textbox", { name: "Protocol" }).fill("bogus");
    await add.getByRole("button", { name: "Add rule" }).click();
    await expect(
      add.getByText(
        "Enter a protocol name such as gre, or a number from 0 to 255",
      ),
    ).toBeVisible();
  });

  test("requires a remote for a new rule", async ({ page }) => {
    await page.goto("/network/security-groups/secgroup-web");
    await page.getByRole("button", { name: "Add rule" }).click();
    const add = dialog(page, "Add rule to web");
    await add.getByRole("textbox", { name: "Port" }).fill("22");
    await add.getByRole("button", { name: "Add rule" }).click();
    await expect(
      add.getByText("Enter an address range such as 203.0.113.0/24"),
    ).toBeVisible();
  });
});

test.describe("floating IPs", () => {
  test("lists floating IPs with their instances", async ({ page }) => {
    await page.goto("/network/floating-ips");
    await expectPage(page, "Floating IPs");
    const floatingIps = table(page, "Floating IPs");
    await expect(floatingIps.getByText("203.0.113.100")).toBeVisible();
    await expect(
      floatingIps.getByRole("link", { name: "db-1 10.0.0.5" }),
    ).toBeVisible();
    await checkPage(page);
  });

  test("allocates and associates a floating IP", async ({ page }) => {
    await page.goto("/network/floating-ips");
    await page.getByRole("button", { name: "Allocate IP to project" }).click();
    const allocate = dialog(page, "Allocate floating IP");
    await expect(allocate.getByRole("button", { name: /Pool/ })).toContainText(
      "ardctest-artm",
    );
    // The quota shows; choosing an address is for admins only.
    await expect(allocate.getByText("2 of 5")).toBeVisible();
    await expect(
      allocate.getByRole("textbox", { name: /Floating IP address/ }),
    ).toHaveCount(0);
    await allocate.getByRole("button", { name: "Allocate IP" }).click();
    await expectToast(page, /Allocated floating IP 203\.0\.113\./);

    await rowAction(
      row(table(page, "Floating IPs"), /203\.0\.113\.101/),
      "Associate",
    );
    const associate = dialog(page, /Associate 203\.0\.113\.101/);
    await associate.getByRole("button", { name: /Port to associate/ }).click();
    // A port address that already has a floating IP says which.
    await expect(
      page.getByRole("option", {
        name: /^db-1 10\.0\.0\.5 \(already has 203\.0\.113\.\d+\)$/,
      }),
    ).toBeVisible();
    // The database instance already holds a floating IP; the spare port is free.
    await page.getByRole("option", { name: /spare-port 10\.0\.0\.20/ }).click();
    await associate
      .getByRole("button", { name: "Associate", exact: true })
      .click();
    await expectToast(page, /Floating IP 203\.0\.113\.101 associated with/);
  });

  test("associates a floating IP from the instance menu", async ({ page }) => {
    // web-1 is on the classic network only: nothing a floating IP reaches.
    await page.goto("/compute/instances/i-web-1");
    await page.getByRole("button", { name: "Actions" }).click();
    const blocked = page.getByRole("menuitem", {
      name: "Associate floating IP",
      exact: true,
    });
    await expect(blocked).toBeDisabled();
    await expect(blocked).toHaveAccessibleDescription(/classic network/);
    await page.keyboard.press("Escape");

    await page.goto("/compute/instances/i-db-1");
    await page.getByRole("button", { name: "Actions" }).click();
    await page
      .getByRole("menuitem", { name: "Associate floating IP", exact: true })
      .click();
    const associate = dialog(page, "Associate a floating IP with db-1");
    await associate.getByRole("button", { name: /Floating IP/ }).click();
    await page.getByRole("option", { name: /203\.0\.113\.101/ }).click();
    await expect(
      associate.getByRole("button", { name: /Port to associate/ }),
    ).toContainText("db-1 10.0.0.5");
    await expectNoSeriousA11yIssues(page);
    await associate
      .getByRole("button", { name: "Associate", exact: true })
      .click();
    await expect(
      associate.getByText(/already associated with another floating IP/),
    ).toBeVisible();
  });

  test("manages port forwarding rules", async ({ page }) => {
    await page.goto("/network/port-forwardings?floating_ip_id=fip-3");
    await expectPage(page, "Port forwarding rules for 203.0.113.102");
    const rules = table(page, "Port forwarding rules");
    await expect(rules.getByText("203.0.113.102:2222")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Add rule" }).click();
    const add = dialog(page, /Add port forwarding rule/);
    const external = add.getByRole("textbox", { name: "External port" });
    await external.fill("80:70");
    await add.getByRole("textbox", { name: "Internal port" }).fill("80");
    await add.getByRole("button", { name: "Add rule" }).click();
    await expect(add.getByText(/must not be after/)).toBeVisible();
    // A range goes to one internal port or a range as long as itself.
    const internal = add.getByRole("textbox", { name: "Internal port" });
    await external.fill("2200:2210");
    await internal.fill("22:25");
    await add.getByRole("button", { name: "Add rule" }).click();
    await expect(
      add.getByText(
        "The internal port must be a single port or a range of 11 ports, as long as the external one",
      ),
    ).toBeVisible();
    await internal.fill("80");
    await external.fill("8080");
    await add.getByRole("button", { name: /Internal IP address/ }).click();
    await page.getByRole("option", { name: /spare-port 10\.0\.0\.20/ }).click();
    await add.getByRole("button", { name: "Add rule" }).click();
    await expectToast(page, /Added the TCP rule for port 8080/);
    await expect(rules.getByText("203.0.113.102:8080")).toBeVisible();
  });
});

test.describe("trunks and topology", () => {
  test("creates a trunk with a subport", async ({ page }) => {
    await page.goto("/network/trunks");
    await expectPage(page, "Trunks");
    await expect(
      table(page, "Trunks").getByRole("link", { name: "trunk-1" }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Create trunk" }).click();
    const create = dialog(page, "Create trunk");
    await create.getByRole("textbox", { name: "Trunk name" }).fill("trunk-2");
    // The database instance's port can be a parent; only a free port can
    // be a subport.
    await create.getByRole("button", { name: /Parent port/ }).click();
    await page.getByRole("option", { name: /10\.0\.0\.5/ }).click();
    await create.getByRole("button", { name: "Add subport" }).click();
    await create.getByRole("button", { name: /Subport 1/ }).click();
    await page.getByRole("option", { name: /spare-port/ }).click();
    await create.getByRole("textbox", { name: "VLAN id" }).fill("200");
    await create.getByRole("button", { name: "Create trunk" }).click();
    await expectToast(page, "Created trunk trunk-2.");
  });

  test("never offers the parent port as a subport", async ({ page }) => {
    await page.goto("/network/trunks?create=true");
    const create = dialog(page, "Create trunk");
    await create.getByRole("button", { name: /Parent port/ }).click();
    await page.getByRole("option", { name: /spare-port/ }).click();
    // The spare port was the only free one, so no subport is left.
    await expect(
      create.getByText(/No other free ports in this project/),
    ).toBeVisible();
    await expect(
      create.getByRole("button", { name: "Add subport" }),
    ).toBeDisabled();
  });

  test("lists the topology by network", async ({ page }) => {
    await page.goto("/network/topology");
    await expectPage(page, "Network topology");
    // The external network comes first, with the router's gateway on it.
    const first = page
      .getByRole("list", { name: "Networks" })
      .getByRole("listitem")
      .first();
    await expect(first).toContainText("ardctest-artm");
    await expect(first).toContainText("router gateway");
    await expect(
      page.getByRole("list", { name: "Connected to private-net" }),
    ).toContainText("db-1");
    // A router under one network names the others it joins.
    await expect(
      page.getByRole("list", { name: "Connected to private-net" }),
    ).toContainText("connects to ardctest-artm");
    await expect(
      main(page).getByRole("link", { name: "Launch instance" }),
    ).toHaveAttribute("href", "/compute/instances/launch");
    await expect(
      main(page).getByRole("link", { name: "Create network" }),
    ).toHaveAttribute("href", "/network/networks?create=true");
    await expect(
      main(page).getByRole("link", { name: "Create router" }),
    ).toHaveAttribute("href", "/network/routers?create=true");
    await expect(
      main(page).getByText("Not connected to a network"),
    ).toBeVisible();
    await checkPage(page);
  });
});

test("disables an interface subnet that overlaps one on the router", async ({
  page,
  isMobile,
}) => {
  // A full page load resets the mocks, so the network is made in-app.
  await page.goto("/network/networks?create=true");
  const create = dialog(page, "Create network");
  await create.getByRole("textbox", { name: "Network name" }).fill("twin");
  await create
    .getByRole("textbox", { name: "Network address" })
    .fill("10.0.0.0/24");
  await create.getByRole("button", { name: "Create network" }).click();
  await expectToast(page, "Created network twin.");
  const nav = await openNav(page, isMobile);
  await nav.getByRole("link", { name: "Routers", exact: true }).click();
  await table(page, "Routers").getByRole("link", { name: "default" }).click();
  await expectPage(page, "default");
  await openSection(page, "Interfaces");
  await page.getByRole("button", { name: "Add interface" }).click();
  await dialog(page, /Add interface/)
    .getByRole("button", { name: /Subnet/ })
    .click();
  await expect(
    page.getByRole("option", {
      name: /twin: 10\.0\.0\.0\/24 .*overlaps 10\.0\.0\.0\/24 on this router/,
    }),
  ).toHaveAttribute("aria-disabled", "true");
});

test("keeps the networks search when coming back to the list", async ({
  page,
}) => {
  await expectSearchSurvivesBack(page, {
    path: "/network/networks",
    table: "Networks",
    text: "private",
    link: "private-net",
  });
});
