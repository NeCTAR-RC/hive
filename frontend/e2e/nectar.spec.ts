import {
  expect,
  expectNoHorizontalScroll,
  expectNoSeriousA11yIssues,
  test,
} from "./fixtures";

test.describe("account", () => {
  test("shows and edits my details with the ORCID link", async ({ page }) => {
    await page.goto("/account/my-details");
    await expect(
      page.getByRole("heading", { name: "My Details", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Example University")).toBeVisible();
    await expect(page.getByText("0000-0002-1825-0097")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Disconnect ORCID" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Mobile number" })
      .fill("0411 222 333");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByText("Your details have been updated."),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("resets the API password after confirming", async ({ page }) => {
    await page.goto("/account/reset-password");
    await page.getByRole("button", { name: "Reset password" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Reset your API password?",
    });
    await expectNoSeriousA11yIssues(page);
    await dialog.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("Your password has been reset.")).toBeVisible();
    await expect(page.getByText("bW9ja3Bhc3N3b3JkMTIz")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });
});

test.describe("identity", () => {
  test("lists, adds and removes project members", async ({ page }) => {
    await page.goto("/members");
    const table = page.getByRole("grid", { name: "Project members" });
    await expect(table.getByText("ann@example.edu")).toBeVisible();
    await page.getByRole("button", { name: "Add member" }).click();
    const dialog = page.getByRole("dialog", { name: "Add member" });
    await dialog
      .getByRole("textbox", { name: "Username" })
      .fill("nobody@example.edu");
    await dialog.getByRole("button", { name: "Add member" }).click();
    await expect(dialog.getByText(/no Nectar RC account/)).toBeVisible();
    await dialog
      .getByRole("textbox", { name: "Username" })
      .fill("new@example.edu");
    await dialog.getByRole("button", { name: "Add member" }).click();
    await expect(
      page.getByText("Added new@example.edu as member."),
    ).toBeVisible();
    await expect(table.getByText("new@example.edu")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("creates an application credential and shows the secret once", async ({
    page,
  }) => {
    await page.goto("/identity/application-credentials");
    await expect(
      page
        .getByRole("grid", { name: "Application credentials" })
        .getByRole("link", {
          name: "deploy-bot",
        }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Create application credential" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Create application credential",
    });
    await dialog.getByRole("textbox", { name: "Name" }).fill("backup-bot");
    await expectNoSeriousA11yIssues(page);
    await dialog
      .getByRole("button", { name: "Create application credential" })
      .click();
    const secret = page.getByRole("dialog", {
      name: "Application credential created",
    });
    await expect(secret.getByText("mock-secret-value")).toBeVisible();
    await expect(
      secret.getByRole("button", { name: "Download openrc file" }),
    ).toBeEnabled();
    await expectNoSeriousA11yIssues(page);
    await secret
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .click();
    await page.getByRole("link", { name: "backup-bot" }).click();
    await expect(
      page.getByRole("heading", { name: "backup-bot", level: 1 }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });

  test("creates EC2 credentials for the project", async ({ page }) => {
    await page.goto("/identity/credentials");
    await page.getByRole("button", { name: "Create EC2 credentials" }).click();
    await expect(page.getByText("AKIAMOCK")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Recreate EC2 credentials" }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("looks a user up", async ({ page }) => {
    await page.goto("/identity/user-lookup?q=ann");
    const table = page.getByRole("grid", { name: "Matching Nectar users" });
    await expect(table.getByText("Ann Example")).toBeVisible();
    await table.getByRole("link", { name: "u2" }).click();
    await expect(
      page.getByRole("heading", { name: "Ann Example", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("https://idp.example.edu/idp")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });
});

test.describe("usage and security", () => {
  test("shows the usage trend with presets and the breakdown", async ({
    page,
  }) => {
    await page.goto("/usage/trend");
    await expect(
      page.getByRole("heading", { name: "Usage Trend", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("321.5")).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Service units by instance" }),
    ).toBeVisible();
    // The presets are a single-select toggle group, so each is a radio.
    await page.getByRole("radio", { name: "Past 30 days" }).click();
    await expect(page).toHaveURL(/begin=\d{4}-\d{2}-\d{2}/);
    const table = page.getByRole("grid", { name: "Project usage breakdown" });
    await expect(table.getByRole("rowheader", { name: /db-1/ })).toBeVisible();
    // Move off the preset so axe does not sample the design system's hovered
    // toggle colours (4.3:1, reported upstream); the rest state is what ships.
    await page.mouse.move(0, 0);
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("shows the allocation burn-down", async ({ page }) => {
    await page.goto("/usage/allocation");
    await expect(
      page.getByRole("heading", { name: "Allocation Usage", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("SU remaining")).toBeVisible();
    await page.getByRole("button", { name: "View as table" }).click();
    await expect(
      page.getByRole("columnheader", { name: "Usage guide" }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("lists security risks grouped by resource", async ({ page }) => {
    await page.goto("/security/risks");
    await expect(page.getByText(/currently has 1 security risk/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "instance i-db-1", level: 3 }),
    ).toBeVisible();
    await expect(page.getByText("accessible-db")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });
});

test.describe("reservations", () => {
  test("lists reservations with limits and actions", async ({ page }) => {
    await page.goto("/reservations");
    await expect(page.getByText("2 of 20 days")).toBeVisible();
    const table = page.getByRole("grid", { name: "Reservations" });
    await expect(table.getByRole("link", { name: "res-1" })).toBeVisible();
    await expect(table.getByText("Active")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("creates a reservation from the availability chart", async ({
    page,
  }) => {
    await page.goto("/reservations/new");
    await expect(page.getByText("2 of 20")).toBeVisible();
    await expect(page.getByText(/1,234.5\/5,000 Service Units/)).toBeVisible();
    await expect(
      page.getByRole("img", { name: /^Maintenance .*Firmware updates/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("group", { name: "ardc.h4.large" }),
    ).toBeVisible();

    // The class filter narrows the chart and lands in the URL.
    await page.getByRole("radio", { name: "GPU" }).click();
    await expect(page).toHaveURL(/category=GPU/);
    await expect(
      page.getByRole("group", { name: "ardc.h4.large" }),
    ).toBeHidden();

    // Flavour details fold out of the row header.
    await page
      .getByRole("button", { name: "ardc.g3.xlarge", exact: true })
      .click();
    await expect(page.getByText("L4 with 24GB of GPU RAM")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);

    // Clicking the middle of the bar starts there, for the eligible days.
    await page.getByRole("button", { name: /^Reserve ardc.g3.xlarge/ }).click();
    const dialog = page.getByRole("dialog", { name: "Reserve time slot" });
    await expect(
      dialog.getByRole("heading", { name: "ardc.g3.xlarge" }),
    ).toBeVisible();
    await expect(dialog.getByText("7 days selected")).toBeVisible();
    await expect(dialog.getByText("9 / 20")).toBeVisible();
    await expect(dialog.getByText("Eligible", { exact: true })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await dialog.getByRole("button", { name: "Reserve", exact: true }).click();
    await expect(page).toHaveURL(/\/reservations\/res-2$/);
    await expect(page.getByText(/being created/)).toBeVisible();
    await expect(page.getByText("Allocated", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expectNoSeriousA11yIssues(page);
  });

  test("extends and deletes a reservation", async ({ page }) => {
    await page.goto("/reservations/res-1?extend=true");
    const dialog = page.getByRole("dialog", { name: "Extend reservation" });
    await expect(dialog.getByText(/up to 5 days/)).toBeVisible();
    await dialog.getByRole("button", { name: "Extend", exact: true }).click();
    await expect(page.getByText("Extended reservation res-1.")).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Delete reservation res-1?" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(page).toHaveURL(/\/reservations$/);
    await expect(page.getByText("Reservation res-1 deleted.")).toBeVisible();
  });
});
