import {
  expect,
  expectNoHorizontalScroll,
  expectNoSeriousA11yIssues,
  test,
} from "./fixtures";

test.describe("security groups", () => {
  test("lists groups and adds a rule", async ({ page }) => {
    await page.goto("/network/security-groups");
    await expect(
      page.getByRole("heading", { name: "Security Groups", level: 1 }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
    await page.getByRole("link", { name: "web", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "web", level: 1 }),
    ).toBeVisible();
    const rules = page.getByRole("grid", { name: "Rules" });
    await expect(rules.getByRole("row")).toHaveCount(4);
    await expect(page.getByText("Open to the internet").first()).toBeVisible();

    await page.getByRole("button", { name: "Add rule" }).click();
    const dialog = page.getByRole("dialog", { name: "Add rule to web" });
    await dialog.getByRole("textbox", { name: "Port" }).fill("8080");
    await dialog.getByRole("textbox", { name: "CIDR" }).fill("0.0.0.0/0");
    await expect(
      dialog.getByText(/opens the port to every address/),
    ).toBeVisible();
    await dialog.getByRole("textbox", { name: "CIDR" }).fill("203.0.113.0/24");
    await dialog.getByRole("button", { name: "Add rule" }).click();
    await expect(page.getByText("Rule added to web.")).toBeVisible();
    await expect(rules.getByRole("row")).toHaveCount(5);
    await expectNoSeriousA11yIssues(page);
  });

  test("requires a remote for a new rule", async ({ page }) => {
    await page.goto("/network/security-groups/secgroup-web");
    await page.getByRole("button", { name: "Add rule" }).click();
    const dialog = page.getByRole("dialog", { name: "Add rule to web" });
    await dialog.getByRole("textbox", { name: "Port" }).fill("22");
    await dialog.getByRole("button", { name: "Add rule" }).click();
    await expect(dialog.getByText(/Enter a CIDR/)).toBeVisible();
  });
});

test.describe("api access", () => {
  test("lists endpoints and shows credentials", async ({ page }) => {
    await page.goto("/api-access");
    await expect(
      page.getByRole("heading", { name: "API Access", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText("https://nova.rctest.nectar.org.au/v2.1/"),
    ).toBeVisible();
    await page.getByRole("button", { name: "View credentials" }).click();
    const dialog = page.getByRole("dialog", { name: "User credentials" });
    await expect(dialog.getByText("researcher@example.edu")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await dialog.getByRole("button", { name: "Close" }).first().click();
    await expectNoHorizontalScroll(page);
  });
});
