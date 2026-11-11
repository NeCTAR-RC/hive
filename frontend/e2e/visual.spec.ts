// Render captures: each page's own content (its `main`), one capture of the
// shell around it and one confirm dialog, on both projects. Each picture is
// attached to the test report so a reviewer can look at the page as the
// build renders it; nothing is compared, because the repository keeps no
// reference pictures (Hakkim, 2026-11-11). The look is verified by eye,
// here and on the change's review site. A failure means a page did not
// render far enough to be captured.
import type { Locator, Page, TestInfo } from "@playwright/test";
import { E2E_NOW, expect, test } from "./fixtures";
import { dialog, expectPage, main, row, rowAction, table } from "./helpers";

// The fixture starts the clock at E2E_NOW; freezing it there keeps relative
// dates ("7 days ago") from ticking over while a page is captured.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(E2E_NOW);
});

/**
 * Saves a picture of `target` into the test's output folder and attaches it
 * to the report under `name`, with animations disabled so the capture is
 * settled.
 */
async function capture(
  target: Page | Locator,
  name: string,
  testInfo: TestInfo,
  options: { mask?: Locator[] } = {},
) {
  const path = testInfo.outputPath(`${name}.png`);
  await target.screenshot({ path, animations: "disabled", ...options });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

/**
 * Scrolls through the page's column so lazily loaded images start, waits
 * until every image has finished, then returns to the top. An element
 * capture scrolls the column under lazy images, which otherwise race the
 * screenshot. The window never scrolls; the layout's content column does.
 */
async function settleImages(page: Page) {
  await page.evaluate(async () => {
    const column = document.querySelector(
      '[data-scroll-restoration-id="content"]',
    );
    if (!column) throw new Error("no content column");
    const step = column.clientHeight;
    for (let y = 0; y < column.scrollHeight; y += step) {
      column.scrollTo(0, y);
      await new Promise((done) => requestAnimationFrame(done));
    }
    await Promise.all(
      [...document.images].map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((done) => {
              img.addEventListener("load", done, { once: true });
              img.addEventListener("error", done, { once: true });
            }),
      ),
    );
    column.scrollTo(0, 0);
  });
}

/**
 * Grows the viewport by what the content column holds below its fold, so a
 * capture of `main` shows the whole page. The window never scrolls; an
 * element capture is clipped to the column's visible part otherwise.
 * Breakpoints are widths only, so the taller viewport lays out the same.
 */
async function showWholeColumn(page: Page) {
  const size = page.viewportSize();
  if (!size) throw new Error("no viewport");
  const hidden = await page.evaluate(() => {
    const column = document.querySelector(
      '[data-scroll-restoration-id="content"]',
    );
    return column ? column.scrollHeight - column.clientHeight : 0;
  });
  if (hidden > 0) {
    await page.setViewportSize({ ...size, height: size.height + hidden });
  }
}

/** Opens the instances list and waits until its rows have loaded. */
async function openInstances(page: Page) {
  await page.goto("/compute/instances");
  await expect(row(table(page, "Instances"), "web-1")).toBeVisible();
}

test.describe("visual", () => {
  test("login page", async ({ page }, testInfo) => {
    await page.goto("/auth/login?next=%2Fcompute%2Finstances");
    await expect(
      page.getByRole("link", { name: "Log In", exact: true }),
    ).toBeVisible();
    await settleImages(page);
    await showWholeColumn(page);
    await capture(main(page), "login", testInfo);
  });

  test("shell", async ({ page }, testInfo) => {
    await openInstances(page);
    await expect(page.getByRole("banner")).toBeVisible();
    await settleImages(page);
    // The page's own content is captured on its own; only the frame here.
    await capture(page, "shell", testInfo, { mask: [main(page)] });
  });

  test("home page", async ({ page }, testInfo) => {
    await page.goto("/");
    await expectPage(page, "Hello Ada!");
    await expect(main(page).getByText("321.5")).toBeVisible();
    await settleImages(page);
    await showWholeColumn(page);
    await capture(main(page), "home", testInfo);
  });

  test("instances list", async ({ page }, testInfo) => {
    await openInstances(page);
    await expectPage(page, "Instances");
    await settleImages(page);
    await showWholeColumn(page);
    await capture(main(page), "instances", testInfo);
  });

  test("instance detail", async ({ page }, testInfo) => {
    await page.goto("/compute/instances/i-web-1");
    await expectPage(page, "web-1");
    await expect(main(page).getByText("0.5 SU/hour")).toBeVisible();
    await settleImages(page);
    await showWholeColumn(page);
    await capture(main(page), "instance-detail", testInfo);
  });

  test("launch wizard, first step", async ({ page }, testInfo) => {
    await page.goto("/compute/instances/launch");
    await expectPage(page, "Launch instance");
    await expect(
      page.getByRole("textbox", { name: "Instance name" }),
    ).toBeVisible();
    await settleImages(page);
    await showWholeColumn(page);
    await capture(main(page), "launch-details", testInfo);
  });

  test("reservation create page", async ({ page }, testInfo) => {
    await page.goto("/reservations/new");
    await expect(
      main(page).getByText("2 of 20", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("group", { name: "ardc.h4.large" }),
    ).toBeVisible();
    await settleImages(page);
    await showWholeColumn(page);
    await capture(main(page), "reservation-create", testInfo);
  });

  test("confirm dialog", async ({ page }, testInfo) => {
    await openInstances(page);
    await rowAction(
      row(table(page, "Instances"), "web-1"),
      "Shut off instance",
    );
    const confirm = dialog(page, "Shut off web-1?");
    await expect(confirm).toBeVisible();
    await capture(confirm, "confirm-dialog", testInfo);
  });
});
