import { expect, test } from "./fixtures";
import { checkPage, main } from "./helpers";

test.describe("security risks", () => {
  test("lists security risks grouped by resource", async ({ page }) => {
    await page.goto("/security/risks");
    await expect(
      main(page).getByText(/currently has 1 security risk/),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Instance db-1", level: 3 }),
    ).toBeVisible();
    await expect(main(page).getByText("i-db-1")).toBeVisible();
    await expect(main(page).getByText("accessible-db")).toBeVisible();
    await checkPage(page);
  });

  test("points an exposed port to the instance's security groups", async ({
    page,
  }) => {
    await page.goto("/security/risks");
    await main(page)
      .getByRole("link", { name: "Check the security groups of db-1" })
      .click();
    await expect(page).toHaveURL(/\/compute\/instances\/i-db-1\?tab=security$/);
  });
});
