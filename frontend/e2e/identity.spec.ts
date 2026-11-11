import {
  expect,
  expectNoSeriousA11yIssues,
  setMockSession,
  test,
} from "./fixtures";
import {
  checkPage,
  closeButton,
  dialog,
  expectPage,
  expectSearchSurvivesBack,
  expectToast,
  main,
  row,
  table,
} from "./helpers";

test.describe("project members", () => {
  // Removing a member is in destructive.spec.ts.
  test("lists members and adds one, refusing an unknown user", async ({
    page,
  }) => {
    await page.goto("/members");
    const members = table(page, "Project members");
    await expect(members.getByText("ann@example.edu")).toBeVisible();
    await page.getByRole("button", { name: "Add member" }).click();
    const add = dialog(page, "Add member");
    const username = add.getByRole("textbox", { name: "Username" });
    await username.fill("nobody@example.edu");
    await add.getByRole("button", { name: "Add member" }).click();
    await expect(add.getByText(/no Nectar RC account/)).toBeVisible();
    await username.fill("new@example.edu");
    await add.getByRole("button", { name: "Add member" }).click();
    await expectToast(page, "Added new@example.edu as member.");
    await expect(members.getByText("new@example.edu")).toBeVisible();
    await checkPage(page);
  });

  test("says when the user already holds the role", async ({ page }) => {
    await page.goto("/members?add=true");
    const add = dialog(page, "Add member");
    const username = add.getByRole("textbox", { name: "Username" });
    await username.fill("Ann@example.edu");
    await add.getByRole("button", { name: "Add member" }).click();
    await expect(username).toHaveAccessibleDescription(
      "ann@example.edu already has the member role in this project",
    );
    await expect(add).toBeVisible();
  });
});

test.describe("application credentials", () => {
  test("creates a credential and shows the secret once", async ({ page }) => {
    await page.goto("/identity/application-credentials");
    const credentials = table(page, "Application credentials");
    await expect(
      credentials.getByRole("link", { name: "deploy-bot" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Create application credential" })
      .click();
    const create = dialog(page, "Create application credential");
    await create.getByRole("textbox", { name: "Name" }).fill("backup-bot");
    await expectNoSeriousA11yIssues(page);
    await create
      .getByRole("button", { name: "Create application credential" })
      .click();
    const secret = dialog(page, "Application credential created");
    await expect(secret.getByText("mock-secret-value")).toBeVisible();
    await expect(
      secret.getByRole("button", { name: "Download openrc file" }),
    ).toBeEnabled();
    await expectNoSeriousA11yIssues(page);
    await closeButton(secret).click();
    await credentials.getByRole("link", { name: "backup-bot" }).click();
    await expectPage(page, "backup-bot");
    await expectNoSeriousA11yIssues(page);
  });
});

test.describe("EC2 credentials", () => {
  test("creates EC2 credentials for the project", async ({ page }) => {
    await page.goto("/identity/credentials");
    await page.getByRole("button", { name: "Create EC2 credentials" }).click();
    await expect(main(page).getByText("AKIAMOCK")).toBeVisible();
    // The secret stays off the page until asked for.
    await expect(main(page).getByText("mock-ec2-secret")).toHaveCount(0);
    await page.getByRole("button", { name: "Show secret key" }).click();
    await expect(main(page).getByText("mock-ec2-secret")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Recreate EC2 credentials" }),
    ).toBeVisible();
    await checkPage(page);
  });

  test("lists the keys of other projects by access key", async ({ page }) => {
    await page.goto("/identity/credentials");
    // The generic credential creator is gone; EC2 keys are made per project.
    await expect(
      page.getByRole("button", { name: "Create credential" }),
    ).toHaveCount(0);
    const keys = table(page, "EC2 keys in your other projects");
    const key = row(keys, "pt-1234");
    await expect(key).toContainText("AK");
    await expect(key).not.toContainText("{");
  });
});

test.describe("user details", () => {
  test("looks a user up", async ({ page }) => {
    await setMockSession(page, "helpdesk");
    await page.goto("/identity/user-lookup?q=ann");
    const users = table(page, "Matching Nectar users");
    await expect(users.getByText("Ann Example")).toBeVisible();
    await users.getByRole("link", { name: "u2" }).click();
    await expectPage(page, "Ann Example");
    await expect(
      main(page).getByText("https://idp.example.edu/idp"),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });

  test("tells a user without the lookup role they have no access", async ({
    page,
  }) => {
    await page.goto("/identity/user-lookup?q=ann");
    await expectPage(page, "User details");
    await expect(main(page)).toContainText(
      "You do not have access to user lookup.",
    );
    await expect(main(page).getByRole("searchbox")).toHaveCount(0);
    await page.goto("/identity/users/u2");
    await expectPage(page, "User details");
    await expect(main(page)).toContainText(
      "You do not have access to user lookup.",
    );
  });
});

test("keeps the application credentials search when coming back to the list", async ({
  page,
}) => {
  await expectSearchSurvivesBack(page, {
    path: "/identity/application-credentials",
    table: "Application credentials",
    text: "deploy",
    link: "deploy-bot",
  });
});
