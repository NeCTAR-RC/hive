import type { Locator } from "@playwright/test";
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
  openSection,
  row,
  rowAction,
  table,
} from "./helpers";

/** Presses a switch by its label: its input is visually hidden by React Aria. */
async function pressSwitch(scope: Locator, name: string) {
  await scope.getByText(name, { exact: true }).click();
}

/**
 * Chooses `name` in a dialog's Parameter combobox: type to filter, then pick
 * with the keyboard (a pointer click on the popover is flaky at phone width).
 */
async function choosePicker(scope: Locator, name: string) {
  const picker = scope.getByRole("combobox", { name: "Parameter" });
  await picker.fill(name);
  await expect(scope.page().getByRole("option", { name })).toBeVisible();
  await picker.press("ArrowDown");
  await picker.press("Enter");
  await expect(picker).toHaveValue(name);
}

test.describe("database instances", () => {
  test("lists instances, opens the detail and manages users", async ({
    page,
  }) => {
    await page.goto("/databases/instances");
    await expect(main(page).getByText("3 of 10 instances")).toBeVisible();
    const instances = table(page, "Database instances");
    await expect(instances.getByRole("link", { name: "appdb" })).toBeVisible();
    await expect(
      instances.getByText("Building", { exact: true }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await instances.getByRole("link", { name: "appdb" }).click();
    await expectPage(page, "appdb");
    await expect(main(page).getByText("mysql -h 10.0.0.7")).toBeVisible();
    await openSection(page, "Users");
    await page.getByRole("button", { name: "Create user" }).click();
    const create = dialog(page, "Create user");
    await create.getByRole("textbox", { name: "User name" }).fill("bob");
    const password = create.getByRole("textbox", { name: "Password" });
    await password.fill("x");
    await create.getByRole("button", { name: "Create user" }).click();
    await expect(create.getByText("Use at least 8 characters")).toBeVisible();
    await password.fill("secret-pw");
    await create.getByRole("button", { name: "Create user" }).click();
    await expectToast(page, "Created user bob.");
    await expect(row(table(page, "Users"), "bob")).toBeVisible();
    await checkPage(page);
  });

  test("never offers 0.0.0.0/0 when the instance does not load", async ({
    page,
  }) => {
    await failRequest(page, "GET", "/api/databases/instances/db-1", 500);
    await page.goto("/databases/instances");
    await rowAction(
      row(table(page, "Database instances"), "appdb"),
      "Update instance",
    );
    const update = dialog(page, "Update appdb");
    await expect(
      update.getByText("Could not load the allowed CIDRs"),
    ).toBeVisible();
    await expect(update.getByText("0.0.0.0/0")).toHaveCount(0);
    await expect(
      update.getByRole("button", { name: "Update", exact: true }),
    ).toBeDisabled();
    await clearFailure(page);
    await update.getByRole("button", { name: "Try again" }).click();
    await expect(
      update.getByRole("textbox", { name: "Allowed CIDRs" }),
    ).toBeVisible();
    await expect(
      update.getByRole("button", { name: "Update", exact: true }),
    ).toBeEnabled();
  });

  test("publishes and views a guest log", async ({ page }) => {
    await page.goto("/databases/instances/db-1?tab=logs");
    const general = row(table(page, "Logs"), "general");
    await expect(general).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await rowAction(general, "Publish log");
    await expectToast(page, "Published log general.");
    await expect(general.getByText("Published", { exact: true })).toBeVisible();
    await rowAction(general, "View log");
    const log = dialog(page, "Log general");
    await expect(log).toContainText("general line 120");
    await expect(log).not.toContainText("general line 001");
    await log.getByRole("button", { name: /Lines/ }).click();
    await page.getByRole("option", { name: "Whole log" }).click();
    await expect(log).toContainText("general line 001");
    await log.getByRole("button", { name: "Close", exact: true }).click();
    await expect(log).toHaveCount(0);
  });

  test("shows the defaults and resizes within the datastore", async ({
    page,
  }) => {
    await page.goto("/databases/instances/db-1?tab=defaults");
    await expect(
      row(table(page, "Configuration defaults"), "max_connections"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Resize", exact: true }).click();
    const resize = dialog(page, "Resize appdb");
    await resize.getByRole("button", { name: /New flavour/ }).click();
    // Only flavours of the instance's datastore, never its current one.
    await expect(page.getByRole("option", { name: /db3\.small/ })).toHaveCount(
      0,
    );
    await page.getByRole("option", { name: /db3\.medium/ }).click();
    await resize.getByRole("button", { name: "Resize instance" }).click();
    await expectToast(page, "Resizing appdb.");
  });

  test("launches an instance with the Nectar form", async ({ page }) => {
    await page.goto("/databases/instances/new");
    await page.getByRole("textbox", { name: "Instance name" }).fill("newdb");
    await page.getByRole("button", { name: "Datastore" }).click();
    await page.getByRole("option", { name: "mysql - 8.0" }).click();
    await page.getByRole("button", { name: "Flavour" }).click();
    await page.getByRole("option", { name: /db3\.small/ }).click();
    const cidrs = page.getByRole("textbox", { name: "Allowed CIDRs" });
    await expect(cidrs).toHaveValue("");
    const warning = main(page).getByText(
      "Allowing 0.0.0.0/0 may expose the database instance",
    );
    await expect(warning).toHaveCount(0);
    await page.getByRole("button", { name: "Launch" }).click();
    await expect(
      main(page).getByText("Enter at least one CIDR, such as 203.0.113.0/24"),
    ).toBeVisible();
    await cidrs.fill("0.0.0.0/0");
    await expect(warning).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Launch" }).click();
    await expectToast(page, "Database instance newdb is being created.");
    await expect(
      table(page, "Database instances").getByRole("link", { name: "newdb" }),
    ).toBeVisible();
  });
});

test.describe("database checks and edits", () => {
  test("edits a user's password", async ({ page }) => {
    await page.goto("/databases/instances/db-1?tab=users");
    await rowAction(row(table(page, "Users"), "app"), "Edit user");
    const edit = dialog(page, "Edit user app");
    const password = edit.getByRole("textbox", { name: "New password" });
    await password.fill("short");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(edit.getByText("Use at least 8 characters")).toBeVisible();
    await password.fill("a-long-password");
    await expectNoSeriousA11yIssues(page);
    await edit.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "Updated user app.");
  });

  test("offers enable and disable as the log's state allows", async ({
    page,
  }) => {
    await page.goto("/databases/instances/db-1?tab=logs");
    const logs = table(page, "Logs");
    await row(logs, "general").getByRole("button", { name: "Actions" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Enable log", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("menuitem", { name: /^Disable log/ }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await row(logs, "error").getByRole("button", { name: "Actions" }).click();
    await expect(
      page.getByRole("menuitem", { name: /^Enable log/ }),
    ).toBeDisabled();
  });

  test("checks the launch against the quota and the datastore", async ({
    page,
  }) => {
    await page.goto("/databases/instances/new");
    const quota = main(page).locator("section", {
      has: page.getByRole("heading", { name: "Quota" }),
    });
    await expect(quota.getByText("3 of 10")).toBeVisible();
    await expect(quota.getByText("15 GB of 100 GB")).toBeVisible();
    await page.getByRole("textbox", { name: "Instance name" }).fill("bigdb");
    await page.getByRole("button", { name: "Datastore" }).click();
    await page.getByRole("option", { name: "mysql - 8.0" }).click();
    await page.getByRole("textbox", { name: "Volume size" }).fill("5000");
    await page
      .getByRole("textbox", { name: "Initial databases" })
      .fill("good, bad name!");
    // Leave the field first: its own error shows on blur and moves the
    // button down.
    await page.keyboard.press("Tab");
    await page.getByRole("button", { name: "Launch" }).click();
    await expect(
      main(page).getByText(
        "A 5000 GB volume does not fit: 85 GB of your database volume quota is left",
      ),
    ).toBeVisible();
    await expect(
      main(page).getByText(/bad name! is not a database name/),
    ).toBeVisible();
    await expect(main(page).getByText("Choose a flavour")).toBeVisible();
  });

  test("restores a backup at the source volume's size", async ({ page }) => {
    await page.goto("/databases/instances/new?backup=bk-1");
    await expect(
      page.getByRole("textbox", { name: "Volume size" }),
    ).toHaveValue("5");
  });

  test("shows the root password with Done only", async ({ page }) => {
    await page.goto("/databases/instances/db-1?tab=root");
    await page.getByRole("button", { name: "Enable root" }).click();
    await dialog(page, "Enable root on appdb")
      .getByRole("button", { name: "Enable root" })
      .click();
    const shown = dialog(page, "Root password");
    await expect(shown.getByRole("button", { name: "Done" })).toBeVisible();
    await expect(shown.getByRole("button", { name: "Cancel" })).toHaveCount(0);
    await shown.getByRole("button", { name: "Done" }).click();
    await expect(shown).toHaveCount(0);
  });

  test("changes a set parameter from its current value", async ({ page }) => {
    await page.goto("/databases/configuration-groups/cfg-1");
    await page.getByRole("button", { name: "Add parameter" }).click();
    const add = dialog(page, "Add parameter");
    await choosePicker(add, "max_connections");
    await expect(add.getByText(/Currently 200\./)).toBeVisible();
    // An integer parameter takes a number field, which starts from the value
    // in force and is held to the parameter's range.
    const value = add.getByRole("textbox", { name: "Value" });
    await expect(value).toHaveValue("200");
    await value.fill("");
    await add.getByRole("button", { name: "Change value" }).click();
    await expect(add.getByText("Enter a value")).toBeVisible();
    await value.fill("300");
    await add.getByRole("button", { name: "Change value" }).click();
    await expectToast(page, "Set max_connections.");
  });

  test("takes text for a string parameter", async ({ page }) => {
    await page.goto("/databases/configuration-groups/cfg-1");
    await page.getByRole("button", { name: "Add parameter" }).click();
    const add = dialog(page, "Add parameter");
    await choosePicker(add, "character_set_server");
    await expect(add.getByText(/Needs a restart\./)).toBeVisible();
    await add.getByRole("textbox", { name: "Value" }).fill("utf8mb4");
    await add.getByRole("button", { name: "Add parameter" }).click();
    await expectToast(page, "Set character_set_server.");
  });
});

test.describe("database backups and configuration groups", () => {
  test("creates a backup", async ({ page }) => {
    await page.goto("/databases/backups");
    await expect(
      table(page, "Database backups").getByRole("link", { name: "nightly" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create backup" }).click();
    const create = dialog(page, "Create backup");
    await create.getByRole("textbox", { name: "Backup name" }).fill("manual");
    await create.getByRole("button", { name: /Database instance/ }).click();
    await page.getByRole("option", { name: "appdb" }).click();
    await expectNoSeriousA11yIssues(page);
    await create.getByRole("button", { name: "Create backup" }).click();
    await expectToast(page, "Backup manual is being created.");
  });

  test("adds a parameter to a configuration group", async ({ page }) => {
    await page.goto("/databases/configuration-groups");
    await table(page, "Configuration groups")
      .getByRole("link", { name: "tuned" })
      .click();
    await expectPage(page, "tuned");
    await expect(
      table(page, "Configuration values").getByText("max_connections"),
    ).toBeVisible();
    await checkPage(page);
    await page.getByRole("button", { name: "Add parameter" }).click();
    const add = dialog(page, "Add parameter");
    await choosePicker(add, "autocommit");
    // A boolean parameter is a switch.
    const flag = add.getByRole("switch", { name: "Value" });
    await expect(flag).not.toBeChecked();
    await pressSwitch(add, "Value");
    await expect(flag).toBeChecked();
    await add.getByRole("button", { name: "Add parameter" }).click();
    await expectToast(page, "Set autocommit.");
  });

  test("clears the parent backup when another instance is chosen", async ({
    page,
  }) => {
    await page.goto("/databases/backups?create=true&instance=db-1");
    const create = dialog(page, "Create backup");
    await create.getByRole("textbox", { name: "Backup name" }).fill("weekly");
    const parent = create.getByRole("button", { name: /Parent backup/ });
    await parent.click();
    await page.getByRole("option", { name: "nightly" }).click();
    await expect(parent).toContainText("nightly");

    // reports has no backups: the parent field goes, and with it the choice.
    await create.getByRole("button", { name: /Database instance/ }).click();
    await page.getByRole("option", { name: "reports" }).click();
    await expect(create.getByText("Parent backup")).toHaveCount(0);
    await create.getByRole("button", { name: /Database instance/ }).click();
    await page.getByRole("option", { name: "appdb" }).click();
    await expect(
      create.getByRole("button", { name: /Parent backup/ }),
    ).toContainText("None (full backup)");

    const created = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().endsWith("/api/databases/backups"),
    );
    await create.getByRole("button", { name: "Create backup" }).click();
    expect((await created).postDataJSON()).not.toHaveProperty("parent_id");
    await expectToast(page, "Backup weekly is being created.");
  });

  test("grants and revokes a user's access with one switch per database", async ({
    page,
  }) => {
    await page.goto("/databases/instances/db-1?tab=users");
    await rowAction(row(table(page, "Users"), "app"), "Manage access");
    const access = dialog(page, "Access for app");
    const app = access.getByRole("switch", { name: "app", exact: true });
    await expect(app).toBeChecked();
    await expect(
      access.getByRole("switch", { name: "reports", exact: true }),
    ).not.toBeChecked();
    await pressSwitch(access, "app");
    await expectToast(page, "Revoked access to database app.");
    await expect(app).not.toBeChecked();
    await access.getByRole("button", { name: "Done" }).click();
  });
});

test("keeps the database instances search when coming back to the list", async ({
  page,
}) => {
  await expectSearchSurvivesBack(page, {
    path: "/databases/instances",
    table: "Database instances",
    text: "app",
    link: "appdb",
  });
});
