import type { Locator } from "@playwright/test";
import {
  expect,
  expectNoHorizontalScroll,
  expectNoSeriousA11yIssues,
  setMockSession,
  test,
} from "./fixtures";
import {
  checkPage,
  dialog,
  expectPage,
  expectToast,
  main,
  openNav,
} from "./helpers";

test.describe("ARDC components", () => {
  // The agency components never hydrate in e2e (see fixtures.ts); this
  // guards the static integration points so a regression in index.html or
  // the layouts is still caught.
  test("the mega menu, the footer and their loaders are present", async ({
    page,
  }) => {
    await page.goto("/");
    await expectPage(page, "Hello Ada!");
    const menu = page.locator("ardc-megamenu");
    await expect(menu).toHaveAttribute(
      "data-host",
      "ARDC Nectar Research Cloud",
    );
    // Full width puts the Explore ARDC tab at the window's right edge.
    await expect(menu).toHaveAttribute("data-content-width", "full");
    await expect(
      page.locator('script[src*="loaders/megamenu.min.js"]'),
    ).toBeAttached();
    // The fixture aborts the loader, so the menu gives up its strip.
    await expect(menu).toHaveAttribute("hidden");
    // The footer closes the scrolling content column.
    await expect(
      page.locator('[data-scroll-restoration-id="content"] > ardc-footer'),
    ).toBeAttached();
    await expect(
      page.locator('script[src*="loaders/footer.min.js"]'),
    ).toBeAttached();
  });
});

test.describe("Service header", () => {
  test("links home from the Nectar logo and the product name", async ({
    page,
  }) => {
    await page.goto("/");
    await expectPage(page, "Hello Ada!");
    const home = page
      .getByRole("banner")
      .getByRole("link", { name: /Nectar Dashboard/ });
    await expect(home).toHaveAttribute("href", "/");
    await expect(home.getByRole("img")).toHaveAttribute(
      "alt",
      "ARDC Nectar Research Cloud",
    );
    await expect(home.getByRole("img")).toHaveAttribute("src", "/logo.svg");
    await expect(home).toHaveText("Nectar Dashboard");
  });

  test("carries the support links, services and account menus", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "below 1024px the links live in the dialog");
    await page.goto("/");
    const header = page.getByRole("banner");
    const support = header.getByRole("navigation", { name: "Support" });
    await expect(
      support.getByRole("link", { name: "Support Centre" }),
    ).toBeVisible();
    await expect(
      support.getByRole("link", { name: "Tutorials" }),
    ).toBeVisible();
    await expect(
      support.getByRole("button", { name: "Request help" }),
    ).toBeVisible();

    await support.getByRole("button", { name: "Services" }).click();
    const services = page.getByRole("menu", { name: "Services" });
    await expect(services.getByRole("menuitem")).toHaveText([
      "Virtual Desktop Service",
      "Jupyter Notebook Service",
      "BinderHub Service",
    ]);
    await page.keyboard.press("Escape");

    await header
      .getByRole("button", { name: "researcher@example.edu" })
      .click();
    const account = page.getByRole("menu", { name: "researcher@example.edu" });
    await expect(account.getByRole("menuitem")).toHaveText([
      "My details",
      "OpenStack RC file",
      "Sign out",
    ]);
    await expectNoSeriousA11yIssues(page);
    await account.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/auth\/signed-out$/);
  });

  test("opens the navigation in a dialog on a phone", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "from 1024px the header shows the links");
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Dashboard navigation" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    const navigation = dialog(page, "Dashboard navigation");
    await expect(
      navigation.getByRole("navigation", { name: "Dashboard" }),
    ).toBeVisible();
    await expect(
      navigation
        .getByRole("navigation", { name: "Support" })
        .getByRole("link", { name: "Support Centre" }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await navigation.getByRole("button", { name: "Close" }).click();
    await expect(navigation).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });
});

test.describe("Public pages", () => {
  test("offer Log in in the header without a session", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "below 1024px Log in lives in the dialog");
    await setMockSession(page, "anon");
    await page.goto("/terms");
    await expectPage(page, "Terms of service");
    const header = page.getByRole("banner");
    await expect(
      header.getByRole("button", { name: "Services" }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await header.getByRole("link", { name: "Log in" }).click();
    await expectPage(page, "Welcome to the Dashboard.");
    await expect(page.getByRole("banner")).toHaveCount(0);
  });

  test("offer Log in in the navigation dialog on a phone", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "from 1024px Log in is in the header");
    await setMockSession(page, "anon");
    await page.goto("/auth/signed-out");
    await expectPage(page, "You have signed out");
    await page.getByRole("button", { name: "Dashboard navigation" }).click();
    const navigation = dialog(page, "Dashboard navigation");
    await expectNoSeriousA11yIssues(page);
    await navigation.getByRole("link", { name: "Log in" }).click();
    await expectPage(page, "Welcome to the Dashboard.");
    await expect(navigation).toHaveCount(0);
  });

  test("keep the account menu for a visitor with a session", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "below 1024px the account lives in the dialog");
    await page.goto("/terms");
    await expectPage(page, "Terms of service");
    const header = page.getByRole("banner");
    await expect(
      header.getByRole("button", { name: "researcher@example.edu" }),
    ).toBeVisible();
    await expect(header.getByRole("link", { name: "Log in" })).toHaveCount(0);
  });

  test("show Log in once signed out", async ({ page, isMobile }) => {
    test.skip(isMobile, "below 1024px the links live in the dialog");
    await page.goto("/");
    const header = page.getByRole("banner");
    await header
      .getByRole("button", { name: "researcher@example.edu" })
      .click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expectPage(page, "You have signed out");
    await expect(header.getByRole("link", { name: "Log in" })).toBeVisible();
    await checkPage(page);
  });
});

test.describe("Sidebar", () => {
  test("marks the current page and opens its section", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/compute/instances");
    const nav = await openNav(page, isMobile);
    await expect(nav.getByRole("button", { name: "Project" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const current = nav.locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute("href", "/compute/instances");
    await expect(nav.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  test("opens one section at a time and remembers it", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    let nav = await openNav(page, isMobile);
    const project = nav.getByRole("button", { name: "Project" });
    const identity = nav.getByRole("button", { name: "Identity" });
    await expect(project).toHaveAttribute("aria-expanded", "true");
    await expect(identity).toHaveAttribute("aria-expanded", "false");
    await identity.click();
    await expect(identity).toHaveAttribute("aria-expanded", "true");
    await expect(project).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    nav = await openNav(page, isMobile);
    await expect(nav.getByRole("button", { name: "Identity" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});

/** The first opaque background at or above the element, as a CSS colour. */
async function paintedBackground(element: Locator) {
  return element.evaluate((node) => {
    for (let at: Element | null = node; at; at = at.parentElement) {
      const colour = getComputedStyle(at).backgroundColor;
      if (colour !== "rgba(0, 0, 0, 0)") return colour;
    }
    return "none";
  });
}

test.describe("Frame", () => {
  // Grey-50 and white, as the browser reports the library tokens.
  const CANVAS = "rgb(243, 243, 243)";
  const WHITE = "rgb(255, 255, 255)";

  test("the page is a white panel on the grey canvas", async ({ page }) => {
    await page.goto("/compute/instances");
    await expectPage(page, "Instances");
    expect(await paintedBackground(main(page))).toBe(WHITE);
    expect(
      await main(page).evaluate((m) => getComputedStyle(m).borderTopWidth),
    ).not.toBe("0px");
    const column = page.locator('[data-scroll-restoration-id="content"]');
    expect(await paintedBackground(column)).toBe(CANVAS);
    await expectNoHorizontalScroll(page);
  });

  test("the docked sidebar is a white panel on the canvas", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "the sidebar docks from 768px");
    await page.goto("/compute/instances");
    await expectPage(page, "Instances");
    const sidebar = page.getByRole("complementary", {
      name: "Dashboard navigation",
    });
    expect(await paintedBackground(sidebar)).toBe(CANVAS);
    expect(await paintedBackground(sidebar.locator("> div"))).toBe(WHITE);
  });

  test("a page outside the dashboard stays on white", async ({ page }) => {
    await page.goto("/terms");
    await expectPage(page, "Terms of service");
    expect(await paintedBackground(main(page))).toBe(WHITE);
  });

  // The window never scrolls, as in Horizon: the content column and the
  // sidebar scroll on their own, and the router restores the column.
  test("a new page starts at the top of the column; Back restores it", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    await expectPage(page, "Hello Ada!");
    const column = page.locator('[data-scroll-restoration-id="content"]');
    const scrollTop = () => column.evaluate((element) => element.scrollTop);
    await column.evaluate((element) => element.scrollTo(0, 300));
    await expect.poll(scrollTop).toBe(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    const nav = await openNav(page, isMobile);
    // Two rows read "Instances" (Compute and Database); take Compute's.
    await nav.locator('a[href="/compute/instances"]').click();
    await expectPage(page, "Instances");
    await expect.poll(scrollTop).toBe(0);

    await page.goBack();
    await expectPage(page, "Hello Ada!");
    await expect.poll(scrollTop).toBe(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});

test("the skip link moves focus to the main content", async ({ page }) => {
  await page.goto("/compute/instances");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await skip.focus();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test.describe("Session", () => {
  // The mocked session ends six hours after the app loads.
  test("warns before the session ends, with a way to sign in again", async ({
    page,
  }) => {
    await page.goto("/compute/instances");
    await expectPage(page, "Instances");
    const warning = page
      .getByRole("status")
      .filter({ hasText: "Your login session ends" });
    await expect(warning).toHaveCount(0);

    await page.clock.fastForward("05:52:00");
    await expect(warning).toContainText("ends in about 8 minutes");
    // Back to this page after the login (encoded twice: a URL in a URL).
    await expect(
      warning.getByRole("link", { name: "sign in again" }),
    ).toHaveAttribute("href", /next%3D%252Fcompute%252Finstances/);
  });
});

test.describe("Page header", () => {
  test("breadcrumbs that lead nowhere are not tab stops", async ({ page }) => {
    await page.goto("/dns/zones");
    await expectPage(page, "Zones");
    const crumbs = main(page).locator("ol").first();
    for (const name of ["Project", "DNS"]) {
      const crumb = crumbs.getByText(name, { exact: true });
      await expect(crumb).toHaveAttribute("aria-disabled", "true");
      await expect(crumb).not.toHaveAttribute("tabindex");
    }
    // From the skip link, the first Tab lands past the dead crumbs.
    await page.getByRole("link", { name: "Skip to main content" }).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).not.toHaveText(/^(Project|DNS)$/);
  });

  test("names a record's kind in the tab title", async ({ page }) => {
    await page.goto("/load-balancers/lb-1");
    await expectPage(page, "web");
    await expect(page).toHaveTitle(
      "web \u00B7 Load balancer | Nectar Dashboard",
    );
  });
});

test.describe("Project switcher", () => {
  test("keeps focus on the picker and says which project is current", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/compute/instances");
    await expectPage(page, "Instances");
    await openNav(page, isMobile);
    const picker = page.getByRole("button", { name: /research-project/ });
    await picker.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("option", { name: "pt-1234" }).press("Enter");
    await expectToast(page, "Switched to pt-1234.");
    await expect(page.getByRole("button", { name: /pt-1234/ })).toBeFocused();
    await expect(page).toHaveURL(/\/compute\/instances$/);
  });

  test("leaves a record page for its list", async ({ page, isMobile }) => {
    await page.goto("/compute/instances/i-web-1");
    await expectPage(page, "web-1");
    await openNav(page, isMobile);
    await page.getByRole("button", { name: /research-project/ }).click();
    await page.getByRole("option", { name: "pt-1234" }).click();
    await expectToast(page, "Switched to pt-1234.");
    await expect(page).toHaveURL(/\/compute\/instances$/);
    await expectPage(page, "Instances");
  });
});
