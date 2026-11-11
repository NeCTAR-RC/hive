import { expect, expectNoSeriousA11yIssues, test } from "./fixtures";
import { checkPage, dialog, expectPage, expectToast, main } from "./helpers";

test.describe("my details", () => {
  test("edits my details and asks before disconnecting ORCID", async ({
    page,
  }) => {
    await page.goto("/account/my-details");
    await expectPage(page, "My details");
    await expect(main(page).getByText("Example University")).toBeVisible();
    await expect(main(page).getByText("0000-0002-1825-0097")).toBeVisible();
    await page
      .getByRole("textbox", { name: "Mobile number" })
      .fill("0411 222 333");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expectToast(page, "Your details have been updated.");
    await checkPage(page);

    // Disconnecting goes through manuka, so only the question is in Hive.
    await page.getByRole("button", { name: "Disconnect ORCID" }).click();
    const disconnect = dialog(page, "Disconnect this ORCID iD?");
    await expect(
      disconnect.getByRole("button", { name: "Disconnect" }),
    ).toBeVisible();
    await disconnect.getByRole("button", { name: "Cancel" }).click();
    await expect(disconnect).toHaveCount(0);
    await expect(main(page).getByText("0000-0002-1825-0097")).toBeVisible();
  });
});

test.describe("reset password", () => {
  test("resets the API password after confirming", async ({ page }) => {
    await page.goto("/account/reset-password");
    await page.getByRole("button", { name: "Reset password" }).click();
    const confirm = dialog(page, "Reset your API password?");
    await expectNoSeriousA11yIssues(page);
    await confirm.getByRole("button", { name: "Reset password" }).click();
    await expect(
      main(page).getByText("Your password has been reset."),
    ).toBeVisible();
    await expect(main(page).getByText("bW9ja3Bhc3N3b3JkMTIz")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });
});
