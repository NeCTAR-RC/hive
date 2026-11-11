import type { Locator, Page } from "@playwright/test";
import {
  expect,
  expectNoSeriousA11yIssues,
  failRequest,
  setInstancePageSize,
  test,
} from "./fixtures";
import {
  batchAction,
  checkPage,
  dialog,
  expectPage,
  expectToast,
  main,
  openSection,
  row,
  rowAction,
  section,
  table,
  tick,
  withSelected,
} from "./helpers";

/**
 * One poll of a list that is waiting on a change (`pollIntervals.standard`
 * in lib/queries).
 */
const POLL = "00:05";

/**
 * Picks a radio the way a keyboard user does. The library hides the native
 * input visually, so Playwright cannot click it.
 */
async function press(control: Locator) {
  await control.focus();
  await control.press("Space");
}

/** Fills the launch wizard's details step and moves to the source step. */
async function startLaunch(page: Page) {
  await page.goto("/compute/instances/launch");
  await page.getByRole("textbox", { name: "Instance name" }).fill("e2e-test");
  await page.getByRole("button", { name: /Availability zone/ }).click();
  await page.getByRole("option", { name: "melbourne-qh2" }).click();
  await page.getByRole("button", { name: "Next" }).click();
}

/** The flavour class card whose title starts with `title`. */
function flavourClass(page: Page, title: string): Locator {
  return page
    .getByRole("radiogroup", { name: "Flavour class" })
    .getByRole("radio", {
      name: new RegExp(`^${title.replace(/[()]/g, "\\$&")}`),
    });
}

/** Opens a flavour class card, then chooses a flavour row in it. */
async function chooseFlavour(page: Page, title: string, flavour: RegExp) {
  await press(flavourClass(page, title));
  await page.getByRole("row", { name: flavour }).click();
}

/** The launch wizard's image radio for the seeded Ubuntu image. */
function ubuntuImage(page: Page): Locator {
  return page
    .getByRole("radiogroup", { name: "Source", exact: true })
    .getByRole("radio", { name: /NeCTAR Ubuntu 24\.04/ });
}

test.describe("instances", () => {
  test("lists instances with status and search", async ({ page }) => {
    await page.goto("/compute/instances");
    await expectPage(page, "Instances");
    const instances = table(page, "Instances");
    await expect(instances.getByRole("link", { name: "web-1" })).toBeVisible();
    await expect(instances.getByRole("link", { name: "db-1" })).toBeVisible();
    await expect(instances.getByText("ERROR")).toBeVisible();
    await page.getByRole("searchbox", { name: "Search" }).fill("db");
    await expect(instances.getByRole("link", { name: "db-1" })).toBeVisible();
    await expect(instances.getByRole("link", { name: "web-1" })).toHaveCount(0);
    await expect(page).toHaveURL(/q=db/);
    await checkPage(page);

    // The search lives in the URL, so it survives a visit to a row.
    await instances.getByRole("link", { name: "db-1" }).click();
    await expectPage(page, "db-1");
    await page.goBack();
    await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(
      "db",
    );
    await expect(instances.getByRole("link", { name: "web-1" })).toHaveCount(0);
  });

  test("shuts off an instance through the row menu", async ({ page }) => {
    await page.goto("/compute/instances");
    const web = row(table(page, "Instances"), "web-1");
    await rowAction(web, "Shut off instance");
    await dialog(page, "Shut off web-1?")
      .getByRole("button", { name: "Shut off" })
      .click();
    await expectToast(page, "Shutting off instance web-1.");
    await expect(web.getByText("SHUTOFF")).toBeVisible();
  });

  test("shows the detail tabs", async ({ page }) => {
    await page.goto("/compute/instances/i-web-1");
    await expectPage(page, "web-1");
    await expect(main(page).getByText("Production web server")).toBeVisible();
    await expect(main(page).getByText("0.5 SU/hour")).toBeVisible();
    await openSection(page, "Interfaces");
    await expect(
      section(page, "Interfaces").getByText("203.0.113.10"),
    ).toBeVisible();
    await openSection(page, "Log");
    await expect(main(page).getByText(/Linux version 6.8.0/)).toBeVisible();
    await expect(page).toHaveURL(/tab=log/);
    await checkPage(page);
  });

  test("walks the launch wizard", async ({ page }) => {
    await page.goto("/compute/instances/launch");
    await expectPage(page, "Launch instance");
    await page.getByRole("textbox", { name: "Instance name" }).fill("e2e-test");
    await page.getByRole("button", { name: /Availability zone/ }).click();
    await page.getByRole("option", { name: "melbourne-qh2" }).click();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Next" }).click();

    // Source: community images stay hidden until searched for.
    await expect(
      page.getByRole("radio", { name: /community-bioinformatics/ }),
    ).toHaveCount(0);
    await press(ubuntuImage(page));
    await page.getByRole("button", { name: "Next" }).click();

    // Flavour: the classes are cards; the preemptible row carries the
    // notice once chosen, and stays chosen while another class is open.
    await chooseFlavour(page, "Preemptible (p3)", /p3.small/);
    await expect(
      main(page).getByText(/maximum lifetime of 24 hours/),
    ).toBeVisible();
    await press(flavourClass(page, "Balanced (m3)"));
    await expect(page.getByRole("row", { name: /p3.small/ })).toHaveCount(0);
    await expect(
      main(page).getByText(/maximum lifetime of 24 hours/),
    ).toBeVisible();
    await page.getByRole("row", { name: /m3.small/ }).click();
    await page.getByRole("button", { name: "Next" }).click();

    // Networks: classic is preselected.
    await expect(page.getByRole("checkbox", { name: /classic/ })).toBeChecked();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      page.getByRole("checkbox", { name: /^default/ }),
    ).toBeChecked();
    // Security groups: a group's rules open under it, loaded on demand.
    await page.getByRole("button", { name: "Rules (3) in web" }).click();
    const webRules = table(page, "Rules in web");
    await expect(row(webRules, /443/)).toContainText("0.0.0.0/0");
    await expect(row(webRules, /203\.0\.113\.0\/24/)).toContainText("22");
    await tick(page.getByRole("checkbox", { name: /^web/ }));
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: /Key pair/ }).click();
    await page.getByRole("option", { name: /ada-laptop/ }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      page
        .getByRole("complementary", { name: "Summary" })
        .getByText("0.5 SU/hour"),
    ).toBeVisible();
    await expect(
      page
        .getByRole("complementary", { name: "Summary" })
        .getByText("default, web"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Launch", exact: true }).click();
    await expect(page).toHaveURL(/\/compute\/instances$/);
    await expectToast(page, "Instance e2e-test is launching.");
    await expect(
      table(page, "Instances").getByRole("link", { name: "e2e-test" }),
    ).toBeVisible();
  });
});

test.describe("launch wizard", () => {
  test("switching source type clears the chosen source", async ({ page }) => {
    await startLaunch(page);
    const sources = page.getByRole("radiogroup", {
      name: "Source",
      exact: true,
    });
    await press(ubuntuImage(page));
    await expect(ubuntuImage(page)).toBeChecked();

    await press(page.getByRole("radio", { name: "Volume", exact: true }));
    await expect(sources.getByRole("radio", { checked: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Next" }).click();
    await expect(main(page).getByText("Choose a source")).toBeVisible();

    // Back on images, the image chosen before is not silently kept either.
    await press(page.getByRole("radio", { name: "Image", exact: true }));
    await expect(sources.getByRole("radio", { checked: true })).toHaveCount(0);
  });

  test("a key pair created from the wizard is selected", async ({ page }) => {
    await startLaunch(page);
    await press(ubuntuImage(page));
    await page.getByRole("button", { name: "Next" }).click();
    await chooseFlavour(page, "Balanced (m3)", /m3.small/);
    for (let step = 0; step < 3; step += 1) {
      await page.getByRole("button", { name: "Next" }).click();
    }
    await page.getByRole("button", { name: "Create key pair" }).click();
    const create = dialog(page, "Create key pair");
    await create
      .getByRole("textbox", { name: "Key pair name" })
      .fill("wizard-key");
    const download = page.waitForEvent("download");
    await create.getByRole("button", { name: "Create key pair" }).click();
    await download;
    await expect(
      page.getByRole("button", { name: /^wizard-key \(SHA256/ }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("complementary", { name: "Summary" })
        .getByText("wizard-key"),
    ).toBeVisible();
  });

  test("names the chosen source, keeps it listed and clears it", async ({
    page,
  }) => {
    await startLaunch(page);
    await expect(main(page).getByText("No source selected yet.")).toBeVisible();
    await press(ubuntuImage(page));
    await expect(main(page).getByText(/^Selected:/)).toContainText(
      "NeCTAR Ubuntu 24.04",
    );

    // A search that misses it still lists the chosen image, checked.
    await page.getByRole("searchbox", { name: "Search sources" }).fill("rocky");
    await expect(ubuntuImage(page)).toBeChecked();
    await expect(
      page.getByRole("radio", { name: /NeCTAR Rocky Linux 9/ }),
    ).toBeVisible();

    await main(page)
      .getByRole("button", { name: "Clear", exact: true })
      .click();
    await expect(main(page).getByText("No source selected yet.")).toBeVisible();
    await expect(ubuntuImage(page)).toHaveCount(0);
  });

  test("offers the flavour classes as cards, reservation flavours first", async ({
    page,
  }) => {
    await startLaunch(page);
    await press(ubuntuImage(page));
    await page.getByRole("button", { name: "Next" }).click();
    const classes = page.getByRole("radiogroup", { name: "Flavour class" });
    await expect(classes.getByRole("radio")).toHaveCount(5);
    await expect(flavourClass(page, "Reserved")).toBeChecked();
    await expect(classes).toContainText("2 flavours, from 0.5 SU/hour");
    await expect(classes).toContainText("Suited to most workloads");
    await expectNoSeriousA11yIssues(page);

    // A reservation flavour is named after its reservation and sets the zone.
    const reserved = page.getByRole("row", {
      name: /ardc\.g3\.xlarge reservation \(until/,
    });
    await reserved.click();
    const summary = page.getByRole("complementary", { name: "Summary" });
    await expect(summary.getByText("Set by the reservation")).toBeVisible();
    await expect(
      summary.getByText(/ardc\.g3\.xlarge reservation/),
    ).toBeVisible();

    // A flavour with no class is under Other.
    await chooseFlavour(page, "Other", /test\.large/);
    await expect(summary.getByText("melbourne-qh2")).toBeVisible();
    await chooseFlavour(page, "Reserved", /ardc\.g3\.xlarge/);
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(
      main(page).getByText(/^Set by the reservation: a reservation flavour/),
    ).toBeVisible();

    const sent = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().endsWith("/api/compute/instances"),
    );
    for (let step = 0; step < 6; step += 1) {
      await page.getByRole("button", { name: "Next" }).click();
    }
    await page.getByRole("button", { name: "Launch", exact: true }).click();
    expect((await sent).postDataJSON()).toMatchObject({
      flavor_id: "r-f1",
      availability_zone: null,
    });
  });

  test("a reserved flavour the project cannot see is explained", async ({
    page,
  }) => {
    await page.goto("/compute/instances/launch?flavor=r-gone");
    await page.getByRole("textbox", { name: "Instance name" }).fill("vm");
    await page.getByRole("button", { name: "Next" }).click();
    await press(ubuntuImage(page));
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      main(page).getByText(
        /The reserved flavour r-gone is not available to this project/,
      ),
    ).toBeVisible();
  });

  test("a deep-linked reservation flavour is chosen in its card", async ({
    page,
  }) => {
    await page.goto("/compute/instances/launch?flavor=r-f1");
    await expect(
      page
        .getByRole("complementary", { name: "Summary" })
        .getByText(/ardc\.g3\.xlarge reservation/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Availability zone/ }),
    ).toBeDisabled();

    // On the Flavour step the Reserved card is open and the flavour chosen.
    await page.getByRole("textbox", { name: "Instance name" }).fill("vm");
    await page.getByRole("button", { name: "Next" }).click();
    await press(ubuntuImage(page));
    await page.getByRole("button", { name: "Next" }).click();
    await expect(flavourClass(page, "Reserved")).toBeChecked();
    await expect(
      page.getByRole("row", {
        name: /ardc\.g3\.xlarge reservation/,
        selected: true,
      }),
    ).toBeVisible();
  });

  test("reorders the chosen networks with the keyboard", async ({ page }) => {
    await startLaunch(page);
    await press(ubuntuImage(page));
    await page.getByRole("button", { name: "Next" }).click();
    await chooseFlavour(page, "Balanced (m3)", /m3.small/);
    await page.getByRole("button", { name: "Next" }).click();

    // One network needs no order; a second one shows it.
    const order = page.getByRole("grid", { name: "Interface order" });
    await expect(order).toHaveCount(0);
    await tick(
      page
        .getByRole("group", { name: "Networks", exact: true })
        .getByRole("checkbox", { name: /^private-net/ }),
    );
    await expect(order.getByRole("row")).toHaveText([
      /1\s*classic/,
      /2\s*private-net/,
    ]);
    await expectNoSeriousA11yIssues(page);

    // The way a keyboard user gets there: the list takes focus on its first
    // row, ArrowDown goes to the second, ArrowRight into its drag handle.
    // (Focusing the handle directly is undone: the list moves focus to
    // its first row.) Enter lifts the row and focus moves to a drop point;
    // ArrowUp picks the one before the first row, Enter drops, and focus
    // comes back to the moved row.
    const handle = order.getByRole("button", { name: "Drag private-net" });
    await order.getByRole("row").first().focus();
    await expect(order.getByRole("row").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(order.getByRole("row").nth(1)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(handle).toBeFocused();
    await page.keyboard.press("Enter");
    // The drop points exist once the drag has started, and focus lands on
    // the one after the lifted row a moment later; an arrow key sent
    // before that lands on nothing. Two ArrowUps go to the one before the
    // first row.
    await expect(
      order.getByRole("button", { name: /^Insert after private-net/ }),
    ).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(
      order.getByRole("button", { name: /^Insert between/ }),
    ).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(
      order.getByRole("button", { name: /^Insert before classic/ }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(order.getByRole("row")).toHaveText([
      /1\s*private-net/,
      /2\s*classic/,
    ]);
    await expect(order.getByRole("row").first()).toBeFocused();
    await expect(
      page
        .getByRole("complementary", { name: "Summary" })
        .getByText("private-net, classic"),
    ).toBeVisible();

    for (let step = 0; step < 3; step += 1) {
      await page.getByRole("button", { name: "Next" }).click();
    }
    const sent = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().endsWith("/api/compute/instances"),
    );
    await page.getByRole("button", { name: "Launch", exact: true }).click();
    const body = (await sent).postDataJSON() as { networks: string[] };
    expect(body.networks).toEqual(["net-private", expect.any(String)]);
  });
});

test.describe("instance actions", () => {
  test("batch start skips instances that cannot start", async ({ page }) => {
    await page.goto("/compute/instances");
    const instances = table(page, "Instances");
    await expect(withSelected(page)).toBeDisabled();
    await tick(instances.getByRole("checkbox", { name: "Select web-1" }));
    // web-1 is active: Start has nothing to run on yet, and says so.
    await withSelected(page).click();
    const start = page.getByRole("menuitem", { name: "Start", exact: true });
    await expect(start).toBeDisabled();
    await expect(start).toHaveAccessibleDescription(
      "Not available for the selected rows",
    );
    await page.keyboard.press("Escape");

    await tick(instances.getByRole("checkbox", { name: "Select db-1" }));
    await batchAction(page, "Start");
    await expectToast(
      page,
      "Skipped web-1: not available in the current state.",
    );
    await expectToast(page, "Starting instance db-1.");
    await expect(withSelected(page)).toBeDisabled();
  });

  test("batch delete names the rows it skips", async ({ page }) => {
    await page.goto("/compute/instances");
    const instances = table(page, "Instances");
    await rowAction(row(instances, "web-1"), "Lock instance");
    await expectToast(page, "Locked instance web-1.");

    await tick(instances.getByRole("checkbox", { name: "Select web-1" }));
    await tick(instances.getByRole("checkbox", { name: "Select db-1" }));
    await batchAction(page, "Delete");
    await expect(
      dialog(page, "Delete db-1?").getByText(
        "Skipped web-1: not available in the current state.",
      ),
    ).toBeVisible();
  });

  test("the row menu lists an unavailable action with the reason", async ({
    page,
  }) => {
    await page.goto("/compute/instances");
    const web = row(table(page, "Instances"), "web-1");
    await web.getByRole("button", { name: "Actions" }).click();
    // web-1 is active: Start is listed, disabled, and says why.
    const start = page.getByRole("menuitem", {
      name: "Start instance",
      exact: true,
    });
    await expect(start).toBeDisabled();
    await expect(start).toHaveAccessibleDescription(
      "Not available while the status is ACTIVE",
    );
    await expect(
      page.getByRole("menuitem", { name: "Shut off instance", exact: true }),
    ).toBeEnabled();
  });

  test("opens the console in a new tab", async ({ page, context }) => {
    await context.route("https://console.example.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<title>Console</title>",
      }),
    );
    await page.goto("/compute/instances");
    const popup = page.waitForEvent("popup");
    await rowAction(
      row(table(page, "Instances"), "web-1"),
      "Console (opens in a new tab)",
    );
    const tab = await popup;
    await expect(tab).toHaveURL(/console\.example\.test\/vnc_auto\.html/);
  });

  test("a snapshot finishes on the images page", async ({ page }) => {
    await page.goto("/compute/instances");
    await rowAction(row(table(page, "Instances"), "web-1"), "Create snapshot");
    const create = dialog(page, /Create snapshot of web-1/);
    await create
      .getByRole("textbox", { name: "Snapshot name" })
      .fill("e2e-snap");
    await create.getByRole("button", { name: "Create snapshot" }).click();
    const snapshot = row(table(page, "Images"), /e2e-snap/);
    await expect(snapshot.getByText("queued")).toBeVisible();
    // The list polls while Glance works; no refresh needed.
    await page.clock.runFor(POLL);
    await expect(snapshot.getByText("active")).toBeVisible();
  });

  test("says when the list holds only the first page", async ({ page }) => {
    await setInstancePageSize(page, 2);
    await page.goto("/compute/instances");
    await expect(
      main(page).getByText(
        "Only the first 2 instances are shown; this project has more.",
      ),
    ).toBeVisible();
  });
});

test.describe("key pairs", () => {
  test("creates and deletes a key pair", async ({ page }) => {
    await page.goto("/compute/key-pairs");
    await expectPage(page, "Key pairs");
    await checkPage(page);
    await page.getByRole("button", { name: "Create key pair" }).click();
    const create = dialog(page, "Create key pair");
    await create
      .getByRole("textbox", { name: "Key pair name" })
      .fill("e2e-key");
    const download = page.waitForEvent("download");
    await create.getByRole("button", { name: "Create key pair" }).click();
    expect((await download).suggestedFilename()).toBe("e2e-key.pem");
    const created = row(table(page, "Key pairs"), "e2e-key");
    await expect(created).toBeVisible();
    await rowAction(created, "Delete key pair");
    await dialog(page, "Delete key pair e2e-key?")
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(created).toHaveCount(0);
  });
});

test.describe("images", () => {
  test("hides community images until searched", async ({ page }) => {
    await page.goto("/compute/images");
    const images = table(page, "Images");
    await expect(
      images.getByRole("link", { name: /NeCTAR Ubuntu 24.04/ }),
    ).toBeVisible();
    await expect(
      images.getByRole("link", { name: "community-bioinformatics" }),
    ).toHaveCount(0);
    await page.getByRole("searchbox", { name: "Search" }).fill("community");
    await expect(
      images.getByRole("link", { name: "community-bioinformatics" }),
    ).toBeVisible();
    await checkPage(page);
  });

  test("creates an image from a file", async ({ page }) => {
    await page.goto("/compute/images");
    await page.getByRole("button", { name: "Create image" }).click();
    const create = dialog(page, "Create image");
    await create.getByRole("textbox", { name: "Image name" }).fill("my-disk");
    const chooser = page.waitForEvent("filechooser");
    await create.getByRole("button", { name: "Choose file" }).click();
    await (
      await chooser
    ).setFiles({
      name: "disk.qcow2",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("not really a disk image"),
    });
    await expect(create.getByText(/disk\.qcow2/)).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await create.getByRole("button", { name: "Create image" }).click();
    await expectToast(page, /uploaded and ready to use/);
    const image = row(table(page, "Images"), /my-disk/);
    await expect(image).toBeVisible();
    await expect(image.getByText("active")).toBeVisible();
  });

  test("shows an image's properties", async ({ page }) => {
    await page.goto("/compute/images/img-ubuntu");
    await expectPage(page, /NeCTAR Ubuntu 24.04/);
    await expect(main(page).getByText("default_user")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });
});

test.describe("overview", () => {
  test("shows quota and usage", async ({ page }) => {
    await page.goto("/compute/overview");
    await expectPage(page, "Overview");
    await expect(
      page.getByRole("meter", { name: "Instances" }),
    ).toHaveAttribute("aria-valuetext", "3 of 10");
    await expect(main(page).getByText("321.5", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("img", { name: /Daily service unit/ }),
    ).toBeVisible();
    await checkPage(page);
    await page.getByRole("button", { name: "View as table" }).click();
    await expect(
      page.getByRole("columnheader", { name: "Service units" }),
    ).toBeVisible();
    // The library Table is a React Aria grid: its cells are grid cells.
    // A long series is paged, so the first page starts at the first day.
    await expect(
      page.getByRole("row", { name: "12 July 2026" }).getByRole("gridcell"),
    ).toHaveText("3.5");
    await expectNoSeriousA11yIssues(page);
  });
});

test.describe("reservations", () => {
  test("lists reservations with limits", async ({ page }) => {
    await page.goto("/reservations");
    await expect(
      main(page).getByText("2 of 20", { exact: true }),
    ).toBeVisible();
    const reservations = table(page, "Reservations");
    await expect(
      reservations.getByRole("link", { name: "res-1" }),
    ).toBeVisible();
    await expect(reservations.getByText("Active")).toBeVisible();
    await checkPage(page);
  });

  test("creates a reservation from the availability chart", async ({
    page,
  }) => {
    await page.goto("/reservations/new");
    await expect(
      main(page).getByText("2 of 20", { exact: true }),
    ).toBeVisible();
    await expect(
      main(page).getByText(/1,234.5\/5,000 Service Units/),
    ).toBeVisible();
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
    await expect(main(page).getByText("L4 with 24GB of GPU RAM")).toBeVisible();
    await checkPage(page);

    // Clicking the middle of the bar starts there, for the eligible days.
    await page.getByRole("button", { name: /^Reserve ardc.g3.xlarge/ }).click();
    const reserve = dialog(page, "Reserve time slot");
    await expect(
      reserve.getByRole("heading", { name: "ardc.g3.xlarge" }),
    ).toBeVisible();
    await expect(reserve.getByText("7 days selected")).toBeVisible();
    await expect(reserve.getByText("9 / 20")).toBeVisible();
    await expect(reserve.getByText("Eligible", { exact: true })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await reserve.getByRole("button", { name: "Reserve", exact: true }).click();
    await expect(page).toHaveURL(/\/reservations\/res-2$/);
    await expect(main(page).getByText(/being created/)).toBeVisible();
    // Blazar allocates it; the page polls until it has (every 3 seconds).
    await page.clock.runFor("00:03");
    await expect(
      main(page).getByText("Allocated", { exact: true }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });

  test("shows a reservation as the UTC days reserved", async ({ page }) => {
    await page.goto("/reservations/res-1");
    // Reserved 13 to 15 Oct (UTC); in Melbourne it ends on the 16th.
    await expect(main(page)).toContainText("13 to 15 Oct 2026 (UTC days)");
    await page.goto("/reservations");
    await expect(row(table(page, "Reservations"), /res-1/)).toContainText(
      "13 to 15 Oct 2026",
    );
  });

  test("extends and deletes a reservation", async ({ page }) => {
    await page.goto("/reservations/res-1?extend=true");
    const extend = dialog(page, "Extend reservation");
    await expect(extend.getByText(/up to 5 days/)).toBeVisible();
    await expect(extend).toContainText("It now ends at the end of 15 Oct 2026");
    const submit = extend.getByRole("button", { name: "Extend", exact: true });
    // The day after the current end is chosen; the end itself cannot be.
    const day = extend.getByRole("spinbutton", { name: /^day/i });
    await expect(day).toHaveAttribute("aria-valuenow", "16");
    await day.press("ArrowDown");
    await expect(submit).toBeDisabled();
    await day.press("ArrowUp");
    await expect(submit).toBeEnabled();
    await submit.click();
    await expectToast(page, "Extended reservation res-1.");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await dialog(page, "Delete reservation res-1?")
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(page).toHaveURL(/\/reservations$/);
    await expectToast(page, "Deleted reservation res-1.");
  });
});

test.describe("list view in the URL", () => {
  test("keeps the page, page size and sort when coming back", async ({
    page,
  }) => {
    await page.goto("/compute/server-groups");
    const groups = table(page, "Server groups");
    // The mocked cloud answers once the list has loaded.
    await expect(groups.getByRole("link", { name: "web-tier" })).toBeVisible();
    // Thirteen groups in this page load's mocked cloud; a reload would
    // reset it, so the list refreshes in place.
    await page.evaluate(async () => {
      for (let n = 1; n <= 12; n += 1) {
        await fetch("/api/compute/server-groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `group-${String(n).padStart(2, "0")}`,
            policy: "affinity",
          }),
        });
      }
    });
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(groups.getByRole("link", { name: "group-12" })).toBeVisible();

    await page.getByRole("button", { name: /Rows per page/ }).click();
    await page.getByRole("option", { name: "10", exact: true }).click();
    await expect(page).toHaveURL(/size=10/);
    await page.getByRole("link", { name: "Next page" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(
      main(page).getByText("Showing 11 to 13 of 13", { exact: true }).first(),
    ).toBeVisible();

    await groups.getByRole("link", { name: "web-tier" }).click();
    await expectPage(page, "web-tier");
    await page.goBack();
    await expect(
      main(page).getByText("Showing 11 to 13 of 13", { exact: true }).first(),
    ).toBeVisible();
    await expect(groups.getByRole("link", { name: "web-tier" })).toBeVisible();

    // A new sort is in the URL too; the default sort leaves it plain.
    await groups.getByRole("columnheader", { name: "Name" }).click();
    await expect(page).toHaveURL(/sort=name&order=desc/);
    await groups.getByRole("columnheader", { name: "Name" }).click();
    await expect(page).not.toHaveURL(/sort=/);
  });

  test("a search with no results offers to clear it", async ({ page }) => {
    await page.goto("/compute/instances?q=zzz");
    const instances = table(page, "Instances");
    await expect(instances.getByText("No instances match")).toBeVisible();
    await instances.getByRole("button", { name: "Clear search" }).click();
    await expect(instances.getByRole("link", { name: "web-1" })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search" })).toBeFocused();
    await expect(page).not.toHaveURL(/q=/);
  });
});

test.describe("instance list details", () => {
  test("marks floating addresses and locked instances", async ({ page }) => {
    await page.goto("/compute/instances");
    const instances = table(page, "Instances");
    const db = row(instances, "db-1");
    await expect(db.getByText("203.0.113.100 floating IP")).toBeVisible();

    const web = row(instances, "web-1");
    await rowAction(web, "Lock instance");
    await expect(web.getByText("Locked")).toBeVisible();
    await web.getByRole("button", { name: "Actions" }).click();
    // Nova refuses these to a non-admin on a locked instance.
    for (const name of ["Shut off instance", "Delete instance"]) {
      const item = page.getByRole("menuitem", { name, exact: true });
      await expect(item).toBeDisabled();
      await expect(item).toHaveAccessibleDescription(
        "Unlock the instance first",
      );
    }
    await expect(
      page.getByRole("menuitem", { name: "Create snapshot", exact: true }),
    ).toBeEnabled();
    // The two "resume" actions read apart.
    await expect(
      page.getByRole("menuitem", { name: "Unpause instance", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Resume instance", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });
});

test.describe("instance menu", () => {
  test("attaches and detaches a volume from the menu", async ({ page }) => {
    await page.goto("/compute/instances/i-web-1");
    await page.getByRole("button", { name: "Actions" }).click();
    await page
      .getByRole("menuitem", { name: "Detach volume", exact: true })
      .click();
    const detach = dialog(page, "Detach a volume from web-1");
    // The only attached volume is chosen already.
    await expect(detach.getByRole("button", { name: /Volume$/ })).toContainText(
      "web-data on /dev/vdb",
    );
    await detach.getByRole("button", { name: "Detach volume" }).click();
    await expectToast(page, "Detaching volume web-data from web-1.");

    await page.getByRole("button", { name: "Actions" }).click();
    await page
      .getByRole("menuitem", { name: "Attach volume", exact: true })
      .click();
    await expect(dialog(page, "Attach volume to web-1")).toBeVisible();
  });

  test("dialogs open on their first field", async ({ page }) => {
    await page.goto("/compute/instances/i-web-1");
    const actions = page.getByRole("button", { name: "Actions" });
    await actions.click();
    await page
      .getByRole("menuitem", { name: "Edit instance", exact: true })
      .click();
    await expect(
      dialog(page, /Edit/).getByRole("textbox", { name: "Name" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(actions).toBeFocused();
  });

  test("shelving says what it does; rescue picks the image", async ({
    page,
  }) => {
    await page.goto("/compute/instances/i-web-1");
    await page.getByRole("button", { name: "Actions" }).click();
    await page
      .getByRole("menuitem", { name: "Shelve instance", exact: true })
      .click();
    await expect(
      dialog(page, "Shelve web-1?").getByText(/stops using service units/),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Actions" }).click();
    await page
      .getByRole("menuitem", { name: "Rescue instance", exact: true })
      .click();
    const rescue = dialog(page, "Rescue web-1");
    // The instance's own image is the starting choice.
    await expect(
      rescue.getByRole("button", { name: /Rescue image/ }),
    ).toContainText("NeCTAR Ubuntu 24.04");
    await rescue.getByRole("button", { name: "Rescue", exact: true }).click();
    await expectToast(page, "Rescuing web-1.");
    await expect(main(page).getByText("RESCUE").first()).toBeVisible();
  });

  test("allocates a new floating IP while associating", async ({ page }) => {
    await page.goto("/compute/instances/i-db-1");
    const actions = page.getByRole("button", { name: "Actions" });
    await actions.click();
    await page
      .getByRole("menuitem", { name: "Disassociate floating IP", exact: true })
      .click();
    await dialog(page, /Disassociate/)
      .getByRole("button", { name: "Disassociate", exact: true })
      .click();
    await expectToast(page, /203\.0\.113\.100/);

    await actions.click();
    await page
      .getByRole("menuitem", { name: "Associate floating IP", exact: true })
      .click();
    const associate = dialog(page, "Associate a floating IP with db-1");
    await associate.getByRole("button", { name: /Floating IP/ }).click();
    await page
      .getByRole("option", { name: "Allocate a new floating IP" })
      .click();
    await expect(associate.getByRole("button", { name: /Pool/ })).toBeVisible();
    await associate
      .getByRole("button", { name: "Associate", exact: true })
      .click();
    await expectToast(
      page,
      /^Floating IP 203\.0\.113\.\d+ associated with db-1/,
    );
  });

  test("edits a port from the interfaces tab", async ({ page }) => {
    await page.goto("/compute/instances/i-db-1?tab=interfaces");
    const interfaces = table(page, "Interfaces");
    await rowAction(row(interfaces, "private-net"), "Edit port");
    await expect(dialog(page, /^Edit port/)).toBeVisible();
  });

  test("lists the rules of each security group", async ({ page }) => {
    await page.goto("/compute/instances/i-web-1?tab=security");
    const rules = table(page, "Rules of web");
    await expect(rules.getByText("443")).toBeVisible();
    await expect(rules.getByText("Open to the internet").first()).toBeVisible();
  });

  test("names the server group on the overview", async ({ page }) => {
    await page.goto("/compute/instances/i-web-1");
    await main(page).getByRole("link", { name: "web-tier" }).click();
    await expectPage(page, "web-tier");
  });
});

test.describe("launch rules", () => {
  test("any zone is the default; Next focuses the first problem", async ({
    page,
  }) => {
    await page.goto("/compute/instances/launch");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      page.getByRole("textbox", { name: "Instance name" }),
    ).toBeFocused();
    await page.getByRole("textbox", { name: "Instance name" }).fill("anywhere");
    await expect(
      page
        .getByRole("complementary", { name: "Summary" })
        .getByText("Any availability zone"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      page.getByRole("radiogroup", { name: "Boot source" }),
    ).toBeVisible();
  });

  test("a count over the quota stops at the count", async ({ page }) => {
    await page.goto("/compute/instances/launch");
    await page.getByRole("textbox", { name: "Instance name" }).fill("many");
    const count = page.getByRole("textbox", { name: "Count" });
    await count.fill("8");
    // Leaving the field already says why.
    await count.press("Tab");
    await expect(
      main(page).getByText(/can launch 7 more instances \(3 of 10 in use\)/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(count).toBeFocused();
    await count.fill("7");
    await count.press("Tab");
    await page.getByRole("button", { name: "Next" }).click();
    await press(ubuntuImage(page));
    await page.getByRole("button", { name: "Next" }).click();

    // 7 x m3.medium needs 28 vCPUs; 24 are left.
    await press(flavourClass(page, "Balanced (m3)"));
    const flavours = page.getByRole("grid", { name: "Flavours" });
    await expect(
      flavours
        .getByRole("row", { name: /m3\.medium/ })
        .getByText("Does not fit your quota"),
    ).toBeVisible();
    await page
      .getByRole("searchbox", { name: "Search flavours" })
      .fill("medium");
    await expect(flavours.getByRole("row", { name: /m3\.small/ })).toHaveCount(
      0,
    );
    await flavours.getByRole("row", { name: /m3\.medium/ }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(main(page).getByText(/need 28 vCPUs/)).toBeVisible();

    // Several instances cannot share an existing port.
    await page.getByRole("searchbox", { name: "Search flavours" }).fill("");
    await flavours.getByRole("row", { name: /m3\.small/ }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      page.getByRole("checkbox", { name: /spare-port/ }),
    ).toBeDisabled();
  });

  test("boots an image from a new volume", async ({ page }) => {
    await startLaunch(page);
    await press(ubuntuImage(page));
    const create = page.getByRole("switch", { name: "Create a new volume" });
    await press(create);
    const size = page.getByRole("textbox", { name: "Volume size" });
    // The image's 10 GB minimum disk is the starting size and the floor.
    await expect(size).toHaveValue("10");
    await expect(
      main(page).getByText("At least 10 GB for this source."),
    ).toBeVisible();

    // The zone's volume types follow the default one.
    await page.getByRole("button", { name: /Volume type/ }).click();
    await expect(page.getByRole("option")).toHaveText([
      "Default volume type",
      "standard (Replicated network storage)",
      "qh2-ssd (Local SSD in melbourne-qh2)",
    ]);
    await page.getByRole("option", { name: /qh2-ssd/ }).click();
    await expect(
      main(page).getByText("Showing the types available in melbourne-qh2."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();

    // A flavour whose root disk is larger raises the size to it.
    await chooseFlavour(page, "Balanced (m3)", /m3.small/);
    const summary = page.getByRole("complementary", { name: "Summary" });
    await expect(summary.getByText("New 30 GB volume (qh2-ssd)")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(size).toHaveValue("30");
    await expect(
      main(page).getByText(
        "At least 30 GB: the source needs 10 GB and the m3.small flavour's root disk is 30 GB.",
      ),
    ).toBeVisible();
    await size.fill("40");
    await size.press("Tab");
    await press(
      page.getByRole("switch", {
        name: "Delete the volume when the instance is deleted",
      }),
    );
    await expect(
      summary.getByText(
        "New 40 GB volume (qh2-ssd), deleted with the instance",
      ),
    ).toBeVisible();
    for (let step = 0; step < 5; step += 1) {
      await page.getByRole("button", { name: "Next" }).click();
    }
    const sent = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().endsWith("/api/compute/instances"),
    );
    await page.getByRole("button", { name: "Launch", exact: true }).click();
    expect((await sent).postDataJSON()).toMatchObject({
      availability_zone: "melbourne-qh2",
      create_volume: true,
      volume_size_gb: 40,
      volume_type: "qh2-ssd",
      delete_volume_on_termination: true,
    });
    await expectToast(page, "Instance e2e-test is launching.");
  });

  test("a zone without the chosen volume type drops it", async ({ page }) => {
    await startLaunch(page);
    await press(ubuntuImage(page));
    await press(page.getByRole("switch", { name: "Create a new volume" }));
    await page.getByRole("button", { name: /Volume type/ }).click();
    await page.getByRole("option", { name: /qh2-ssd/ }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: /Availability zone/ }).click();
    await page.getByRole("option", { name: "monash-01" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      page.getByRole("button", { name: /Volume type/ }),
    ).toContainText("Default volume type");
  });

  test("a new volume needs a zone; an empty volume list names it", async ({
    page,
  }) => {
    await page.goto("/compute/instances/launch");
    await page.getByRole("textbox", { name: "Instance name" }).fill("vm");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      page.getByRole("switch", { name: "Create a new volume" }),
    ).toBeDisabled();
    await expect(
      main(page).getByText(/Choose an availability zone on the Details step/),
    ).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: /Availability zone/ }).click();
    await page.getByRole("option", { name: "monash-01" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await press(page.getByRole("radio", { name: "Volume", exact: true }));
    await expect(
      main(page).getByText(/^No bootable volumes in monash-01\./),
    ).toBeVisible();
  });

  test("a network error clears once a network is chosen", async ({ page }) => {
    await startLaunch(page);
    await press(ubuntuImage(page));
    await page.getByRole("button", { name: "Next" }).click();
    await chooseFlavour(page, "Balanced (m3)", /m3.small/);
    await page.getByRole("button", { name: "Next" }).click();
    const classic = page.getByRole("checkbox", { name: /classic/ });
    await press(classic);
    await page.getByRole("button", { name: "Next" }).click();
    const error = main(page).getByText("Choose at least one network or port");
    await expect(error).toBeVisible();
    await press(classic);
    await expect(error).toHaveCount(0);
  });

  test("loads user data from a file and offers a config drive", async ({
    page,
  }) => {
    await startLaunch(page);
    await press(ubuntuImage(page));
    await page.getByRole("button", { name: "Next" }).click();
    await chooseFlavour(page, "Balanced (m3)", /m3.small/);
    for (let step = 0; step < 4; step += 1) {
      await page.getByRole("button", { name: "Next" }).click();
    }
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Choose file" }).click();
    await (
      await chooser
    ).setFiles({
      name: "init.yaml",
      mimeType: "text/yaml",
      buffer: Buffer.from("#cloud-config\npackages: [htop]\n"),
    });
    await expect(
      page.getByRole("textbox", { name: /Customisation script/ }),
    ).toHaveValue("#cloud-config\npackages: [htop]\n");
    await expect(
      page.getByRole("switch", { name: "Configuration drive" }),
    ).toBeVisible();
  });

  test("says when no key pair is chosen", async ({ page }) => {
    await page.goto("/compute/instances/launch");
    await expect(
      page
        .getByRole("complementary", { name: "Summary" })
        .getByText(/cannot log in to the instance with SSH/),
    ).toBeVisible();
  });
});

test.describe("image actions", () => {
  test("creates a volume from an image", async ({ page }) => {
    await page.goto("/compute/images");
    await rowAction(
      row(table(page, "Images"), /my-webserver-image/),
      "Create volume",
    );
    await expect(page).toHaveURL(/\/storage\/volumes\?.*image=img-mine/);
    await expect(dialog(page, "Create volume")).toBeVisible();
  });

  test("edits an image's description and properties", async ({ page }) => {
    await page.goto("/compute/images/img-mine");
    await expect(
      main(page).getByText("6f2c1d9e8a7b4c3d2e1f0a9b8c7d6e5f"),
    ).toBeVisible();
    await expect(
      main(page).getByText("No", { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Actions" }).click();
    await page
      .getByRole("menuitem", { name: "Edit image", exact: true })
      .click();
    const edit = dialog(page, /Edit image/);
    await edit.getByRole("textbox", { name: "Description" }).fill("Nginx web");
    await edit.getByRole("button", { name: "Add property" }).click();
    await edit.getByRole("textbox", { name: "Key" }).fill("os_distro");
    await edit.getByRole("textbox", { name: "Value" }).fill("ubuntu");
    await edit.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "Image my-webserver-image updated.");
    await expect(main(page).getByText("Nginx web")).toBeVisible();
    await expect(main(page).getByText("os_distro")).toBeVisible();
  });

  test("marks the image name as required", async ({ page }) => {
    await page.goto("/compute/images");
    await page.getByRole("button", { name: "Create image" }).click();
    await expect(
      dialog(page, "Create image").getByRole("textbox", { name: "Image name" }),
    ).toHaveAttribute("aria-required", "true");
  });
});

test.describe("key pair dialogs", () => {
  test("refuses a duplicate name before sending it", async ({ page }) => {
    await page.goto("/compute/key-pairs");
    await page.getByRole("button", { name: "Create key pair" }).click();
    const create = dialog(page, "Create key pair");
    await create
      .getByRole("textbox", { name: "Key pair name" })
      .fill("ada-laptop");
    await create.getByRole("button", { name: "Create key pair" }).click();
    await expect(
      create.getByText("A key pair with this name already exists"),
    ).toBeVisible();
  });

  test("imports a public key from its file", async ({ page }) => {
    await page.goto("/compute/key-pairs");
    await page.getByRole("button", { name: "Import public key" }).click();
    const importing = dialog(page, "Import public key");
    await importing
      .getByRole("textbox", { name: "Key pair name" })
      .fill("laptop-2");
    const chooser = page.waitForEvent("filechooser");
    await importing.getByRole("button", { name: "Choose file" }).click();
    await (
      await chooser
    ).setFiles({
      name: "id_ed25519.pub",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMock me@laptop\n",
      ),
    });
    await expect(
      importing.getByRole("textbox", { name: "Public key" }),
    ).toHaveValue("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMock me@laptop");
    await importing.getByRole("button", { name: "Import key pair" }).click();
    await expectToast(page, "Key pair laptop-2 imported.");
  });

  test("drops the server's error once the name changes", async ({ page }) => {
    await failRequest(page, "POST", "/api/compute/keypairs", 409);
    await page.goto("/compute/key-pairs");
    await page.getByRole("button", { name: "Create key pair" }).click();
    const create = dialog(page, "Create key pair");
    const name = create.getByRole("textbox", { name: "Key pair name" });
    await name.fill("new-key");
    await create.getByRole("button", { name: "Create key pair" }).click();
    await expect(create.getByText(/Could not save/)).toBeVisible();
    await name.fill("new-key-2");
    await expect(create.getByText(/Could not save/)).toHaveCount(0);
  });
});

test.describe("server group page", () => {
  test("deletes the group from its page", async ({ page }) => {
    await page.goto("/compute/server-groups/sg-1");
    await page.getByRole("button", { name: "Actions" }).click();
    await page
      .getByRole("menuitem", { name: "Delete server group", exact: true })
      .click();
    await dialog(page, /Delete server group web-tier/)
      .getByRole("button", { name: "Delete" })
      .click();
    await expectPage(page, "Server groups");
  });
});

test.describe("limit summary", () => {
  test("shows volume and network quotas beside compute", async ({ page }) => {
    await page.goto("/compute/overview");
    await expect(
      page.getByRole("meter", { name: "Volume storage" }),
    ).toBeVisible();
    await expect(
      page.getByRole("meter", { name: "Floating IPs" }),
    ).toHaveAttribute("aria-valuetext", "2 of 5");
    await main(page).getByRole("link", { name: "Usage trend" }).click();
    await expect(page).toHaveURL(/\/usage\/trend/);
  });
});
