import { expect, test } from "./fixtures";

test.describe("Horizon redirects (SPA side)", () => {
  test("rewrites a Horizon settings path and keeps the query", async ({
    page,
  }) => {
    await page.goto("/settings/my-details/?orcid=linked");
    await expect(page).toHaveURL(/\/account\/my-details\?orcid=linked$/);
  });

  test("retires the application catalogue", async ({ page }) => {
    await page.goto("/app-catalog/");
    await expect(
      page.getByRole("heading", { name: "This feature has been retired" }),
    ).toBeVisible();
  });

  test("shows a not-found page for unknown paths", async ({ page }) => {
    await page.goto("/no/such/page");
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
  });
});
