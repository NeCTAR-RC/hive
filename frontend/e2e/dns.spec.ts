import { expect, expectNoSeriousA11yIssues, test } from "./fixtures";
import {
  checkPage,
  dialog,
  expectPage,
  expectSearchSurvivesBack,
  expectToast,
  row,
  rowAction,
  table,
} from "./helpers";

test.describe("zones", () => {
  test("lists zones, creates one and manages record sets", async ({ page }) => {
    await page.goto("/dns/zones");
    const zones = table(page, "Zones");
    await expect(
      zones.getByRole("link", { name: "example.org." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create zone" }).click();
    const create = dialog(page, "Create zone");
    await create.getByRole("textbox", { name: "Zone name" }).fill("new.org.");
    await create.getByRole("textbox", { name: "Contact email" }).fill("a@b.co");
    await expectNoSeriousA11yIssues(page);
    await create.getByRole("button", { name: "Create zone" }).click();
    await expectToast(page, "Zone new.org. is being created.");
    await expect(zones.getByRole("link", { name: "new.org." })).toBeVisible();

    await zones.getByRole("link", { name: "example.org." }).click();
    await expectPage(page, "example.org.");
    const recordSets = table(page, "Record sets");
    await expect(recordSets.getByText("www.example.org.")).toBeVisible();
    await checkPage(page);
    await page.getByRole("button", { name: "Create record set" }).click();
    const createRecords = dialog(page, "Create record set");
    await createRecords.getByRole("textbox", { name: "Name" }).fill("mail");
    await createRecords
      .getByRole("textbox", { name: "Records" })
      .fill("203.0.113.20");
    await createRecords
      .getByRole("button", { name: "Create record set" })
      .click();
    await expectToast(page, "Record set mail.example.org. is being created.");
    await expect(recordSets.getByText("mail.example.org.")).toBeVisible();
  });
});

test.describe("record set and zone checks", () => {
  test("checks the records against the record type", async ({ page }) => {
    await page.goto("/dns/zones");
    await table(page, "Zones")
      .getByRole("link", { name: "example.org." })
      .click();
    await page.getByRole("button", { name: "Create record set" }).click();
    const create = dialog(page, "Create record set");
    await create.getByRole("textbox", { name: "Name" }).fill("ftp");
    const records = create.getByRole("textbox", { name: "Records" });
    await records.fill("203.0.113.10\n203.0.113.300");
    await create.getByRole("button", { name: "Create record set" }).click();
    await expect(
      create.getByText('"203.0.113.300" is not an IPv4 address'),
    ).toBeVisible();
    await records.fill("203.0.113.10");
    await create.getByRole("button", { name: "Create record set" }).click();
    await expectToast(page, "Record set ftp.example.org. is being created.");
  });

  test("sends a cleared TTL as null so the zone default applies", async ({
    page,
  }) => {
    await page.goto("/dns/zones/zone-1");
    await rowAction(
      row(table(page, "Record sets"), "www.example.org."),
      "Edit record set",
    );
    const edit = dialog(page, "Edit www.example.org.");
    const ttl = edit.getByRole("textbox", { name: "TTL" });
    await expect(ttl).toHaveValue("300");
    await expect(
      edit.getByText("Leave blank to use the zone default."),
    ).toBeVisible();
    await ttl.fill("");
    const update = page.waitForRequest(
      (request) =>
        request.method() === "PUT" &&
        request.url().endsWith("/api/dns/zones/zone-1/recordsets/rs-www"),
    );
    await edit.getByRole("button", { name: "Save" }).click();
    expect((await update).postDataJSON()).toHaveProperty("ttl", null);
    await expectToast(page, "Record set www.example.org. is being updated.");
  });

  test("offers to edit a record set rather than duplicate it", async ({
    page,
  }) => {
    await page.goto("/dns/zones");
    await table(page, "Zones")
      .getByRole("link", { name: "example.org." })
      .click();
    await page.getByRole("button", { name: "Create record set" }).click();
    const create = dialog(page, "Create record set");
    await create.getByRole("textbox", { name: "Name" }).fill("www");
    await expect(
      create.getByText("www.example.org. already has an A record set."),
    ).toBeVisible();
    await expect(
      create.getByRole("button", { name: "Create record set" }),
    ).toBeDisabled();
    await expectNoSeriousA11yIssues(page);
    await create.getByRole("button", { name: "Edit it instead?" }).click();
    await expect(dialog(page, "Edit www.example.org.")).toBeVisible();
  });

  test("adds the final dot to a zone name and refuses spaces", async ({
    page,
  }) => {
    await page.goto("/dns/zones");
    await page.getByRole("button", { name: "Create zone" }).click();
    const create = dialog(page, "Create zone");
    const name = create.getByRole("textbox", { name: "Zone name" });
    await name.fill("My Zone.com");
    await create.getByRole("textbox", { name: "Contact email" }).fill("a@b.co");
    await create.getByRole("button", { name: "Create zone" }).click();
    await expect(
      create.getByText(/Use letters, digits and hyphens/),
    ).toBeVisible();
    await name.fill("lab.example.com");
    await create.getByRole("button", { name: "Create zone" }).click();
    await expectToast(page, "Zone lab.example.com. is being created.");
  });
});

test("keeps the zones search when coming back to the list", async ({
  page,
}) => {
  await expectSearchSurvivesBack(page, {
    path: "/dns/zones",
    table: "Zones",
    text: "example",
    link: "example.org.",
  });
});
