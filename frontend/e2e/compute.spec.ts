import type { Page } from "@playwright/test";
import {
  expect,
  expectNoHorizontalScroll,
  expectNoSeriousA11yIssues,
  test,
} from "./fixtures";

/** A flavour class card: a React Aria radio whose label is the card. */
function classTab(page: Page, name: RegExp) {
  return page
    .getByRole("radiogroup", { name: "Flavour class" })
    .getByText(name)
    .first();
}

test.describe("instances", () => {
  test("lists instances with status and search", async ({ page }) => {
    await page.goto("/compute/instances");
    await expect(
      page.getByRole("heading", { name: "Instances", level: 1 }),
    ).toBeVisible();
    const table = page.getByRole("grid", { name: "Instances" });
    await expect(table.getByRole("link", { name: "web-1" })).toBeVisible();
    await expect(table.getByRole("link", { name: "db-1" })).toBeVisible();
    await expect(table.getByText("ERROR")).toBeVisible();
    await page.getByRole("searchbox", { name: "Search" }).fill("db");
    await expect(table.getByRole("link", { name: "db-1" })).toBeVisible();
    await expect(table.getByRole("link", { name: "web-1" })).toHaveCount(0);
    await expect(page).toHaveURL(/q=db/);
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("shuts off an instance through the row menu", async ({ page }) => {
    await page.goto("/compute/instances");
    const row = page.getByRole("row", { name: /web-1/ });
    await row.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Shut off instance" }).click();
    const dialog = page.getByRole("dialog", { name: "Shut off web-1?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Shut off" }).click();
    await expect(page.getByText("web-1 shutting off.")).toBeVisible();
    await expect(row.getByText("SHUTOFF")).toBeVisible();
  });

  test("shows the detail tabs", async ({ page, isMobile }) => {
    const tabRole = isMobile ? "button" : "tab";
    await page.goto("/compute/instances/i-web-1");
    await expect(
      page.getByRole("heading", { name: "web-1", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Production web server")).toBeVisible();
    await expect(page.getByText("0.5 SU/hour")).toBeVisible();
    await page.getByRole(tabRole, { name: "Interfaces" }).click();
    await expect(
      page
        .getByRole(isMobile ? "group" : "tabpanel", { name: "Interfaces" })
        .getByText("203.0.113.10"),
    ).toBeVisible();
    await page.getByRole(tabRole, { name: "Log", exact: true }).click();
    await expect(page.getByText(/Linux version 6.8.0/)).toBeVisible();
    await expect(page).toHaveURL(/tab=log/);
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("walks the launch wizard", async ({ page }) => {
    await page.goto("/compute/instances/launch");
    await expect(
      page.getByRole("heading", { name: "Launch instance", level: 1 }),
    ).toBeVisible();
    await page.getByRole("textbox", { name: "Instance name" }).fill("e2e-test");
    await page.getByRole("button", { name: /Availability zone/ }).click();
    await page.getByRole("option", { name: "melbourne-qh2" }).click();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Next" }).click();

    // Source: community images stay hidden until searched for.
    await expect(
      page.getByRole("radio", { name: /community-bioinformatics/ }),
    ).toHaveCount(0);
    await page
      .getByText(/NeCTAR Ubuntu 24\.04/)
      .first()
      .click();
    await page.getByRole("button", { name: "Next" }).click();

    // Flavour: a tab per class with its flavours inside; Reserved opens
    // first because the mock project has a reservation flavour, the
    // preemptible row carries the notice once chosen, and the choice
    // survives a look at another class until a row replaces it.
    // The reservation flavour is named after its warre reservation once
    // the reservations list arrives.
    await expect(
      page.getByRole("row", { name: /ardc.g3.xlarge reservation/ }),
    ).toBeVisible();
    await classTab(page, /Balanced \(m3\)/).click();
    await expect(page.getByRole("row", { name: /m3.small/ })).toBeVisible();
    await classTab(page, /Preemptible \(p3\)/).click();
    await page.getByRole("row", { name: /p3.small/ }).click();
    await expect(page.getByText(/maximum lifetime of 24 hours/)).toBeVisible();
    await classTab(page, /Balanced \(m3\)/).click();
    await expect(page.getByRole("row", { name: /p3.small/ })).toHaveCount(0);
    await expect(page.getByText(/maximum lifetime of 24 hours/)).toBeVisible();
    await page.getByRole("row", { name: /m3.small/ }).click();
    await expect(page.getByText(/maximum lifetime of 24 hours/)).toHaveCount(0);
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Next" }).click();

    // Networks: classic is preselected; a second network can be dragged to
    // become the first interface. The keyboard path: the handle lifts the
    // row, the arrow keys pick the drop point, Enter drops.
    await expect(page.getByRole("checkbox", { name: /classic/ })).toBeChecked();
    // RAC checkboxes are hidden inputs: click the label text. A port on
    // that network is also offered, so anchor to the network's own label.
    await page
      .getByText(/^private-net/)
      .first()
      .click();
    await expect(
      page.getByRole("checkbox", { name: /^private-net/ }),
    ).toBeChecked();
    const order = page.getByRole("grid", { name: "Interface order" });
    await expect(order.getByRole("row")).toHaveCount(2);
    await page.getByRole("button", { name: "Drag private-net" }).focus();
    await page.keyboard.press("Enter");
    // React Aria renders the drop targets once the drag starts; wait for
    // them before moving, or the keys land before they exist.
    const before = page.getByRole("button", { name: /^Insert before classic/ });
    await expect(before).toBeVisible();
    await page.keyboard.press("ArrowUp");
    await expect(before).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(order.getByRole("row").first()).toContainText("private-net");
    const summary = page.getByRole("complementary", { name: "Summary" });
    await expect(summary).toContainText("private-net, classic");
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      page.getByRole("checkbox", { name: /^default/ }),
    ).toBeChecked();
    await page.getByRole("button", { name: "Next" }).click();
    // The step list also has a "Key pair" button; the select is named by
    // its placeholder and label.
    await page.getByRole("button", { name: /Choose a key pair/ }).click();
    await page.getByRole("option", { name: /ada-laptop/ }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(summary.getByText("0.5 SU/hour")).toBeVisible();
    await page.getByRole("button", { name: "Launch", exact: true }).click();
    await expect(page).toHaveURL(/\/compute\/instances$/);
    await expect(
      page.getByText("Instance e2e-test is launching."),
    ).toBeVisible();
    await expect(
      page
        .getByRole("grid", { name: "Instances" })
        .getByRole("link", { name: "e2e-test" }),
    ).toBeVisible();
  });

  test("jumps between launch steps and marks the incomplete ones", async ({
    page,
  }) => {
    await page.goto("/compute/instances/launch");
    const steps = page.getByRole("list", { name: "Launch steps" });
    const source = steps.getByRole("listitem").filter({ hasText: "Source" });
    await expect(source).toHaveAttribute("data-status", "pending");
    // The status is part of the step's name, so a screen reader hears it.
    await steps.getByRole("button", { name: /^Key pair/ }).click();
    await expect(
      page.getByRole("button", { name: /Choose a key pair/ }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await steps
      .getByRole("button", { name: /^Source\s*\(incomplete\)/ })
      .click();
    await page
      .getByText(/NeCTAR Ubuntu 24\.04/)
      .first()
      .click();
    await expect(source).not.toHaveAttribute("data-status", "pending");
    await expect(
      steps.getByRole("listitem").filter({ hasText: "Details" }),
    ).toHaveAttribute("data-status", "pending");
  });

  test("boots an image onto a new volume", async ({ page }) => {
    await page.goto("/compute/instances/launch");
    await page.getByRole("textbox", { name: "Instance name" }).fill("e2e-bfv");
    await page.getByRole("button", { name: /Availability zone/ }).click();
    await page.getByRole("option", { name: "melbourne-qh2" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page
      .getByText(/NeCTAR Ubuntu 24\.04/)
      .first()
      .click();
    await expect(
      page
        .getByText(/^Selected:/)
        .locator("..")
        .getByText(/NeCTAR Ubuntu/),
    ).toBeVisible();
    // A RAC Switch's input is visually hidden: click its label.
    await page.getByText("Create a new volume from the image").click();
    // The mock image has min_disk 10.
    await expect(
      page.getByRole("textbox", { name: /Volume size/ }),
    ).toHaveValue("10");
    await page.getByRole("button", { name: /Volume type/ }).click();
    await page.getByRole("option", { name: /qh2-ssd/ }).click();
    const summary = page.getByRole("complementary", { name: "Summary" });
    await expect(summary).toContainText("New 10 GB volume (qh2-ssd)");
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Next" }).click();
    // The root disk of a flavour no longer has to hold the image, but a
    // flavour raises the size to its own root disk.
    await classTab(page, /Balanced \(m3\)/).click();
    await page.getByRole("row", { name: /m3.small/ }).click();
    await expect(summary).toContainText("New 30 GB volume (qh2-ssd)");
  });
});

test.describe("key pairs", () => {
  test("creates and deletes a key pair", async ({ page }) => {
    await page.goto("/compute/key-pairs");
    await expect(
      page.getByRole("heading", { name: "Key Pairs", level: 1 }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: "Create key pair" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Create key pair" });
    await dialog
      .getByRole("textbox", { name: "Key pair name" })
      .fill("e2e-key");
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Create key pair" }).click();
    expect((await download).suggestedFilename()).toBe("e2e-key.pem");
    const table = page.getByRole("grid", { name: "Key pairs" });
    await expect(table.getByRole("link", { name: "e2e-key" })).toBeVisible();
    const row = page.getByRole("row", { name: /e2e-key/ });
    await row.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Delete key pair" }).click();
    await page
      .getByRole("dialog", { name: "Delete key pair e2e-key?" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(table.getByRole("link", { name: "e2e-key" })).toHaveCount(0);
  });
});

test.describe("images", () => {
  test("hides community images until searched", async ({ page }) => {
    await page.goto("/compute/images");
    const table = page.getByRole("grid", { name: "Images" });
    await expect(
      table.getByRole("link", { name: /NeCTAR Ubuntu 24.04/ }),
    ).toBeVisible();
    await expect(
      table.getByRole("link", { name: "community-bioinformatics" }),
    ).toHaveCount(0);
    await page.getByRole("searchbox", { name: "Search" }).fill("community");
    await expect(
      table.getByRole("link", { name: "community-bioinformatics" }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("creates an image from a file", async ({ page }) => {
    await page.goto("/compute/images");
    await page.getByRole("button", { name: "Create image" }).click();
    const dialog = page.getByRole("dialog", { name: "Create image" });
    await dialog.getByRole("textbox", { name: "Image name" }).fill("my-disk");
    const chooser = page.waitForEvent("filechooser");
    await dialog.getByRole("button", { name: "Choose file" }).click();
    await (
      await chooser
    ).setFiles({
      name: "disk.qcow2",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("not really a disk image"),
    });
    await expect(dialog.getByText(/disk\.qcow2/)).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await dialog.getByRole("button", { name: "Create image" }).click();
    await expect(page.getByText("uploaded and ready to use")).toBeVisible();
    const row = page
      .getByRole("grid", { name: "Images" })
      .getByRole("row", { name: /my-disk/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("active")).toBeVisible();
  });

  test("shows an image's properties", async ({ page }) => {
    await page.goto("/compute/images/img-ubuntu");
    await expect(
      page.getByRole("heading", { name: /NeCTAR Ubuntu 24.04/, level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("default_user")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });
});

test.describe("overview", () => {
  test("shows quota and usage", async ({ page }) => {
    await page.goto("/compute/overview");
    await expect(
      page.getByRole("heading", { name: "Overview", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("3 of 10")).toBeVisible();
    await expect(page.getByText("321.5")).toBeVisible();
    await expect(
      page.getByRole("img", { name: /Daily service unit/ }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: "View as table" }).click();
    await expect(
      page.getByRole("columnheader", { name: "Service units" }),
    ).toBeVisible();
    await expect(page.getByRole("cell", { name: "10" })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });
});
