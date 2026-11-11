import { expect, expectNoSeriousA11yIssues, test } from "./fixtures";
import {
  checkPage,
  dialog,
  expectPage,
  expectSearchSurvivesBack,
  expectToast,
  main,
  openSection,
  row,
  rowAction,
  table,
} from "./helpers";

test.describe("stacks", () => {
  test("lists stacks and opens the detail tabs", async ({ page }) => {
    await page.goto("/orchestration/stacks");
    const stacks = table(page, "Stacks");
    await expect(stacks.getByRole("link", { name: "web-tier" })).toBeVisible();
    await expect(stacks.getByText("Create in progress")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await stacks.getByRole("link", { name: "web-tier" }).click();
    await expectPage(page, "web-tier");
    await expect(main(page).getByText("203.0.113.10")).toBeVisible();
    await openSection(page, "Resources");
    await expect(row(table(page, "Resources"), "server")).toBeVisible();
    await openSection(page, "Template");
    await expect(
      main(page).getByText("heat_template_version: 2021-04-16"),
    ).toBeVisible();
    await checkPage(page);
  });

  test("launches a stack from pasted text with generated parameters", async ({
    page,
  }) => {
    await page.goto("/orchestration/stacks/new");
    await page
      .getByRole("textbox", { name: "Template" })
      .fill("heat_template_version: 2021-04-16\nresources: {}\n");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(main(page).getByText("Two web servers")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sizing" })).toBeVisible();
    await page.getByRole("textbox", { name: "Stack name" }).fill("demo");
    // A key pair parameter is a choice of the project's key pairs.
    const keyPair = page.getByRole("button", { name: /Key pair/ });
    await expect(keyPair).toHaveAccessibleDescription(
      /Must be one of your key pairs/,
    );
    await keyPair.click();
    await page.getByRole("option", { name: "ada-laptop" }).click();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Launch" }).click();
    await expectToast(page, "Stack demo is being created.");
    await expect(
      table(page, "Stacks").getByRole("link", { name: "demo" }),
    ).toBeVisible();
  });

  test("Back from the parameters keeps the template", async ({ page }) => {
    const template = "heat_template_version: 2021-04-16\nresources: {}\n";
    await page.goto("/orchestration/stacks/new");
    await page.getByRole("textbox", { name: "Template" }).fill(template);
    await page
      .getByRole("textbox", { name: "Environment" })
      .fill("parameters: {}");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(main(page).getByText("Two web servers")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("textbox", { name: "Template" })).toHaveValue(
      template,
    );
    await expect(
      page.getByRole("textbox", { name: "Environment" }),
    ).toHaveValue("parameters: {}");
  });
});

test.describe("stack details", () => {
  test("links a resource to its page", async ({ page, isMobile }) => {
    test.skip(isMobile, "The physical ID column shows from the lg width");
    await page.goto("/orchestration/stacks/stack-1?tab=resources");
    await expect(
      row(table(page, "Resources"), "server").getByRole("link", {
        name: "i-1",
      }),
    ).toHaveAttribute("href", "/compute/instances/i-1");
  });

  test("starts a change of template from the current one", async ({ page }) => {
    await page.goto("/orchestration/stacks/stack-1");
    await main(page).getByRole("button", { name: "Change template" }).click();
    const change = dialog(page, "Change template of web-tier");
    await expect(change.getByRole("textbox", { name: "Template" })).toHaveValue(
      "heat_template_version: 2021-04-16\nresources: {}\n",
    );
    await expect(
      change.getByRole("textbox", { name: "Environment" }),
    ).toHaveValue("parameter_defaults:\n  flavor: m3.small\n");
  });

  test("says what a busy stack is doing", async ({ page }) => {
    await page.goto("/orchestration/stacks");
    await row(table(page, "Stacks"), "building")
      .getByRole("button", { name: "Actions" })
      .click();
    await expect(
      page.getByRole("menuitem", { name: /Suspend stack/ }),
    ).toContainText("The stack cannot be suspended while it is being created");
  });

  test("cancels a stack update from the list and the page", async ({
    page,
  }) => {
    await page.goto("/orchestration/stacks");
    const updating = row(table(page, "Stacks"), "rolling-out");
    await rowAction(updating, "Cancel stack update");
    await expectToast(page, "Cancelling the update of stack rolling-out.");

    // Only a stack being updated offers it.
    await page.goto("/orchestration/stacks/stack-1");
    await expect(
      main(page).getByRole("button", { name: "Cancel update" }),
    ).toHaveCount(0);
    await page.goto("/orchestration/stacks/stack-3");
    await main(page).getByRole("button", { name: "Cancel update" }).click();
    await expectToast(page, "Cancelling the update of stack rolling-out.");
    await expect(
      main(page).getByRole("button", { name: "Cancel update" }),
    ).toHaveCount(0);
  });

  test("steps back to the template from the launch stack's step strip", async ({
    page,
  }) => {
    await page.goto("/orchestration/stacks/new");
    const steps = page.getByRole("list", { name: "Launch stack steps" });
    await expect(steps.getByRole("listitem")).toHaveCount(2);
    await page
      .getByRole("textbox", { name: "Template" })
      .fill("heat_template_version: 2021-04-16\nresources: {}\n");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(main(page).getByText("Two web servers")).toBeVisible();
    await steps.getByRole("button", { name: /Select template/ }).click();
    await expect(page.getByRole("textbox", { name: "Template" })).toHaveValue(
      "heat_template_version: 2021-04-16\nresources: {}\n",
    );
  });

  test("asks for the stack timeout in minutes", async ({ page }) => {
    await page.goto("/orchestration/stacks/new");
    await page
      .getByRole("textbox", { name: "Template" })
      .fill("heat_template_version: 2021-04-16\nresources: {}\n");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("textbox", { name: "Stack name" }).fill("demo");
    await page.getByRole("textbox", { name: "Creation timeout" }).fill("");
    await page.getByRole("button", { name: "Launch" }).click();
    await expect(
      main(page).getByText("Enter a number of minutes"),
    ).toBeVisible();
  });

  test("leaves the launch by Cancel after asking", async ({ page }) => {
    await page.goto("/orchestration/stacks/new");
    await page.getByRole("textbox", { name: "Template" }).fill("x: 1");
    await main(page).getByRole("link", { name: "Cancel" }).click();
    await dialog(page, "Leave without launching the stack?")
      .getByRole("button", { name: "Leave" })
      .click();
    await expectPage(page, "Stacks");
  });
});

test.describe("resource types and template versions", () => {
  test("shows a resource type and a template version's functions", async ({
    page,
  }) => {
    await page.goto("/orchestration/resource-types");
    await table(page, "Resource types")
      .getByRole("link", { name: "OS::Nova::Server" })
      .click();
    await expectPage(page, "OS::Nova::Server");
    await expect(main(page).getByText("The flavour")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await page.goto("/orchestration/template-versions");
    await table(page, "Template versions")
      .getByRole("link", { name: "heat_template_version.2021-04-16" })
      .click();
    await expect(
      table(page, "Template functions").getByText("str_replace"),
    ).toBeVisible();
    await checkPage(page);
  });
});

test("keeps the stacks search when coming back to the list", async ({
  page,
}) => {
  await expectSearchSurvivesBack(page, {
    path: "/orchestration/stacks",
    table: "Stacks",
    text: "web",
    link: "web-tier",
  });
});
