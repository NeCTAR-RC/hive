import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { checkPage, expectPage, main, row, table } from "./helpers";

test.describe("usage trend", () => {
  test("shows the total, presets and the breakdown", async ({ page }) => {
    await page.goto("/usage/trend");
    await expectPage(page, "Usage trend");
    await expect(main(page).getByText("321.5", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Service units by instance" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Past 30 days" }).click();
    await expect(page).toHaveURL(/begin=\d{4}-\d{2}-\d{2}/);
    await expect(
      row(table(page, "Project usage breakdown"), /db-1/),
    ).toBeVisible();
    await checkPage(page);
  });

  test("marks the preset the range is, and none for typed dates", async ({
    page,
  }) => {
    await page.goto("/usage/trend");
    const presets = page.getByRole("toolbar", { name: "Date range presets" });
    const month = presets.getByRole("button", { name: "Past 30 days" });
    const year = presets.getByRole("button", { name: "Past year" });
    // With no range in the address the page shows the past year.
    await expect(year).toHaveAttribute("aria-pressed", "true");
    await month.click();
    await expect(month).toHaveAttribute("aria-pressed", "true");
    await expect(year).toHaveAttribute("aria-pressed", "false");
    await page.goto("/usage/trend?begin=2026-09-01&end=2026-10-01");
    await expect(presets.locator("[aria-pressed=true]")).toHaveCount(0);
  });

  test("downloads the per-instance table as CSV", async ({ page }) => {
    await page.goto("/usage/trend?begin=2026-09-14&end=2026-10-14");
    await expect(
      row(table(page, "Project usage breakdown"), /db-1/),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(
      "usage-research-project-2026-09-14-to-2026-10-14.csv",
    );
    const csv = await readFile(await file.path(), "utf8");
    expect(csv.split("\r\n")[0]).toBe(
      "Instance,Instance ID,Started,Ended,Availability zone,Flavour,Instance hours,Service units",
    );
    expect(csv).toContain("db-1");
  });
});

test.describe("allocation usage", () => {
  test("shows the allocation burn-down", async ({ page }) => {
    await page.goto("/usage/allocation");
    await expectPage(page, "Allocation usage");
    await expect(main(page).getByText("SU remaining")).toBeVisible();
    await page.getByRole("button", { name: "View as table" }).click();
    await expect(
      page.getByRole("columnheader", { name: "Usage guide" }),
    ).toBeVisible();
    await checkPage(page);
  });

  test("labels each month of the burn-down once", async ({ page }) => {
    await page.goto("/usage/allocation");
    const ticks = page.locator(
      ".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value",
    );
    await expect(ticks.first()).toBeVisible();
    const labels = await ticks.allTextContents();
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(new Set(labels).size).toBe(labels.length);
    // The allocation runs to the end of 2026, past today.
    expect(labels).toContain("Dec 26");
  });
});
