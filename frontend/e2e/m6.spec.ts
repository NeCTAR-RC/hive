import {
  expect,
  expectNoHorizontalScroll,
  expectNoSeriousA11yIssues,
  test,
} from "./fixtures";

test.describe("orchestration", () => {
  test("lists stacks and opens the detail tabs", async ({ page }) => {
    await page.goto("/orchestration/stacks");
    const table = page.getByRole("grid", { name: "Stacks" });
    await expect(table.getByRole("link", { name: "web-tier" })).toBeVisible();
    await expect(table.getByText("Create in progress")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await table.getByRole("link", { name: "web-tier" }).click();
    await expect(
      page.getByRole("heading", { name: "web-tier", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("203.0.113.10")).toBeVisible();
    await page
      .getByRole("tab", { name: "Resources", exact: true })
      .or(page.getByRole("button", { name: "Resources", exact: true }))
      .first()
      .click();
    await expect(
      page
        .getByRole("grid", { name: "Resources" })
        .getByRole("rowheader", { name: "server" }),
    ).toBeVisible();
    await page
      .getByRole("tab", { name: "Template", exact: true })
      .or(page.getByRole("button", { name: "Template", exact: true }))
      .first()
      .click();
    await expect(
      page.getByText("heat_template_version: 2021-04-16"),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("launches a stack from pasted text with generated parameters", async ({
    page,
  }) => {
    await page.goto("/orchestration/stacks/new");
    await page
      .getByRole("textbox", { name: "Template" })
      .fill("heat_template_version: 2021-04-16\nresources: {}\n");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Two web servers")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sizing" })).toBeVisible();
    await page.getByRole("textbox", { name: "Stack name" }).fill("demo");
    await page.getByRole("textbox", { name: "Key pair" }).fill("sam-key");
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Launch" }).click();
    await expect(page.getByText("Stack demo is being created.")).toBeVisible();
    await expect(
      page
        .getByRole("grid", { name: "Stacks" })
        .getByRole("link", { name: "demo" }),
    ).toBeVisible();
  });

  test("shows resource types and template versions", async ({ page }) => {
    await page.goto("/orchestration/resource-types");
    const table = page.getByRole("grid", { name: "Resource types" });
    await table.getByRole("link", { name: "OS::Nova::Server" }).click();
    await expect(
      page.getByRole("heading", { name: "OS::Nova::Server", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("The flavour")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await page.goto("/orchestration/template-versions");
    await page
      .getByRole("grid", { name: "Template versions" })
      .getByRole("link", { name: "heat_template_version.2021-04-16" })
      .click();
    await expect(
      page
        .getByRole("grid", { name: "Template functions" })
        .getByText("str_replace"),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe("dns", () => {
  test("lists zones, creates one and manages record sets", async ({ page }) => {
    await page.goto("/dns/zones");
    const table = page.getByRole("grid", { name: "Zones" });
    await expect(
      table.getByRole("link", { name: "example.org." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create zone" }).click();
    const dialog = page.getByRole("dialog", { name: "Create zone" });
    await dialog.getByRole("textbox", { name: "Zone name" }).fill("new.org.");
    await dialog.getByRole("textbox", { name: "Contact email" }).fill("a@b.co");
    await expectNoSeriousA11yIssues(page);
    await dialog.getByRole("button", { name: "Create zone" }).click();
    await expect(
      page.getByText("Zone new.org. is being created."),
    ).toBeVisible();
    await expect(table.getByRole("link", { name: "new.org." })).toBeVisible();

    await table.getByRole("link", { name: "example.org." }).click();
    await expect(
      page.getByRole("heading", { name: "example.org.", level: 1 }),
    ).toBeVisible();
    const recordsets = page.getByRole("grid", { name: "Record sets" });
    await expect(recordsets.getByText("www.example.org.")).toBeVisible();
    await page.getByRole("button", { name: "Create record set" }).click();
    const create = page.getByRole("dialog", { name: "Create record set" });
    await create.getByRole("textbox", { name: "Name" }).fill("mail");
    await create.getByRole("textbox", { name: "Records" }).fill("203.0.113.20");
    await create.getByRole("button", { name: "Create record set" }).click();
    await expect(
      page.getByText("Record set mail.example.org. is being created."),
    ).toBeVisible();
    await expect(recordsets.getByText("mail.example.org.")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe("shares", () => {
  test("lists shares with quota, creates one and opens the detail", async ({
    page,
  }) => {
    await page.goto("/shares/shares");
    await expect(page.getByText("2 of 10 shares")).toBeVisible();
    const table = page.getByRole("grid", { name: "Shares" });
    await expect(table.getByRole("link", { name: "datasets" })).toBeVisible();
    await page.getByRole("button", { name: "Create share" }).click();
    const dialog = page.getByRole("dialog", { name: "Create share" });
    await dialog.getByRole("textbox", { name: "Share name" }).fill("fresh");
    await expectNoSeriousA11yIssues(page);
    await dialog.getByRole("button", { name: "Create share" }).click();
    await expect(page.getByText("Share fresh is being created.")).toBeVisible();
    await expect(table.getByRole("link", { name: "fresh" })).toBeVisible();

    await table.getByRole("link", { name: "datasets" }).click();
    await expect(
      page.getByRole("heading", { name: "datasets", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText("10.0.0.9:/volumes/_nogroup/abc"),
    ).toBeVisible();
    await page
      .getByRole("tab", { name: "Access rules", exact: true })
      .or(page.getByRole("button", { name: "Access rules", exact: true }))
      .first()
      .click();
    await expect(
      page.getByRole("grid", { name: "Access rules" }).getByText("alice"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add rule" }).click();
    const rule = page.getByRole("dialog", { name: "Add access rule" });
    await rule.getByRole("textbox", { name: "Access to" }).fill("bob");
    await rule.getByRole("button", { name: "Add rule" }).click();
    await expect(
      page.getByText("Access rule for bob is being added."),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("shows snapshots, security services and share groups", async ({
    page,
  }) => {
    await page.goto("/shares/snapshots");
    await expect(
      page
        .getByRole("grid", { name: "Share snapshots" })
        .getByRole("link", { name: "datasets-snap" }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await page.goto("/shares/security-services");
    await page.getByRole("button", { name: "Create security service" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Create security service",
    });
    await dialog
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("ldap-1");
    await dialog.getByRole("textbox", { name: "DNS IP" }).fill("10.0.0.3");
    await dialog.getByRole("textbox", { name: "Server" }).fill("ldap.example");
    await dialog.getByRole("textbox", { name: "Domain" }).fill("example");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      page.getByText("Security service ldap-1 created."),
    ).toBeVisible();
    await page.goto("/shares/share-groups");
    await page
      .getByRole("grid", { name: "Share groups" })
      .getByRole("link", { name: "group-a" })
      .click();
    await expect(
      page.getByRole("heading", { name: "group-a", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("No shares in this group yet.")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe("databases", () => {
  test("lists instances, opens the detail and manages users", async ({
    page,
  }) => {
    await page.goto("/databases/instances");
    await expect(page.getByText("2 of 10 instances")).toBeVisible();
    const table = page.getByRole("grid", { name: "Database instances" });
    await expect(table.getByRole("link", { name: "appdb" })).toBeVisible();
    await expect(table.getByText("Building", { exact: true })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await table.getByRole("link", { name: "appdb" }).click();
    await expect(
      page.getByRole("heading", { name: "appdb", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("mysql -h 10.0.0.7")).toBeVisible();
    await page
      .getByRole("tab", { name: "Users", exact: true })
      .or(page.getByRole("button", { name: "Users", exact: true }))
      .first()
      .click();
    await page.getByRole("button", { name: "Create user" }).click();
    const dialog = page.getByRole("dialog", { name: "Create user" });
    await dialog.getByRole("textbox", { name: "User name" }).fill("bob");
    await dialog.getByRole("textbox", { name: "Password" }).fill("secret");
    await dialog.getByRole("button", { name: "Create user" }).click();
    await expect(page.getByText("Created user bob.")).toBeVisible();
    await expect(
      page
        .getByRole("grid", { name: "Users" })
        .getByRole("rowheader", { name: "bob" }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("manages guest logs, shows defaults and resizes within the datastore", async ({
    page,
  }) => {
    await page.goto("/databases/instances/db-1?tab=logs");
    const logs = page.getByRole("grid", { name: "Logs" });
    await expect(
      logs.getByRole("rowheader", { name: "general" }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    const row = logs.getByRole("row", { name: /general/ });
    await row.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Publish log" }).click();
    await expect(page.getByText("Published log general.")).toBeVisible();
    await expect(row.getByText("Published", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "View log" }).click();
    const dialog = page.getByRole("dialog", { name: "Log general" });
    await expect(dialog).toContainText("general line 120");
    await expect(dialog).not.toContainText("general line 001");
    await dialog.getByRole("button", { name: /Lines/ }).click();
    await page.getByRole("option", { name: "Whole log" }).click();
    await expect(dialog).toContainText("general line 001");
    await dialog.getByRole("button", { name: "Close" }).last().click();
    await expect(dialog).toHaveCount(0);

    await page.goto("/databases/instances/db-1?tab=defaults");
    await expect(
      page
        .getByRole("grid", { name: "Configuration defaults" })
        .getByRole("rowheader", { name: "max_connections" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Resize", exact: true }).click();
    const resize = page.getByRole("dialog", { name: "Resize appdb" });
    await resize.getByRole("button", { name: /New flavour/ }).click();
    await expect(
      page.getByRole("option", { name: /db3\.medium/ }),
    ).toBeVisible();
    await expect(page.getByRole("option", { name: /db3\.small/ })).toHaveCount(
      0,
    );
    await page.keyboard.press("Escape");
  });

  test("launches an instance with the Nectar form", async ({ page }) => {
    await page.goto("/databases/instances/new");
    await page.getByRole("textbox", { name: "Instance name" }).fill("newdb");
    await page.getByRole("button", { name: "Datastore" }).click();
    await page.getByRole("option", { name: "mysql - 8.0" }).click();
    await page.getByRole("button", { name: "Flavour" }).click();
    await page.getByRole("option", { name: /db3\.small/ }).click();
    await expect(
      page.getByText("Allowing 0.0.0.0/0 may expose the database instance"),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Launch" }).click();
    await expect(
      page.getByText("Database instance newdb is being created."),
    ).toBeVisible();
    await expect(
      page
        .getByRole("grid", { name: "Database instances" })
        .getByRole("link", { name: "newdb" }),
    ).toBeVisible();
  });

  test("shows backups and configuration groups", async ({ page }) => {
    await page.goto("/databases/backups");
    const backups = page.getByRole("grid", { name: "Database backups" });
    await expect(backups.getByRole("link", { name: "nightly" })).toBeVisible();
    await page.getByRole("button", { name: "Create backup" }).click();
    const dialog = page.getByRole("dialog", { name: "Create backup" });
    await dialog.getByRole("textbox", { name: "Backup name" }).fill("manual");
    await dialog.getByRole("button", { name: "Create backup" }).click();
    await expect(
      page.getByText("Backup manual is being created."),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);

    await page.goto("/databases/configuration-groups");
    await page
      .getByRole("grid", { name: "Configuration groups" })
      .getByRole("link", { name: "tuned" })
      .click();
    await expect(
      page.getByRole("heading", { name: "tuned", level: 1 }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("grid", { name: "Configuration values" })
        .getByText("max_connections"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add parameter" }).click();
    const add = page.getByRole("dialog", { name: "Add parameter" });
    // The parameter picker is a combobox: type to filter, then choose with
    // the keyboard (a pointer click on the popover is flaky at phone width).
    const picker = add.getByRole("combobox", { name: "Parameter" });
    await picker.fill("autocommit");
    await expect(
      page.getByRole("option", { name: "autocommit" }),
    ).toBeVisible();
    await picker.press("ArrowDown");
    await picker.press("Enter");
    await expect(picker).toHaveValue("autocommit");
    // autocommit is a boolean parameter, so its value is a switch. The real
    // input is visually hidden (React Aria), so press its label.
    const flag = add.getByRole("switch", { name: "Value" });
    await add.getByText("Value", { exact: true }).click();
    await expect(flag).toBeChecked();
    await add.getByRole("button", { name: "Add parameter" }).click();
    await expect(page.getByText("Set autocommit.")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
