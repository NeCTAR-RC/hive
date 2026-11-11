import { expect, expectNoSeriousA11yIssues, test } from "./fixtures";
import { checkPage, closeButton, dialog, expectPage, main } from "./helpers";

test.describe("api access", () => {
  test("lists endpoints and shows credentials", async ({ page }) => {
    await page.goto("/api-access");
    await expectPage(page, "API access");
    await expect(
      main(page).getByText("https://nova.rctest.nectar.org.au/v2.1/"),
    ).toBeVisible();
    await page.getByRole("button", { name: "View credentials" }).click();
    const credentials = dialog(page, "User credentials");
    await expect(credentials.getByText("researcher@example.edu")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await closeButton(credentials).click();
    await expect(credentials).toHaveCount(0);
    await checkPage(page);
  });
});
