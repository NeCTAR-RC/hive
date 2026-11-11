// The specs' shared vocabulary: how a Hive page, table, menu, toast and
// section are found, so each spec reads as the user's steps. Text lookups
// are scoped to `main`, so the header, the sidebar and the toasts can never
// match page content.
import type { Locator, Page } from "@playwright/test";
import {
  expect,
  expectNoHorizontalScroll,
  expectNoSeriousA11yIssues,
} from "./fixtures";

/** The page's own content, without the header, sidebar or toasts. */
export function main(page: Page): Locator {
  return page.getByRole("main");
}

/**
 * Waits for the page whose level-1 heading is `title` (exactly, for a
 * string). Detail pages show a placeholder heading while loading, so this
 * waits for the real name.
 */
export async function expectPage(page: Page, title: string | RegExp) {
  await expect(
    page.getByRole("heading", { name: title, exact: true, level: 1 }),
  ).toBeVisible();
}

/** The accessibility and layout checks every page must pass. */
export async function checkPage(page: Page) {
  await expectNoSeriousA11yIssues(page);
  await expectNoHorizontalScroll(page);
}

/** A data table (a React Aria grid) by its exact accessible name. */
export function table(page: Page, name: string): Locator {
  return page.getByRole("grid", { name, exact: true });
}

/**
 * A row of `grid`: the one whose row header (the cell naming the row, and
 * the row's accessible name) is exactly `name`, or, for rows a header
 * cannot single out, the one whose text in any cell matches a pattern.
 */
export function row(grid: Locator, name: string | RegExp): Locator {
  const rows = grid.getByRole("row");
  if (name instanceof RegExp) return rows.filter({ hasText: name });
  return rows.filter({
    has: grid.page().getByRole("rowheader", { name, exact: true }),
  });
}

/** Opens a row's "Actions" menu and picks `item`. */
export async function rowAction(row: Locator, item: string) {
  await row.getByRole("button", { name: "Actions" }).click();
  await row.page().getByRole("menuitem", { name: item, exact: true }).click();
}

/** The toolbar's "With selected" button, whatever the count. */
export function withSelected(page: Page): Locator {
  return main(page).getByRole("button", { name: /^With selected, \d+$/ });
}

/** Opens the toolbar's "With selected" menu and picks `item`. */
export async function batchAction(page: Page, item: string) {
  await withSelected(page).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

/**
 * Ticks a table row's checkbox. The click goes to the native input itself:
 * on a phone a toast can sit over the row, where a pointer click would land
 * on something else.
 */
export async function tick(checkbox: Locator) {
  await checkbox.dispatchEvent("click");
  await expect(checkbox).toBeChecked();
}

/** A dialog by its accessible name (its title). */
export function dialog(page: Page, name: string | RegExp): Locator {
  return page.getByRole("dialog", { name });
}

/**
 * A dialog's own "Close" button. The corner X shares the accessible name
 * but shows no text, so the visible label tells them apart.
 */
export function closeButton(dialog: Locator): Locator {
  return dialog
    .getByRole("button", { name: "Close", exact: true })
    .filter({ hasText: "Close" });
}

/**
 * Opens a detail page's section: a tab from 768px, an accordion button on
 * a phone.
 */
export async function openSection(page: Page, name: string) {
  const content = main(page);
  await content
    .getByRole("tab", { name, exact: true })
    .or(content.getByRole("button", { name, exact: true }))
    .click();
}

/** A detail page's open section: the tab panel, or the accordion group. */
export function section(page: Page, name: string): Locator {
  const content = main(page);
  return content
    .getByRole("tabpanel", { name })
    .or(content.getByRole("group", { name }));
}

/**
 * Searches the list at `path` for `text`, opens the row link `link` and
 * goes back: the search box still holds the text and the row is still
 * listed, because every list keeps its search in the URL.
 */
export async function expectSearchSurvivesBack(
  page: Page,
  list: { path: string; table: string; text: string; link: string },
) {
  await page.goto(list.path);
  const grid = table(page, list.table);
  const search = page.getByRole("searchbox", { name: "Search" });
  await search.fill(list.text);
  await expect(page).toHaveURL(/[?&]q=/);
  await grid.getByRole("link", { name: list.link, exact: true }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await page.goBack();
  await expect(search).toHaveValue(list.text);
  await expect(page).toHaveURL(/[?&]q=/);
  await expect(
    grid.getByRole("link", { name: list.link, exact: true }),
  ).toBeVisible();
}

/** Expects a notification whose text matches `text`. */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(
    page.getByRole("region", { name: /notifications/i }).getByText(text),
  ).toBeVisible();
}

/**
 * The sidebar navigation, opening its dialog first on a phone (below
 * 1024px the header's button holds it).
 */
export async function openNav(page: Page, isMobile: boolean): Promise<Locator> {
  if (isMobile) {
    await page.getByRole("button", { name: "Dashboard navigation" }).click();
  }
  return page.getByRole("navigation", { name: "Dashboard" });
}
