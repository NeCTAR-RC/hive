import {
  expect,
  expectNoHorizontalScroll,
  expectNoSeriousA11yIssues,
  test,
} from "./fixtures";

test.describe("login page", () => {
  test("offers a single login that returns to Hive", async ({ page }) => {
    await page.goto("/auth/login?next=%2Faccount%2Fmy-details");
    await expect(
      page.getByRole("heading", { name: "Welcome to the Dashboard." }),
    ).toBeVisible();
    const login = page.getByRole("link", { name: "Log in", exact: true });
    const href = await login.getAttribute("href");
    expect(href).toContain("accounts.test.rc.nectar.org.au/login?return-path=");
    const returnPath = new URL(href!).searchParams.get("return-path")!;
    expect(returnPath).toContain("/auth/websso/?next=%2Faccount%2Fmy-details");
    await expect(page.getByRole("link", { name: /Tuakiri|AAF/ })).toHaveCount(
      0,
    );
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("explains a failed login", async ({ page }) => {
    await page.goto("/auth/login?reason=no_projects");
    await expect(page.getByRole("status")).toContainText("no active projects");
  });

  test("sends anonymous visitors to the login page with next", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "hive_mock", value: "anon", url: "http://localhost:4173" },
    ]);
    await page.goto("/account/my-details");
    await expect(page).toHaveURL(/\/auth\/login\?next=/);
  });
});
