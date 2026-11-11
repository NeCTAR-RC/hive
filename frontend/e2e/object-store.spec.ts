import type { Page } from "@playwright/test";
import { expect, expectNoSeriousA11yIssues, test } from "./fixtures";
import {
  checkPage,
  closeButton,
  dialog,
  expectSearchSurvivesBack,
  expectToast,
  main,
  row,
  rowAction,
  table,
} from "./helpers";

test.describe("containers", () => {
  test("lists containers and creates one", async ({ page }) => {
    await page.goto("/object-store/containers");
    const containers = table(page, "Containers");
    await expect(containers.getByRole("link", { name: "docs" })).toBeVisible();
    await page.getByRole("button", { name: "Create container" }).click();
    const create = dialog(page, "Create container");
    await create.getByRole("textbox", { name: "Container name" }).fill("fresh");
    await expectNoSeriousA11yIssues(page);
    await create.getByRole("button", { name: "Create container" }).click();
    await expectToast(page, "Container fresh created.");
    await expect(containers.getByRole("link", { name: "fresh" })).toBeVisible();
    await checkPage(page);
  });

  test("browses folders, uploads and deletes objects", async ({ page }) => {
    await page.goto("/object-store/containers/docs");
    const objects = table(page, "Objects");
    await expect(objects.getByRole("link", { name: "notes/" })).toBeVisible();
    await expect(main(page).getByText("Public access")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await objects.getByRole("link", { name: "notes/" }).click();
    await expect(page).toHaveURL(/\/object-store\/containers\/docs\/notes$/);
    await expect(row(objects, "todo.txt")).toBeVisible();

    await page.getByRole("button", { name: "Upload files" }).click();
    const upload = dialog(page, "Upload files");
    const chooser = page.waitForEvent("filechooser");
    await upload.getByRole("button", { name: "Choose files" }).click();
    await (
      await chooser
    ).setFiles({
      name: "hello.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello world"),
    });
    await upload.getByRole("button", { name: /^Upload 1 file/ }).click();
    await expectToast(page, "Uploaded hello.txt.");
    await closeButton(upload).click();
    const uploaded = row(objects, "hello.txt");
    await expect(uploaded).toBeVisible();

    await rowAction(uploaded, "Delete");
    await dialog(page, "Delete hello.txt?")
      .getByRole("button", { name: "Delete" })
      .click();
    await expectToast(page, "Deleted object hello.txt.");
    await expect(uploaded).toHaveCount(0);
    await checkPage(page);
  });

  test("loads a folder past its first page on request", async ({ page }) => {
    await page.goto("/object-store/containers/archive");
    const notice = main(page).getByText(/The first 500 entries are shown/);
    await expect(notice).toBeVisible();
    const search = page.getByRole("searchbox", { name: "Search" });
    await search.fill("log-0510");
    await expect(
      table(page, "Objects").getByText("Nothing matches"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Load more" }).click();
    await expect(notice).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(
      0,
    );
    await expect(row(table(page, "Objects"), "log-0510.txt")).toBeVisible();
    await checkPage(page);
  });

  test("says why a folder too large to delete here is refused", async ({
    page,
  }) => {
    await page.goto("/object-store/containers/archive");
    const objects = table(page, "Objects");
    await rowAction(row(objects, "aged/"), "Delete folder and contents");
    await dialog(page, "Delete aged and everything in it?")
      .getByRole("button", { name: "Delete" })
      .click();
    await expectToast(
      page,
      /holds too many objects to delete here; use the OpenStack command line tools instead/,
    );
    await expect(row(objects, "aged/")).toBeVisible();
  });
});

test.describe("object store safeguards", () => {
  /** The container page's value for a summary label, such as "Objects". */
  const summaryValue = (page: Page, label: string) =>
    main(page)
      .locator("dt", { hasText: new RegExp(`^${label}$`) })
      .locator("xpath=following-sibling::dd");

  test("copies an object under a free name beside it", async ({ page }) => {
    await page.goto("/object-store/containers/docs/notes");
    const objects = table(page, "Objects");
    await rowAction(row(objects, "todo.txt"), "Copy");
    const copy = dialog(page, "Copy todo.txt");
    const name = copy.getByRole("textbox", { name: "Destination object name" });
    await expect(name).toHaveValue("notes/todo (copy).txt");
    await name.fill("notes/todo.txt");
    await copy.getByRole("button", { name: "Copy" }).click();
    await expect(
      copy.getByText("notes/todo.txt already exists. Choose a free name."),
    ).toBeVisible();
    await name.fill("notes/todo (copy).txt");
    await copy.getByRole("button", { name: "Copy" }).click();
    await expectToast(page, "Copied to docs/notes/todo (copy).txt.");
    await expect(row(objects, "todo (copy).txt")).toBeVisible();
    await expect(row(objects, "todo.txt")).toBeVisible();
  });

  test("asks before making a container public", async ({ page }) => {
    await page.goto("/object-store/containers/docs");
    const access = main(page).getByRole("switch");
    await expect(access).toBeChecked();
    // The switch's own label takes the click, as a pointer would.
    await main(page).getByText("Enabled", { exact: true }).click();
    await expectToast(page, "docs is now private.");
    await expect(access).not.toBeChecked();
    await main(page).getByText("Disabled", { exact: true }).click();
    const confirm = dialog(page, "Make docs public?");
    await expect(
      confirm.getByText("Anyone with the link can read every object in docs."),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await confirm.getByRole("button", { name: "Make public" }).click();
    await expectToast(page, "docs is now public.");
    await expect(access).toBeChecked();
  });

  test("marks an upload that replaces an object and counts it after", async ({
    page,
  }) => {
    await page.goto("/object-store/containers/docs");
    await expect(summaryValue(page, "Objects")).toHaveText("3");
    await expect(
      main(page).getByRole("searchbox", { name: "Search" }),
    ).toHaveAttribute("placeholder", "Search this folder");
    await page.getByRole("button", { name: "Upload files" }).click();
    const upload = dialog(page, "Upload files");
    const chooser = page.waitForEvent("filechooser");
    await upload.getByRole("button", { name: "Choose files" }).click();
    await (
      await chooser
    ).setFiles([
      { name: "readme.txt", mimeType: "text/plain", buffer: Buffer.from("x") },
      { name: "new.txt", mimeType: "text/plain", buffer: Buffer.from("y") },
    ]);
    await expect(upload.getByText(/Replaces an existing object/)).toHaveCount(
      1,
    );
    await upload.getByRole("button", { name: /^Upload 2 files/ }).click();
    await expectToast(page, "Uploaded 2 files.");
    await closeButton(upload).click();
    await expect(summaryValue(page, "Objects")).toHaveText("4");
  });

  test("deletes a container with its objects", async ({ page }) => {
    await page.goto("/object-store/containers");
    const containers = table(page, "Containers");
    await rowAction(
      row(containers, "docs"),
      "Delete container and its 3 objects",
    );
    const confirm = dialog(page, "Delete docs and its 3 objects?");
    await expect(
      confirm.getByText(/Every object in the container is deleted with it/),
    ).toBeVisible();
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expectToast(page, "Deleted container docs.");
    await expect(containers.getByRole("link", { name: "docs" })).toHaveCount(0);
  });
});

test("keeps the containers search when coming back to the list", async ({
  page,
}) => {
  await expectSearchSurvivesBack(page, {
    path: "/object-store/containers",
    table: "Containers",
    text: "docs",
    link: "docs",
  });
});
