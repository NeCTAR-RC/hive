// Every page against real data: each page without a seeded id shows its
// heading and passes the accessibility and layout checks, and so does the
// detail page of the first record in each list that has one.
import { expect, test } from "../fixtures";
import { checkPage, expectPage, table } from "../helpers";
import { APP_ROUTES } from "../routes";

/** Lists whose first record's detail page is checked too. */
const LISTS = [
  { path: "/compute/instances", grid: "Instances" },
  { path: "/compute/images", grid: "Images" },
  { path: "/storage/volumes", grid: "Volumes" },
  { path: "/network/networks", grid: "Networks" },
  { path: "/network/routers", grid: "Routers" },
  { path: "/network/security-groups", grid: "Security groups" },
  { path: "/kubernetes/clusters", grid: "Clusters" },
  { path: "/kubernetes/cluster-templates", grid: "Cluster templates" },
  { path: "/load-balancers", grid: "Load balancers" },
  { path: "/orchestration/stacks", grid: "Stacks" },
  { path: "/dns/zones", grid: "Zones" },
  { path: "/shares/shares", grid: "Shares" },
  { path: "/databases/instances", grid: "Database instances" },
  { path: "/databases/backups", grid: "Database backups" },
  {
    path: "/identity/application-credentials",
    grid: "Application credentials",
  },
];

test.describe("every page", () => {
  for (const route of APP_ROUTES.filter((r) => !r.seeded)) {
    test(`${route.path} shows "${route.h1}"`, async ({ page }) => {
      await page.goto(route.path);
      await expectPage(page, route.h1);
      await checkPage(page);
    });
  }
});

test.describe("first record of each list", () => {
  for (const list of LISTS) {
    test(`${list.path}: the first record's page`, async ({ page }) => {
      await page.goto(list.path);
      const rows = table(page, list.grid).getByRole("row");
      // The header row is first; skip a list this project has nothing in.
      await expect(rows.first()).toBeVisible();
      test.skip((await rows.count()) < 2, "the list is empty here");
      const link = rows.nth(1).getByRole("link").first();
      const name = await link.innerText();
      await link.click();
      await expect(
        page.getByRole("heading", { level: 1, name: name.trim() }),
      ).toBeVisible();
      await checkPage(page);
    });
  }
});
