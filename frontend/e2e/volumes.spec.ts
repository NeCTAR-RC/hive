import {
  expect,
  expectNoHorizontalScroll,
  expectNoSeriousA11yIssues,
  test,
} from "./fixtures";

test.describe("volumes", () => {
  test("lists volumes with attachments and status", async ({ page }) => {
    await page.goto("/storage/volumes");
    await expect(
      page.getByRole("heading", { name: "Volumes", level: 1 }),
    ).toBeVisible();
    const table = page.getByRole("grid", { name: "Volumes" });
    await expect(table.getByRole("link", { name: "web-data" })).toBeVisible();
    await expect(table.getByText("In use")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("requires a zone and filters types by zone when creating", async ({
    page,
  }) => {
    await page.goto("/storage/volumes");
    await page.getByRole("button", { name: "Create volume" }).click();
    const dialog = page.getByRole("dialog", { name: "Create volume" });
    await dialog.getByRole("textbox", { name: "Volume name" }).fill("fresh");
    await expectNoSeriousA11yIssues(page);
    await dialog.getByRole("button", { name: "Create volume" }).click();
    await expect(
      dialog.getByText("An availability zone is required"),
    ).toBeVisible();
    await expect(page).toHaveURL(/create=true/);

    await dialog.getByRole("button", { name: /Availability zone/ }).click();
    await page.getByRole("option", { name: "monash-02" }).click();
    await dialog.getByRole("button", { name: /Volume type/ }).click();
    await expect(
      page.getByRole("option", { name: /monash-ssd/ }),
    ).toBeVisible();
    await expect(page.getByRole("option", { name: /qh2-ssd/ })).toHaveCount(0);
    await page.getByRole("option", { name: /^standard/ }).click();
    await dialog.getByRole("button", { name: "Create volume" }).click();
    await expect(page.getByText("Creating volume fresh.")).toBeVisible();
    await expect(
      page.getByRole("grid", { name: "Volumes" }).getByRole("link", {
        name: "fresh",
      }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/create=true/);
  });

  test("creates a volume from a snapshot without zone or type", async ({
    page,
  }) => {
    await page.goto("/storage/volumes/create?snapshot_id=snap-1");
    const dialog = page.getByRole("dialog", { name: "Create volume" });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/snapshot=snap-1/);
    await expect(
      dialog.getByText(/inherits|source's volume type/),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /Availability zone/ }),
    ).toHaveCount(0);
    await expect(dialog.getByRole("textbox", { name: "Size" })).toHaveValue(
      "20",
    );
    await dialog.getByRole("button", { name: "Create volume" }).click();
    await expect(page.getByText(/Creating volume/)).toBeVisible();
  });

  test("shows a volume and manages attachments", async ({ page }) => {
    await page.goto("/storage/volumes/vol-1");
    await expect(
      page.getByRole("heading", { name: "web-data", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "/dev/vdb on web-1" }).first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("grid", { name: "Snapshots of this volume" })
        .getByRole("link", { name: "web-data-before-upgrade" }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);

    await page.getByRole("button", { name: "Manage attachments" }).click();
    const dialog = page.getByRole("dialog", { name: /Manage attachments/ });
    await dialog.getByRole("button", { name: "Detach" }).click();
    await dialog.getByRole("button", { name: "Yes, detach" }).click();
    await expect(
      page.getByText("Detaching volume web-data from web-1."),
    ).toBeVisible();
  });

  test("attaches a volume from the instance", async ({ page, isMobile }) => {
    await page.goto("/compute/instances/i-db-1?tab=volumes");
    await page.getByRole("button", { name: "Attach volume" }).click();
    const dialog = page.getByRole("dialog", { name: "Attach volume to db-1" });
    await dialog.getByRole("button", { name: /Volume/ }).click();
    await page.getByRole("option", { name: /boot-ubuntu/ }).click();
    await dialog.getByRole("button", { name: "Attach volume" }).click();
    await expect(
      page.getByText(/Attaching volume boot-ubuntu to db-1/),
    ).toBeVisible();
    if (!isMobile) await expectNoSeriousA11yIssues(page);
  });
});

test.describe("snapshots and backups", () => {
  test("lists snapshots and offers create volume", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/storage/snapshots");
    await expect(
      page.getByRole("heading", { name: "Volume Snapshots", level: 1 }),
    ).toBeVisible();
    const row = page
      .getByRole("grid", { name: "Volume snapshots" })
      .getByRole("row", { name: /web-data-before-upgrade/ });
    // The Volume column is hidden by default on phones.
    if (!isMobile) {
      await expect(
        row.getByRole("link", { name: "web-data", exact: true }),
      ).toBeVisible();
    }
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
    await row.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Create volume" }).click();
    await expect(page).toHaveURL(/\/storage\/volumes\?.*snapshot=snap-1/);
    await expect(
      page.getByRole("dialog", { name: "Create volume" }),
    ).toBeVisible();
  });

  test("restores a backup into a new volume", async ({ page }) => {
    await page.goto("/storage/backups");
    await expect(
      page.getByRole("heading", { name: "Volume Backups", level: 1 }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
    const row = page
      .getByRole("grid", { name: "Volume backups" })
      .getByRole("row", { name: /web-data-nightly/ });
    await row.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Restore backup" }).click();
    const dialog = page.getByRole("dialog", { name: /Restore backup/ });
    await expect(dialog.getByText("The backup holds 20 GB")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await dialog.getByRole("button", { name: "Restore backup" }).click();
    await expect(
      page.getByText(/Restoring backup web-data-nightly into new volume/),
    ).toBeVisible();
  });
});
