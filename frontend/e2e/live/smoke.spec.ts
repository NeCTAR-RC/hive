// The first look at a deployed Hive: the home page and My details render
// and pass the checks, and the backend serves the Horizon redirect map.
import { expect, test } from "../fixtures";
import { checkPage, expectPage } from "../helpers";

test.describe("live smoke", () => {
  test("home and My details render and pass the checks", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await checkPage(page);
    await test.info().attach("home", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    await page.goto("/account/my-details");
    await expectPage(page, "My details");
    await checkPage(page);
    await test.info().attach("my-details", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test("the backend redirects a Horizon path", async ({ page }) => {
    const response = await page.request.get("/settings/my-details/?x=1", {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(301);
    expect(response.headers()["location"]).toMatch(
      /\/account\/my-details\?x=1$/,
    );
  });
});
