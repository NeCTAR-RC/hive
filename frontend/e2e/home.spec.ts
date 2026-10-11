import {
  expect,
  expectNoHorizontalScroll,
  expectNoSeriousA11yIssues,
  test,
} from "./fixtures";

test.describe("home", () => {
  test("greets the user and shows the project box", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Hello Ada!" }),
    ).toBeVisible();
    await expect(page.getByRole("status").first()).toContainText(
      "Storage maintenance",
    );
    await expect(page.getByText("You have used")).toBeVisible();
    await expect(page.getByText("321.5")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("navigates to My Details and back through the sidebar", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    if (isMobile) {
      await page.getByRole("button", { name: "Dashboard navigation" }).click();
    }
    const nav = page.getByRole("navigation", { name: "Dashboard" });
    await nav.getByRole("button", { name: "Account" }).click();
    await nav.getByRole("link", { name: "My Details" }).click();
    await expect(page).toHaveURL(/\/account\/my-details$/);
    await expect(
      page.getByRole("heading", { name: "My Details" }),
    ).toBeFocused();
    await expect(page.getByText("ada@example.edu")).toBeVisible();
    await expect(page).toHaveTitle(/My Details/);
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("switches project from the sidebar", async ({ page, isMobile }) => {
    await page.goto("/");
    if (isMobile) {
      await page.getByRole("button", { name: "Dashboard navigation" }).click();
    }
    await page.getByRole("button", { name: "research-project" }).click();
    await page.getByRole("option", { name: "pt-1234" }).click();
    await expect(page.getByRole("button", { name: "pt-1234" })).toBeVisible();
    await expect(
      page.getByText("Learn more about project trials"),
    ).toBeVisible();
  });

  test("dismisses the welcome panel and remembers it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome to the Dashboard!" }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Welcome to the Dashboard!" }),
    ).toHaveCount(0);
  });
});
