// Behaviour every page shares: tolerant URLs, the branded error page, and
// focus after a failed form submit.
import { expect, failBuiltFiles, setMockSession, test } from "./fixtures";
import { dialog, expectPage, main, row, table } from "./helpers";

test.describe("routing", () => {
  test("drops a malformed search param instead of failing", async ({
    page,
  }) => {
    await page.goto("/compute/images?snapshots=bogus");
    await expect(
      row(table(page, "Images"), /NeCTAR Ubuntu 24\.04/),
    ).toBeVisible();
  });

  test("shows the branded error when the dashboard cannot load", async ({
    page,
  }) => {
    await setMockSession(page, "me_down");
    await page.goto("/");
    // Upstream failures are retried twice (after 2 and 4 seconds) before
    // the error shows.
    await expect(
      page.getByRole("heading", { name: "Something went wrong", level: 1 }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("alert")).toContainText("identity is down");
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("shows the branded error when a page's code cannot load", async ({
    page,
  }) => {
    // A deploy replaces the hashed chunks, so a tab opened before it asks
    // for files that are gone. The router reloads the page once; when the
    // code is still missing, the error shows in place of the page, and
    // Try again loads it once it can.
    const restore = await failBuiltFiles(
      page,
      /\/assets\/pages-compute-[\w-]+\.js$/,
    );
    await page.goto("/compute/key-pairs");
    await expect(
      main(page).getByRole("heading", {
        name: "Something went wrong",
        level: 1,
      }),
    ).toBeVisible();

    await restore();
    await main(page).getByRole("button", { name: "Try again" }).click();
    await expectPage(page, "Key pairs");
  });
});

test.describe("forms", () => {
  test("moves focus to the first invalid field after a failed submit", async ({
    page,
  }) => {
    await page.goto("/databases/backups");
    await page.getByRole("button", { name: "Create backup" }).click();
    const create = dialog(page, "Create backup");
    await create.getByRole("button", { name: "Create backup" }).click();
    await expect(
      create.getByRole("textbox", { name: "Backup name" }),
    ).toBeFocused();
  });
});
