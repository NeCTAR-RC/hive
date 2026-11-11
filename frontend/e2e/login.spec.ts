import { expect, setMockSession, test } from "./fixtures";
import { checkPage, expectPage } from "./helpers";

test.describe("login page", () => {
  test("offers a single login that returns to Hive", async ({ page }) => {
    await page.goto("/auth/login?next=%2Faccount%2Fmy-details");
    await expectPage(page, "Welcome to the Dashboard.");
    const login = page.getByRole("link", { name: "Log In", exact: true });
    const href = await login.getAttribute("href");
    expect(href).toContain("accounts.test.rc.nectar.org.au/login?return-path=");
    const returnPath = new URL(href!).searchParams.get("return-path")!;
    expect(returnPath).toContain("/auth/websso/?next=%2Faccount%2Fmy-details");
    await expect(page.getByRole("link", { name: /Tuakiri|AAF/ })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("link", { name: /Having trouble logging in\?/ }),
    ).toHaveAttribute(
      "href",
      "https://support.ehelp.edu.au/support/solutions/articles/6000055377",
    );
    // The page stands alone under the mega menu: no header, no footer.
    await expect(page.locator("ardc-megamenu")).toHaveCount(1);
    await expect(page.getByRole("banner")).toHaveCount(0);
    await expect(page.locator("ardc-footer")).toBeHidden();
    await checkPage(page);
  });

  test("names the page to return to", async ({ page }) => {
    await page.goto("/auth/login?next=%2Fdns%2Fzones%3Fcreate%3Dtrue");
    await expect(
      page.getByRole("status").filter({ hasText: "continue" }),
    ).toHaveText("Log in to continue to /dns/zones?create=true.");
  });

  test("shows the still artwork under reduced motion", async ({ page }) => {
    // The suite runs with reduced motion; the honeycomb then loads as the
    // SVG's still picture, and as the animated one otherwise.
    await page.goto("/auth/login");
    const artwork = page.locator('img[src^="/login-bg.svg"]');
    await expect(artwork).toHaveAttribute("src", "/login-bg.svg#still");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(artwork).toHaveAttribute("src", "/login-bg.svg");
  });

  test("explains a failed login", async ({ page }) => {
    await page.goto("/auth/login?reason=no_projects");
    await expect(page.getByRole("status")).toContainText("no active projects");
  });

  test("sends anonymous visitors to the login page with next", async ({
    page,
  }) => {
    await setMockSession(page, "anon");
    await page.goto("/account/my-details");
    await expect(page).toHaveURL(
      /\/auth\/login\?next=%2Faccount%2Fmy-details$/,
    );
  });
});
