import { expect, expectNoSeriousA11yIssues, test } from "./fixtures";
import {
  checkPage,
  closeButton,
  dialog,
  expectPage,
  expectSearchSurvivesBack,
  expectToast,
  main,
  row,
  rowAction,
  table,
} from "./helpers";

/** Long enough for a mocked Cinder change to finish and the next poll. */
const SETTLE = "00:06";

test.describe("volumes", () => {
  test("lists volumes with attachments and status", async ({ page }) => {
    await page.goto("/storage/volumes");
    await expectPage(page, "Volumes");
    const volumes = table(page, "Volumes");
    await expect(volumes.getByRole("link", { name: "web-data" })).toBeVisible();
    await expect(volumes.getByText("In use")).toBeVisible();
    await checkPage(page);
  });

  test("requires a zone and filters types by zone when creating", async ({
    page,
  }) => {
    await page.goto("/storage/volumes");
    await page.getByRole("button", { name: "Create volume" }).click();
    const create = dialog(page, "Create volume");
    await create.getByRole("textbox", { name: "Volume name" }).fill("fresh");
    await expectNoSeriousA11yIssues(page);
    await create.getByRole("button", { name: "Create volume" }).click();
    await expect(
      create.getByText("An availability zone is required"),
    ).toBeVisible();
    await expect(page).toHaveURL(/create=true/);

    await create.getByRole("button", { name: /Availability zone/ }).click();
    await page.getByRole("option", { name: "monash-02" }).click();
    await create.getByRole("button", { name: /Volume type/ }).click();
    await expect(
      page.getByRole("option", { name: /monash-ssd/ }),
    ).toBeVisible();
    await expect(page.getByRole("option", { name: /qh2-ssd/ })).toHaveCount(0);
    await page.getByRole("option", { name: /^standard/ }).click();
    await create.getByRole("button", { name: "Create volume" }).click();
    await expectToast(page, "Creating volume fresh.");
    await expect(
      table(page, "Volumes").getByRole("link", { name: "fresh" }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/create=true/);
  });

  test("creates a volume from a snapshot without zone or type", async ({
    page,
  }) => {
    await page.goto("/storage/volumes/create?snapshot_id=snap-1");
    const create = dialog(page, "Create volume");
    await expect(create).toBeVisible();
    await expect(page).toHaveURL(/snapshot=snap-1/);
    await expect(
      create.getByText(/inherits|source's volume type/),
    ).toBeVisible();
    await expect(
      create.getByRole("button", { name: /Availability zone/ }),
    ).toHaveCount(0);
    await expect(create.getByRole("textbox", { name: "Size" })).toHaveValue(
      "20",
    );
    await create.getByRole("button", { name: "Create volume" }).click();
    await expectToast(page, /Creating volume/);
  });

  test("shows a volume and manages attachments", async ({ page }) => {
    await page.goto("/storage/volumes/vol-1");
    await expectPage(page, "web-data");
    await expect(
      main(page).getByRole("link", { name: "/dev/vdb on web-1" }),
    ).toBeVisible();
    await expect(
      table(page, "Snapshots of this volume").getByRole("link", {
        name: "web-data-before-upgrade",
      }),
    ).toBeVisible();
    await checkPage(page);

    await page.getByRole("button", { name: "Manage attachments" }).click();
    const manage = dialog(page, /Manage attachments/);
    await expect(
      manage.getByText(
        "Unmount the file system inside the instance first, or data may be lost.",
      ),
    ).toBeVisible();
    await manage.getByRole("button", { name: "Detach" }).click();
    await manage.getByRole("button", { name: "Yes, detach" }).click();
    await expectToast(page, "Detaching volume web-data from web-1.");

    // The dialog stays, so the volume can go to another instance once free.
    await expect(manage.getByText(/The volume is detaching/)).toBeVisible();
    await page.clock.runFor(SETTLE);
    await expect(
      manage.getByText("Not attached to any instance."),
    ).toBeVisible();
    await manage.getByRole("button", { name: /Instance/ }).click();
    await page.getByRole("option", { name: /db-1/ }).click();
    await manage.getByRole("button", { name: "Attach volume" }).click();
    await expectToast(page, /Attaching volume web-data to db-1/);
    await expect(manage).toBeHidden();
  });

  test("shows the status in the header and why a volume failed", async ({
    page,
  }) => {
    await page.goto("/storage/volumes/vol-3");
    await expectPage(page, "scratch");
    await expect(main(page).getByText("Error", { exact: true })).toBeVisible();
    await expect(
      main(page).getByRole("alert").filter({ hasText: "Fault:" }),
    ).toContainText(
      "schedule allocate volume: Could not find any available weighted backend.",
    );
    await checkPage(page);

    await page.goto("/storage/snapshots/snap-1");
    await expectPage(page, "web-data-before-upgrade");
    await expect(
      main(page).getByText("Available", { exact: true }),
    ).toBeVisible();
    await page.goto("/storage/backups/bak-1");
    await expectPage(page, "web-data-nightly");
    await expect(
      main(page).getByText("Available", { exact: true }),
    ).toBeVisible();
  });

  test("changes a volume's type within its zone", async ({ page }) => {
    await page.goto("/storage/volumes");
    await rowAction(
      row(table(page, "Volumes"), "web-data"),
      "Change volume type",
    );
    const retype = dialog(page, "Change volume type of web-data");
    await expect(retype.getByText("Current type: standard.")).toBeVisible();
    await retype.getByRole("button", { name: /New volume type/ }).click();
    await expect(page.getByRole("option", { name: /monash-ssd/ })).toHaveCount(
      0,
    );
    await page.getByRole("option", { name: /qh2-ssd/ }).click();
    await retype.getByRole("button", { name: /Migration policy/ }).click();
    await page.getByRole("option", { name: "On demand" }).click();
    await expectNoSeriousA11yIssues(page);
    await retype.getByRole("button", { name: "Change volume type" }).click();
    await expectToast(page, "Changing the type of volume web-data to qh2-ssd.");
    const volume = row(table(page, "Volumes"), "web-data");
    await expect(volume.getByText("Retyping")).toBeVisible();
    await page.clock.runFor(SETTLE);
    await expect(volume.getByText("In use")).toBeVisible();
  });

  test("updates the metadata of a volume and a snapshot", async ({ page }) => {
    await page.goto("/storage/volumes/vol-2");
    await expectPage(page, "boot-ubuntu");
    await page.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Update metadata" }).click();
    const edit = dialog(page, "Update metadata of boot-ubuntu");
    await edit.getByRole("button", { name: "Add metadata" }).click();
    await edit.getByRole("textbox", { name: "Key" }).fill("purpose");
    await edit.getByRole("textbox", { name: "Value" }).fill("golden image");
    await edit.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "Metadata of boot-ubuntu updated.");
    await expect(main(page).getByText("golden image")).toBeVisible();

    await page.goto("/storage/snapshots/snap-1");
    await expectPage(page, "web-data-before-upgrade");
    await page.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Update metadata" }).click();
    const snapshot = dialog(page, "Update metadata of web-data-before-upgrade");
    await snapshot.getByRole("button", { name: "Add metadata" }).click();
    await snapshot.getByRole("textbox", { name: "Key" }).fill("keep");
    await snapshot.getByRole("textbox", { name: "Value" }).fill("yes");
    await snapshot.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "Metadata of web-data-before-upgrade updated.");
    await expect(main(page).getByText("keep", { exact: true })).toBeVisible();
  });

  test("transfers a volume and cancels the transfer", async ({ page }) => {
    await page.goto("/storage/volumes");
    const volume = row(table(page, "Volumes"), "boot-ubuntu");
    await rowAction(volume, "Create transfer");
    const create = dialog(page, "Create transfer of boot-ubuntu");
    await create.getByRole("button", { name: "Create transfer" }).click();
    await expect(create.getByText("Enter a transfer name")).toBeVisible();
    await create.getByRole("textbox", { name: "Transfer name" }).fill("to-lab");
    await create.getByRole("button", { name: "Create transfer" }).click();

    const created = dialog(page, "Transfer to-lab created");
    await expect(created.getByText("0a1b2c3d4e5f6789")).toBeVisible();
    await expect(created.getByText(/not shown again/)).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await closeButton(created).click();
    await expect(volume.getByText("Awaiting transfer")).toBeVisible();

    await rowAction(volume, "Cancel transfer");
    const cancel = dialog(page, "Cancel the transfer of volume boot-ubuntu?");
    await cancel.getByRole("button", { name: "Cancel transfer" }).click();
    await expectToast(page, "Cancelled the transfer of volume boot-ubuntu.");
    await expect(volume.getByText("Available")).toBeVisible();
  });

  test("accepts a volume transfer from another project", async ({ page }) => {
    await page.goto("/storage/volumes");
    await page.getByRole("button", { name: "Accept transfer" }).click();
    const accept = dialog(page, "Accept volume transfer");
    await accept
      .getByRole("textbox", { name: "Transfer ID" })
      .fill("transfer-from-lab");
    await accept
      .getByRole("textbox", { name: "Authorisation key" })
      .fill("wrong-key");
    await accept.getByRole("button", { name: "Accept transfer" }).click();
    await expect(accept.getByText(/invalid auth key/)).toBeVisible();

    await accept
      .getByRole("textbox", { name: "Authorisation key" })
      .fill(" 9f8e7d6c5b4a3210 ");
    await accept.getByRole("button", { name: "Accept transfer" }).click();
    await expectToast(page, /Accepted transfer dataset-handover/);
    await expect(
      table(page, "Volumes").getByRole("link", { name: "lab-dataset" }),
    ).toBeVisible();
  });

  test("launches from a volume in the volume's zone", async ({ page }) => {
    await page.goto("/storage/volumes");
    await rowAction(
      row(table(page, "Volumes"), "boot-ubuntu"),
      "Launch as instance",
    );
    await expectPage(page, "Launch instance");
    // The zone stays "Any": nova places the instance in the volume's zone.
    // The note says why no other zone would do.
    await expect(
      page.getByRole("button", { name: /Availability zone/ }),
    ).toContainText("Any availability zone");
    await expect(
      page.getByText(
        "The volume boot-ubuntu is in melbourne-qh2, and a volume can only boot an instance in its own zone.",
      ),
    ).toBeVisible();
    await expect(
      page
        .getByRole("complementary", { name: "Summary" })
        .getByText("boot-ubuntu"),
    ).toBeVisible();
  });

  test("opens the create dialog on an image from a link", async ({ page }) => {
    await page.goto("/storage/volumes?create=true&image=img-ubuntu");
    const create = dialog(page, "Create volume");
    await expect(create.getByRole("radio", { name: "Image" })).toBeChecked();
    await expect(
      create.getByRole("button", { name: /NeCTAR Ubuntu 24.04 LTS/ }),
    ).toBeVisible();
    await expect(create.getByRole("textbox", { name: "Size" })).toHaveValue(
      "5",
    );
  });

  test("attachments follow an instance renamed in Compute", async ({
    page,
  }) => {
    await page.goto("/storage/volumes/vol-1");
    await main(page).getByRole("link", { name: "/dev/vdb on web-1" }).click();
    await expectPage(page, "web-1");
    await page.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Edit instance" }).click();
    const edit = dialog(page, "Edit instance");
    await edit.getByRole("textbox", { name: "Name" }).fill("web-renamed");
    await edit.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "Instance web-renamed updated.");

    // Back in the volume, inside the app: one instance list, kept fresh.
    await page.goBack();
    await expect(
      main(page).getByRole("link", { name: "/dev/vdb on web-renamed" }),
    ).toBeVisible();
  });

  test("attaches a volume from the instance", async ({ page }) => {
    await page.goto("/compute/instances/i-db-1?tab=volumes");
    await page.getByRole("button", { name: "Attach volume" }).click();
    const attach = dialog(page, "Attach volume to db-1");
    await attach.getByRole("button", { name: /Volume/ }).click();
    await page.getByRole("option", { name: /boot-ubuntu/ }).click();
    await attach.getByRole("button", { name: "Attach volume" }).click();
    await expectToast(page, /Attaching volume boot-ubuntu to db-1/);
    await expectNoSeriousA11yIssues(page);
  });
});

test.describe("snapshots and backups", () => {
  test("lists snapshots and offers create volume", async ({ page }) => {
    await page.goto("/storage/snapshots");
    await expectPage(page, "Volume snapshots");
    await checkPage(page);
    await rowAction(
      row(table(page, "Volume snapshots"), "web-data-before-upgrade"),
      "Create volume",
    );
    // The dialog opens over the snapshots, so Cancel stays here.
    const create = dialog(page, "Create volume");
    await expect(
      create.getByRole("radio", { name: "Volume snapshot" }),
    ).toBeChecked();
    await create.getByRole("button", { name: "Cancel" }).click();
    await expect(create).toBeHidden();
    await expect(page).toHaveURL(/\/storage\/snapshots$/);
    await expectPage(page, "Volume snapshots");
  });

  test("restores a backup into a new volume", async ({ page }) => {
    await page.goto("/storage/backups");
    await expectPage(page, "Volume backups");
    await checkPage(page);
    await rowAction(
      row(table(page, "Volume backups"), "web-data-nightly"),
      "Restore backup",
    );
    const restore = dialog(page, /Restore backup/);
    await expect(restore.getByText("The backup holds 20 GB")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await restore.getByRole("button", { name: "Restore backup" }).click();
    await expectToast(
      page,
      /Restoring backup web-data-nightly into new volume/,
    );
  });
});

test("keeps the volumes search when coming back to the list", async ({
  page,
}) => {
  await expectSearchSurvivesBack(page, {
    path: "/storage/volumes",
    table: "Volumes",
    text: "web",
    link: "web-data",
  });
});
