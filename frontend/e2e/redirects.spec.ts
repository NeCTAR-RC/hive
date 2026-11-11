import { expect, test } from "./fixtures";
import { checkPage, expectPage, openNav } from "./helpers";

test.describe("Horizon redirects (SPA side)", () => {
  test("rewrites a Horizon settings path and keeps the query", async ({
    page,
  }) => {
    await page.goto("/settings/my-details/?orcid=linked");
    await expect(page).toHaveURL(/\/account\/my-details\?orcid=linked$/);
  });

  test("retires the application catalogue", async ({ page }) => {
    await page.goto("/app-catalog/");
    await expectPage(page, "This feature has been retired");
    await checkPage(page);
  });

  test("shows a not-found page for unknown paths, inside the shell", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/no/such/page");
    await expectPage(page, "Page not found");
    // The sidebar is still there to move on with.
    const nav = await openNav(page, isMobile);
    await expect(nav.getByRole("link", { name: "Home" })).toBeVisible();
    await checkPage(page);
  });

  test("opens the Hive page for a Horizon Angular detail address", async ({
    page,
  }) => {
    await page.goto("/ngdetails/OS::Octavia::LoadBalancer/lb-1?nav=x");
    await expect(page).toHaveURL(/\/load-balancers\/lb-1$/);
  });

  test("sends the allocation pages to Horizon", async ({ page }) => {
    const horizon = "https://dashboard.rctest.nectar.org.au";
    await page.route(`${horizon}/**`, (route) =>
      route.fulfill({ contentType: "text/html", body: "Horizon" }),
    );
    await page.goto("/allocation/user_requests/");
    await expect(page).toHaveURL(`${horizon}/allocation/user_requests/`);
  });
});
