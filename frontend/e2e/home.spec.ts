import {
  expect,
  expectNoHorizontalScroll,
  expectNoSeriousA11yIssues,
  test,
} from "./fixtures";
import { openNav } from "./helpers";

test.describe("home", () => {
  test("greets the user and shows the project box", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Hello Ada!" }),
    ).toBeVisible();
    await expect(page.getByRole("status").first()).toContainText(
      "Storage maintenance",
    );
    const usage = page.getByRole("region", {
      name: "Service units used in the past 3 months",
    });
    await expect(usage.getByText("321.5")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("shows the featured banner and the news as cards", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("region", {
      name: "Supercharge Your Research with High-Performance GPUs",
    });
    await expect(banner).toBeVisible();
    await expect(
      banner.getByRole("link", { name: "Reserve Now" }),
    ).toHaveAttribute("href", "/project/reservations/");
    await expect(
      banner.getByRole("link", { name: "Learn More (opens in a new tab)" }),
    ).toHaveAttribute("target", "_blank");
    await expect(
      banner.getByRole("link", {
        name: "GPU allocations (opens in a new tab)",
      }),
    ).toBeVisible();

    const news = page.locator("section", {
      has: page.getByRole("heading", { name: "ARDC news" }),
    });
    await expect(
      news.getByRole("heading", { name: /ARDC news item one/ }),
    ).toBeVisible();
    await expect(
      news.getByRole("link", {
        name: "ARDC news item one (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "https://ardc.edu.au/article/one/");

    await banner.getByRole("link", { name: "Reserve Now" }).click();
    await expect(page).toHaveURL(/\/reservations$/);
  });

  test("navigates to My details and back through the sidebar", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    const nav = await openNav(page, isMobile);
    await nav.getByRole("button", { name: "Account" }).click();
    await nav.getByRole("link", { name: "My details" }).click();
    await expect(page).toHaveURL(/\/account\/my-details$/);
    await expect(
      page.getByRole("heading", { name: "My details" }),
    ).toBeFocused();
    await expect(page.getByText("ada@example.edu")).toBeVisible();
    await expect(page).toHaveTitle(/My details/);
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("switches project from the sidebar", async ({ page, isMobile }) => {
    await page.goto("/");
    await openNav(page, isMobile);
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
