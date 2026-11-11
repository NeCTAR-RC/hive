// Every built page renders its heading and passes the accessibility and
// layout checks on both projects, including the detail pages no flow spec
// visits. The home page is covered by home.spec.ts, the not-found and
// retired pages by redirects.spec.ts.
import { expect, setMockSession, test } from "./fixtures";
import { checkPage, expectPage, openNav } from "./helpers";
import { APP_ROUTES, SIGNED_OUT_ROUTES } from "./routes";

test.describe("every page", () => {
  const routes = [...SIGNED_OUT_ROUTES, ...APP_ROUTES];
  for (const route of routes.filter((r) => !r.helpdesk)) {
    test(`${route.path} shows "${route.h1}"`, async ({ page }) => {
      await page.goto(route.path);
      await expectPage(page, route.h1);
      await checkPage(page);
    });
  }
});

test.describe("every helpdesk page", () => {
  test.beforeEach(async ({ page }) => {
    await setMockSession(page, "helpdesk");
  });

  for (const route of APP_ROUTES.filter((r) => r.helpdesk)) {
    test(`${route.path} shows "${route.h1}"`, async ({ page }) => {
      await page.goto(route.path);
      await expectPage(page, route.h1);
      await checkPage(page);
    });
  }
});

test.describe("project switch", () => {
  test("a Horizon project switch link switches and lands on home", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/auth/switch/p2");
    await expect(page).toHaveURL(/\/$/);
    await openNav(page, isMobile);
    await expect(page.getByRole("button", { name: "pt-1234" })).toBeVisible();
  });
});
