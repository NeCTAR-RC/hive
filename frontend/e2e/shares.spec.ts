import { expect, expectNoSeriousA11yIssues, test } from "./fixtures";
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

test.describe("shares", () => {
  test("lists shares with quota, creates one and opens the detail", async ({
    page,
  }) => {
    await page.goto("/shares/shares");
    await expect(main(page).getByText("2 of 10 shares")).toBeVisible();
    const shares = table(page, "Shares");
    await expect(shares.getByRole("link", { name: "datasets" })).toBeVisible();
    await page.getByRole("button", { name: "Create share" }).click();
    const create = dialog(page, "Create share");
    await create.getByRole("textbox", { name: "Share name" }).fill("fresh");
    await expectNoSeriousA11yIssues(page);
    await create.getByRole("button", { name: "Create share" }).click();
    await expectToast(page, "Share fresh is being created.");
    await expect(shares.getByRole("link", { name: "fresh" })).toBeVisible();
    await expect(main(page).getByText("3 of 10 shares")).toBeVisible();

    await shares.getByRole("link", { name: "datasets" }).click();
    await expectPage(page, "datasets");
    await expect(
      main(page).getByText("10.0.0.9:/volumes/_nogroup/abc"),
    ).toBeVisible();
    await checkPage(page);
    await openSection(page, "Access rules");
    await expect(table(page, "Access rules").getByText("alice")).toBeVisible();
    await page.getByRole("button", { name: "Add rule" }).click();
    const rule = dialog(page, "Add access rule");
    await rule.getByRole("textbox", { name: "Access to" }).fill("bob");
    await rule.getByRole("button", { name: "Add rule" }).click();
    await expectToast(page, "Access rule for bob is being added.");
  });
});

test.describe("share checks", () => {
  test("keeps a new share within the storage left", async ({ page }) => {
    await page.goto("/shares/shares?create=true");
    const create = dialog(page, "Create share");
    await expect(create.getByText("90 GiB left.")).toBeVisible();
    // One protocol on offer, and public shares are for administrators.
    await expect(
      create.getByRole("button", { name: /Share protocol/ }),
    ).toHaveCount(0);
    await expect(
      create.getByText("Make visible to users from all projects"),
    ).toHaveCount(0);
    await create.getByRole("textbox", { name: "Share name" }).fill("big");
    await create.getByRole("textbox", { name: "Size" }).fill("200");
    await create.getByRole("button", { name: "Create share" }).click();
    await expect(
      create.getByText(
        "A 200 GiB share cannot be created: 90 GiB of your quota is left",
      ),
    ).toBeVisible();
  });

  test("reverts a share to its newest snapshot", async ({ page }) => {
    await page.goto("/shares/shares");
    const shares = table(page, "Shares");
    // A second, newer snapshot: the revert must offer it, not the older one.
    await rowAction(row(shares, "datasets"), "Create snapshot");
    const snapshot = dialog(page, "Create snapshot of datasets");
    await snapshot
      .getByRole("textbox", { name: "Snapshot name" })
      .fill("newer");
    await snapshot.getByRole("button", { name: "Create snapshot" }).click();
    await expectToast(page, "Snapshot newer is being created.");

    await rowAction(row(shares, "datasets"), "Revert to snapshot");
    const revert = dialog(page, "Revert datasets");
    await expect(
      revert.getByRole("button", { name: /Snapshot/ }),
    ).toContainText("newer");
    await revert.getByRole("button", { name: "Revert" }).click();
    await expectToast(page, "Share datasets is being reverted.");
  });

  test("checks an access rule against the share's protocol", async ({
    page,
  }) => {
    await page.goto("/shares/shares/share-1?tab=rules");
    await page.getByRole("button", { name: "Add rule" }).click();
    const rule = dialog(page, "Add access rule");
    await rule.getByRole("button", { name: /Access type/ }).click();
    await expect(page.getByRole("option")).toHaveText(["CephX user"]);
    await page.getByRole("option", { name: "CephX user" }).click();
    await rule.getByRole("textbox", { name: "Access to" }).fill("bad user!");
    await rule.getByRole("button", { name: "Add rule" }).click();
    await expect(
      rule.getByText(
        "Use letters, digits, dashes and underscores, without the client. prefix",
      ),
    ).toBeVisible();
  });

  test("says what security services are for", async ({ page }) => {
    await page.goto("/shares/security-services");
    await expect(
      main(page).getByText(/A security service holds the directory settings/),
    ).toBeVisible();
    await rowAction(
      row(table(page, "Security services"), "corp-ad"),
      "Edit security service",
    );
    await expect(dialog(page, /corp-ad/)).toBeVisible();
  });
});

test.describe("snapshots, security services and share groups", () => {
  test("lists share snapshots", async ({ page }) => {
    await page.goto("/shares/snapshots");
    await expect(
      table(page, "Share snapshots").getByRole("link", {
        name: "datasets-snap",
      }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });

  test("creates a security service", async ({ page }) => {
    await page.goto("/shares/security-services");
    await page.getByRole("button", { name: "Create security service" }).click();
    const create = dialog(page, "Create security service");
    await create
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("ldap-1");
    await create.getByRole("textbox", { name: "DNS IP" }).fill("10.0.0.3");
    await create.getByRole("textbox", { name: "Server" }).fill("ldap.example");
    await create.getByRole("textbox", { name: "Domain" }).fill("example");
    await expectNoSeriousA11yIssues(page);
    await create.getByRole("button", { name: "Create", exact: true }).click();
    await expectToast(page, "Security service ldap-1 created.");
  });

  test("opens an empty share group", async ({ page }) => {
    await page.goto("/shares/share-groups");
    await table(page, "Share groups")
      .getByRole("link", { name: "group-a" })
      .click();
    await expectPage(page, "group-a");
    await expect(
      main(page).getByText("No shares in this group yet."),
    ).toBeVisible();
    await checkPage(page);
  });
});

test("keeps the shares search when coming back to the list", async ({
  page,
}) => {
  await expectSearchSurvivesBack(page, {
    path: "/shares/shares",
    table: "Shares",
    text: "data",
    link: "datasets",
  });
});
