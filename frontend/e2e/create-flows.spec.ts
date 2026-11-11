// What every create page shares: leaving with unsaved input asks first,
// and a wizard moves focus to the new step's heading on Next, so screen
// reader users hear where they are.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { dialog, expectPage, main } from "./helpers";

interface CreateFlow {
  path: string;
  /** Puts unsaved input on the page. */
  dirty: (page: Page) => Promise<void>;
  /** The breadcrumb that leaves for the list, and the list's title. */
  crumb: string;
  list: string;
  leaveTitle: string;
}

/** Types into a text field on the page. */
const typeInto = (name: string) => async (page: Page) => {
  await main(page).getByRole("textbox", { name }).fill("e2e-test");
};

/** The wizard's live region, which names the step on screen. */
function stepStatus(page: Page) {
  return main(page)
    .getByRole("status")
    .filter({ hasText: /^Step \d+ of \d+:/ });
}

const FLOWS: CreateFlow[] = [
  {
    path: "/compute/instances/launch",
    dirty: typeInto("Instance name"),
    crumb: "Instances",
    list: "Instances",
    leaveTitle: "Leave without launching?",
  },
  {
    path: "/load-balancers/new",
    dirty: typeInto("Name"),
    crumb: "Load balancers",
    list: "Load balancers",
    leaveTitle: "Leave without creating the load balancer?",
  },
  {
    path: "/kubernetes/clusters/new",
    dirty: typeInto("Cluster name"),
    crumb: "Clusters",
    list: "Clusters",
    leaveTitle: "Leave without creating the cluster?",
  },
  {
    path: "/orchestration/stacks/new",
    dirty: typeInto("Template"),
    crumb: "Stacks",
    list: "Stacks",
    leaveTitle: "Leave without launching the stack?",
  },
  {
    path: "/databases/instances/new",
    dirty: typeInto("Instance name"),
    crumb: "Instances",
    list: "Database instances",
    leaveTitle: "Leave without launching the database instance?",
  },
];

test.describe("create flows", () => {
  for (const flow of FLOWS) {
    test(`leaving a dirty create page asks first: ${flow.path}`, async ({
      page,
    }) => {
      await page.goto(flow.path);
      await flow.dirty(page);
      await main(page)
        .getByRole("link", { name: flow.crumb, exact: true })
        .click();
      const leave = dialog(page, flow.leaveTitle);
      await expect(leave).toContainText(
        "Your choices on this page will be lost.",
      );
      await leave.getByRole("button", { name: "Leave" }).click();
      await expectPage(page, flow.list);
    });
  }

  // The reservation is made in the dialog a picked slot opens, so a picked
  // slot is the unsaved input, and the back button is the way out.
  test("leaving a dirty create page asks first: /reservations/new", async ({
    page,
  }) => {
    await page.goto("/reservations");
    await main(page)
      .getByRole("link", { name: "Create reservation", exact: true })
      .click();
    await expectPage(page, "Create reservation");
    await page.getByRole("button", { name: /^Reserve ardc.g3.xlarge/ }).click();
    await expect(dialog(page, "Reserve time slot")).toBeVisible();
    await page.goBack();
    const leave = dialog(page, "Leave without creating the reservation?");
    await leave.getByRole("button", { name: "Leave" }).click();
    await expectPage(page, "Reservations");
  });

  test("after Next the focused element is the step heading: launch", async ({
    page,
  }) => {
    await page.goto("/compute/instances/launch");
    await page.getByRole("textbox", { name: "Instance name" }).fill("e2e-test");
    await page.getByRole("button", { name: /Availability zone/ }).click();
    await page.getByRole("option", { name: "melbourne-qh2" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      main(page).getByRole("heading", { name: "Source", level: 2 }),
    ).toBeFocused();
    await expect(stepStatus(page)).toHaveText("Step 2 of 7: Source");
  });

  test("after Next the focused element is the step heading: load balancer", async ({
    page,
  }) => {
    await page.goto("/load-balancers/new");
    await page.getByRole("button", { name: /Subnet/ }).click();
    await page.getByRole("option", { name: /private/ }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      main(page).getByRole("heading", { name: "Listener", level: 2 }),
    ).toBeFocused();
    await expect(stepStatus(page)).toHaveText("Step 2 of 5: Listener");
  });
});
