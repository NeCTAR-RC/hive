import {
  expect,
  expectNoSeriousA11yIssues,
  failRequest,
  test,
} from "./fixtures";
import {
  checkPage,
  closeButton,
  dialog,
  expectPage,
  expectSearchSurvivesBack,
  expectToast,
  fillField,
  main,
  openSection,
  row,
  rowAction,
  table,
} from "./helpers";

test.describe("load balancers", () => {
  test("lists load balancers and shows the tree", async ({ page }) => {
    await page.goto("/load-balancers");
    const loadBalancers = table(page, "Load balancers");
    await expect(
      loadBalancers.getByRole("link", { name: "web" }),
    ).toBeVisible();
    await expect(loadBalancers.getByText("Active")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await loadBalancers.getByRole("link", { name: "web" }).click();
    await openSection(page, "Listeners");
    await expect(
      table(page, "Listeners").getByRole("link", { name: "http" }),
    ).toBeVisible();
    await openSection(page, "Pools");
    await table(page, "Pools").getByRole("link", { name: "web-pool" }).click();
    await expect(
      table(page, "Members").getByText("192.168.1.20:80"),
    ).toBeVisible();
    await expect(main(page).getByText("GET /healthz")).toBeVisible();
    await checkPage(page);
  });

  test("creates a load balancer through the wizard", async ({ page }) => {
    await page.goto("/load-balancers/new");
    await page.getByRole("textbox", { name: "Name" }).fill("api");
    await page.getByRole("button", { name: /Subnet/ }).click();
    await page.getByRole("option", { name: /private/ }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("textbox", { name: "Port" })).toHaveValue("80");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    // A member can be added only once an instance is chosen.
    const addInstance = page.getByRole("button", { name: "Add instance" });
    await expect(addInstance).toBeDisabled();
    await page.getByRole("button", { name: /Available instances/ }).click();
    await page.getByRole("option", { name: /db-1/ }).click();
    await addInstance.click();
    await expect(page.getByRole("textbox", { name: "IP address" })).toHaveValue(
      "192.168.1.30",
    );
    await page.getByRole("button", { name: "Next" }).click();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Create load balancer" }).click();
    await expectToast(page, "A new load balancer is being created.");
    await expect(page).toHaveURL(/\/load-balancers$/);
  });

  test("keeps a custom listener port after going back", async ({ page }) => {
    await page.goto("/load-balancers/new");
    await page.getByRole("textbox", { name: "Name" }).fill("api");
    await page.getByRole("button", { name: /Subnet/ }).click();
    await page.getByRole("option", { name: /private/ }).click();
    await page.getByRole("button", { name: "Next" }).click();
    const port = page.getByRole("textbox", { name: "Port" });
    await port.fill("8080");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    // The number field shows its value grouped.
    await expect(port).toHaveValue("8,080");

    // A protocol change still applies that protocol's default port.
    await page.getByRole("button", { name: /Protocol/ }).click();
    await page.getByRole("option", { name: "HTTPS", exact: true }).click();
    await expect(port).toHaveValue("443");
  });

  test("leaves the port empty for a protocol without a default", async ({
    page,
  }) => {
    await page.goto("/load-balancers/new");
    await page.getByRole("textbox", { name: "Name" }).fill("api");
    await page.getByRole("button", { name: /Subnet/ }).click();
    await page.getByRole("option", { name: /private/ }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: /Protocol/ }).click();
    await page.getByRole("option", { name: "TCP", exact: true }).click();
    const port = page.getByRole("textbox", { name: "Port" });
    await expect(port).toHaveValue("");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(main(page).getByText("Enter a port")).toBeVisible();
    await port.fill("5432");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("textbox", { name: "Port" })).toHaveCount(0);
  });

  test("confirms a floating IP disassociation and shows its failure", async ({
    page,
  }) => {
    await page.goto("/load-balancers/lb-1");
    await expectPage(page, "web");
    const actions = main(page).getByRole("button", { name: "Actions" });
    await actions.click();
    await page
      .getByRole("menuitem", { name: "Associate floating IP", exact: true })
      .click();
    const associate = dialog(page, "Associate floating IP");
    await associate.getByRole("button", { name: /Floating IP/ }).click();
    await page.getByRole("option", { name: /203\.0\.113\.101/ }).click();
    await associate.getByRole("button", { name: "Associate" }).click();
    await expect(associate).toHaveCount(0);

    await failRequest(page, "DELETE", "/api/load-balancers/lb-1/floating-ip");
    await actions.click();
    await page
      .getByRole("menuitem", { name: "Disassociate floating IP", exact: true })
      .click();
    const confirm = dialog(page, /Disassociate .*\?/);
    await confirm.getByRole("button", { name: "Disassociate" }).click();
    await expectToast(
      page,
      "Could not disassociate the floating IP of load balancer web: the mock API refused this request",
    );
    await expectNoSeriousA11yIssues(page);
  });
});

test.describe("load balancer checks", () => {
  test("checks the name and the VIP on the first step", async ({ page }) => {
    await page.goto("/load-balancers/new");
    await page.getByRole("textbox", { name: "Name" }).fill("x".repeat(300));
    await page.getByRole("button", { name: /Subnet/ }).click();
    await page.getByRole("option", { name: /private/ }).click();
    const vip = page.getByRole("textbox", { name: "IP address" });
    await vip.fill("10.9.9.9");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(main(page)).toContainText("Use 255 characters or fewer");
    await expect(main(page)).toContainText(
      "Use an address on the subnet private-subnet (192.168.1.0/24)",
    );
    await page.getByRole("textbox", { name: "Name" }).fill("api");
    await vip.fill("192.168.1.9");
    await expect(main(page)).not.toContainText("Use an address on the subnet");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      main(page).getByRole("heading", { name: "Listener", level: 2 }),
    ).toBeFocused();
  });

  test("refuses a member address that is not one, or not on its subnet", async ({
    page,
  }) => {
    await page.goto("/load-balancers/lb-1/pools/p-1");
    await page.getByRole("button", { name: "Add member" }).click();
    const add = dialog(page, "Add member");
    const address = add.getByRole("textbox", { name: "IP address" });
    await address.fill("999.1.1.1");
    await add.getByRole("button", { name: "Add member" }).click();
    await expect(add).toContainText("Enter a valid IP address");
    await address.fill("10.9.9.9");
    await add.getByRole("button", { name: /Subnet/ }).click();
    await page.getByRole("option", { name: /private/ }).click();
    await add.getByRole("button", { name: "Add member" }).click();
    await expect(add).toContainText(
      "Use an address on the subnet private-subnet (192.168.1.0/24)",
    );
    await address.fill("192.168.1.40");
    await add.getByRole("button", { name: "Add member" }).click();
    await expectToast(page, "Adding the member.");
  });

  test("waits for Active before changing a load balancer being updated", async ({
    page,
  }) => {
    // The seeded "rebuilding" stays PENDING_UPDATE, so no timer decides it.
    await page.goto("/load-balancers");
    const rebuilding = row(table(page, "Load balancers"), "rebuilding");
    await rebuilding.getByRole("button", { name: "Actions" }).click();
    for (const item of ["Edit load balancer", "Delete load balancer"]) {
      const action = page.getByRole("menuitem", { name: new RegExp(item) });
      await expect(action).toBeDisabled();
      await expect(action).toContainText(
        "Wait until the load balancer is Active",
      );
    }
  });

  test("explains why a load balancer being updated takes no children yet", async ({
    page,
  }) => {
    await page.goto("/load-balancers/lb-2");
    await expect(
      main(page).getByText(
        /The load balancer is being updated\. Listeners, pools and members can be added once/,
      ),
    ).toBeVisible();
    await openSection(page, "Listeners");
    await expect(
      page.getByRole("button", { name: "Create listener" }),
    ).toBeDisabled();
  });

  test("says in plain words that a change was refused while the load balancer was busy", async ({
    page,
  }) => {
    await page.goto("/load-balancers/lb-1?tab=listeners");
    await page.getByRole("button", { name: "Create listener" }).click();
    const create = dialog(page, "Create listener");
    // The load balancer starts a failover after the page was drawn, so
    // the button was enabled when the dialog opened.
    await page.evaluate(() =>
      fetch("/api/load-balancers/lb-1/failover", { method: "POST" }),
    );
    await create.getByRole("button", { name: "Create listener" }).click();
    await expect(
      create.getByText(
        "The load balancer is applying another change. Try again once it is Active.",
      ),
    ).toBeVisible();
  });

  test("asks before leaving the wizard by Cancel", async ({ page }) => {
    await page.goto("/load-balancers/new");
    await page.getByRole("textbox", { name: "Name" }).fill("api");
    await main(page).getByRole("link", { name: "Cancel" }).click();
    const leave = dialog(page, "Leave without creating the load balancer?");
    await leave.getByRole("button", { name: "Leave" }).click();
    await expectPage(page, "Load balancers");
  });
});

test.describe("listener and rule dialogs", () => {
  test("edits a listener's timeouts from the listeners tab", async ({
    page,
  }) => {
    await page.goto("/load-balancers/lb-1?tab=listeners");
    await rowAction(row(table(page, "Listeners"), "http"), "Edit listener");
    const edit = dialog(page, "Edit listener http");
    await edit.getByRole("button", { name: "Timeouts (milliseconds)" }).click();
    await edit
      .getByRole("textbox", { name: "Client data timeout" })
      .fill("90000");
    await edit.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "The listener has been updated.");
    await table(page, "Listeners").getByRole("link", { name: "http" }).click();
    await expect(main(page)).toContainText("90000 ms");
  });

  test("creates a listener with its timeouts", async ({ page }) => {
    await page.goto("/load-balancers/lb-1?tab=listeners");
    await page.getByRole("button", { name: "Create listener" }).click();
    const create = dialog(page, "Create listener");
    await create
      .getByRole("button", { name: "Timeouts (milliseconds)" })
      .click();
    await expect(
      create.getByRole("textbox", { name: "Member connect timeout" }),
    ).toHaveValue("5,000");
    await create.getByRole("button", { name: "Create listener" }).click();
    await expectToast(page, "A new listener is being created.");
  });

  test("leaves the port empty when a new listener has no default", async ({
    page,
  }) => {
    await page.goto("/load-balancers/lb-1?tab=listeners");
    await page.getByRole("button", { name: "Create listener" }).click();
    const create = dialog(page, "Create listener");
    await expect(create.getByRole("textbox", { name: "Port" })).toHaveValue(
      "81",
    );
    await create.getByRole("button", { name: /Protocol/ }).click();
    await page.getByRole("option", { name: "UDP", exact: true }).click();
    await expect(create.getByRole("textbox", { name: "Port" })).toHaveValue("");
    await create.getByRole("button", { name: "Create listener" }).click();
    await expect(create.getByText("Enter a port")).toBeVisible();
  });

  test("edits a rule, offering only the comparisons its type allows", async ({
    page,
  }) => {
    await page.goto("/load-balancers/lb-1/listeners/l-1");
    await rowAction(
      row(table(page, "L7 policies"), "block-admin"),
      "Manage rules",
    );
    const rules = dialog(page, "Rules of block-admin");
    await rowAction(row(rules, "Path"), "Edit rule");
    const edit = dialog(page, "Edit rule of block-admin");
    // On a phone the field renders under the pointer the menu click left
    // behind; fillField settles the hover that would otherwise swallow the
    // text.
    const value = edit.getByRole("textbox", { name: "Value" });
    await fillField(value, "php");
    await edit.getByRole("button", { name: /Type$/ }).click();
    await page.getByRole("option", { name: "File type" }).click();
    await edit.getByRole("button", { name: /Comparison$/ }).click();
    await expect(page.getByRole("option")).toHaveText(["Regex", "Equal to"]);
    await page.getByRole("option", { name: "Equal to" }).click();
    await edit.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "The rule has been updated.");
    const back = dialog(page, "Rules of block-admin");
    await expect(row(back, "File type")).toContainText("php");
    await closeButton(back).click();
    await expect(back).toHaveCount(0);
  });
});

test.describe("pools", () => {
  test("names the health monitor's buttons and links the listener", async ({
    page,
  }) => {
    await page.goto("/load-balancers/lb-1/pools/p-1");
    await expect(
      main(page).getByRole("button", { name: "Edit health monitor" }),
    ).toBeVisible();
    await expect(
      main(page).getByRole("button", { name: "Delete health monitor" }),
    ).toBeVisible();
    await main(page).getByRole("link", { name: "http" }).click();
    await expectPage(page, "http");
  });

  test("links the VIP port and names the subnet", async ({ page }) => {
    await page.goto("/load-balancers/lb-1");
    await expect(
      main(page).getByRole("link", { name: "private-subnet" }),
    ).toHaveAttribute("href", "/network/subnets/subnet-1");
    await expect(
      main(page).getByRole("link", { name: "private", exact: true }),
    ).toHaveAttribute("href", "/network/networks/private-net");
    await expect(
      main(page).getByRole("link", { name: "port-vip" }),
    ).toHaveAttribute("href", "/network/ports/port-vip");
  });
});

test.describe("listeners", () => {
  test("creates an L7 policy that redirects to a URL", async ({ page }) => {
    await page.goto("/load-balancers/lb-1/listeners/l-1");
    const policies = table(page, "L7 policies");
    await expect(row(policies, "block-admin")).toBeVisible();
    await page.getByRole("button", { name: "Create policy" }).click();
    const create = dialog(page, "Create L7 policy");
    await create.getByRole("textbox", { name: "Name" }).fill("to-docs");
    await create.getByRole("button", { name: /Action/ }).click();
    await page.getByRole("option", { name: "Redirect to URL" }).click();
    // The closing listbox hands focus back to the select once its exit
    // animation ends; a fill that starts before that loses its text to the
    // select. Wait for the hand-back, as a person's next keystroke would.
    await expect(create.getByRole("button", { name: /Action/ })).toBeFocused();
    const url = create.getByRole("textbox", { name: "Redirect URL" });
    await url.fill("https://docs.example.org");
    await expect(url).toHaveValue("https://docs.example.org");
    await create.getByRole("button", { name: "Create policy" }).click();
    await expectToast(page, "A new L7 policy is being created.");
    await expect(row(policies, "to-docs")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });
});

test("keeps the load balancers search when coming back to the list", async ({
  page,
}) => {
  await expectSearchSurvivesBack(page, {
    path: "/load-balancers",
    table: "Load balancers",
    text: "web",
    link: "web",
  });
});
