import { clearFailure, expect, failRequest, test } from "./fixtures";
import { dialog, main } from "./helpers";

test.describe("reservations", () => {
  test("keeps a fully booked flavour on the chart and says so", async ({
    page,
  }) => {
    await page.goto("/reservations/new?category=H4");
    const booked = page.getByRole("group", { name: "ardc.h4.huge" });
    await expect(booked).toBeVisible();
    await expect(booked).toContainText("No free time slots up to 31 Jan 2027.");
    await expect(
      page.getByRole("button", { name: /^Reserve ardc.h4.huge/ }),
    ).toHaveCount(0);
    // The flavour that has slots keeps them, and nothing says the search was cut.
    await expect(
      page.getByRole("button", { name: /^Reserve ardc.h4.large/ }),
    ).toBeVisible();
    await expect(
      main(page).getByText(/Free time slots are shown up to/),
    ).toHaveCount(0);
  });

  test("names the window when the new end is outside it", async ({ page }) => {
    await page.goto("/reservations/res-1?extend=true");
    const extend = dialog(page, "Extend reservation");
    const submit = extend.getByRole("button", { name: "Extend", exact: true });
    const day = extend.getByRole("spinbutton", { name: /^day/i });
    await expect(day).toHaveAttribute("aria-valuenow", "16");
    await expect(submit).toBeEnabled();
    // The window ends on the 20th: the 21st is named as out of it, at once.
    for (let step = 0; step < 5; step += 1) await day.press("ArrowUp");
    await expect(day).toHaveAttribute("aria-valuenow", "21");
    await expect(
      extend.getByText("Choose a date from 16 Oct 2026 to 20 Oct 2026"),
    ).toBeVisible();
    await expect(submit).toBeDisabled();
    await day.press("ArrowDown");
    await expect(extend.getByText(/Choose a date from/)).toHaveCount(0);
    await expect(submit).toBeEnabled();
  });

  test("reloads the window when the extension is refused", async ({ page }) => {
    const windows: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/reservations/res-1/extend-options")) {
        windows.push(request.method());
      }
    });
    await failRequest(page, "POST", "/api/reservations/res-1/extend", 409);
    await page.goto("/reservations/res-1?extend=true");
    const extend = dialog(page, "Extend reservation");
    await expect(extend.getByText(/up to 5 days/)).toBeVisible();
    expect(windows).toHaveLength(1);
    await extend.getByRole("button", { name: "Extend", exact: true }).click();
    // The refusal is shown, and the settle asks for the free window again.
    await expect(
      extend.getByText("the mock API refused this request"),
    ).toBeVisible();
    await expect.poll(() => windows.length).toBe(2);
  });

  test("says so, with a retry, when the free window does not load", async ({
    page,
  }) => {
    await failRequest(
      page,
      "GET",
      "/api/reservations/res-1/extend-options",
      500,
    );
    await page.goto("/reservations/res-1?extend=true");
    const extend = dialog(page, "Extend reservation");
    await expect(
      extend.getByText("Could not check for free time after the reservation"),
    ).toBeVisible();
    await expect(extend.getByText(/not available after/)).toHaveCount(0);
    const submit = extend.getByRole("button", { name: "Extend", exact: true });
    await expect(submit).toBeDisabled();
    await clearFailure(page);
    await extend.getByRole("button", { name: "Try again" }).click();
    await expect(extend.getByText(/up to 5 days/)).toBeVisible();
    await expect(submit).toBeEnabled();
  });

  test("adds a reservation to a calendar through links", async ({ page }) => {
    await page.goto("/reservations/res-1");
    await main(page).getByRole("button", { name: "Add to calendar" }).click();
    const ics = page.getByRole("menuitem", { name: "Download .ics file" });
    await expect(ics).toHaveAttribute(
      "href",
      "/api/reservations/res-1/calendar.ics",
    );
    await expect(ics).toHaveAttribute(
      "download",
      "nectar-reservation-res-1.ics",
    );
    const google = page.getByRole("menuitem", { name: /^Google Calendar/ });
    await expect(google).toContainText("(opens in a new tab)");
    await expect(google).toHaveAttribute("target", "_blank");
    await expect(google).toHaveAttribute("rel", /noopener/);
  });

  test("launches an instance on the reservation's flavour in the app", async ({
    page,
  }) => {
    await page.goto("/reservations/res-1");
    await main(page).getByRole("link", { name: "Launch instance" }).click();
    await expect(page).toHaveURL(/\/compute\/instances\/launch\?flavor=/);
  });
});
