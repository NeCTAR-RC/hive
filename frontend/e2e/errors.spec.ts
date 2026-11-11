// What a user sees when the backend fails: a list that cannot load offers
// to try again, a dialog keeps its input and says why it failed, a batch
// that partly fails says why and keeps the failed rows selected, and a
// session that ends mid-task goes back through the login. A detail page
// for a record that does not exist says so, and one whose service this
// cloud lacks says the service is not available.
import {
  clearFailure,
  expect,
  failRequest,
  test,
  type Failure,
} from "./fixtures";
import {
  batchAction,
  dialog,
  expectPage,
  expectToast,
  main,
  row,
  table,
  tick,
} from "./helpers";

test.describe("failures", () => {
  test("a list that fails to load offers to try again", async ({ page }) => {
    await failRequest(page, "GET", "/api/compute/instances", 403);
    await page.goto("/compute/instances");
    const alert = page.getByRole("alert").filter({
      hasText: "Could not load the list",
    });
    await expect(alert).toContainText("the mock API refused this request");

    await clearFailure(page);
    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(row(table(page, "Instances"), "web-1")).toBeVisible();
    await expect(alert).toHaveCount(0);
  });

  const DIALOG_FAILURES: { failure: Failure; message: string }[] = [
    { failure: 409, message: "the mock API refused this request" },
    { failure: "network", message: "could not reach the dashboard service" },
  ];
  for (const { failure, message } of DIALOG_FAILURES) {
    test(`a dialog shows a ${failure} failure and keeps the input`, async ({
      page,
    }) => {
      await failRequest(page, "POST", "/api/object-store/containers", failure);
      await page.goto("/object-store/containers");
      await page.getByRole("button", { name: "Create container" }).click();
      const create = dialog(page, "Create container");
      const name = create.getByRole("textbox", { name: "Container name" });
      await name.fill("fresh");
      await create.getByRole("button", { name: "Create container" }).click();
      await expect(create).toContainText(message);
      await expect(name).toHaveValue("fresh");
    });
  }

  test("a batch that partly fails names the reason and keeps the row", async ({
    page,
  }) => {
    await failRequest(page, "DELETE", "/api/compute/instances/i-db-1");
    await page.goto("/compute/instances");
    const instances = table(page, "Instances");
    for (const name of ["web-1", "db-1", "worker-1"]) {
      await tick(instances.getByRole("checkbox", { name: `Select ${name}` }));
    }
    await batchAction(page, "Delete");
    const confirm = dialog(page, "Delete 3 instances?");
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();

    // One toast for the batch, with the first failure's reason.
    await expectToast(
      page,
      "Could not delete 1 of 3 instances: the mock API refused this request",
    );
    await expect(confirm).toHaveCount(0);
    await expect(row(instances, "web-1")).toHaveCount(0);
    await expect(row(instances, "worker-1")).toHaveCount(0);
    await expect(
      instances.getByRole("checkbox", { name: "Select db-1" }),
    ).toBeChecked();
  });

  test("a session that ends mid-task returns through the login", async ({
    page,
  }) => {
    await page.goto("/compute/instances");
    const instances = table(page, "Instances");
    await expect(row(instances, "web-1")).toBeVisible();
    await failRequest(page, "GET", "/api/compute/instances/i-web-1", 401);
    await instances.getByRole("link", { name: "web-1" }).click();
    await expect(page).toHaveURL(
      /\/auth\/login\?next=%2Fcompute%2Finstances%2Fi-web-1&reason=expired$/,
    );
    await expectPage(page, "Welcome to the Dashboard.");
    await expect(
      page.getByRole("status").filter({ hasText: "session ended" }),
    ).toHaveText("Your session ended. Please log in again.");
    await expect(
      page.getByRole("status").filter({ hasText: "continue" }),
    ).toHaveText("Log in to continue to /compute/instances/i-web-1.");
  });

  test("a dialog the session ended under opens again with its input", async ({
    page,
  }) => {
    await page.goto("/dns/zones?create=true");
    const create = dialog(page, "Create zone");
    await create.getByRole("textbox", { name: "Zone name" }).fill("kept.org.");
    await create.getByRole("textbox", { name: "Contact email" }).fill("a@b.co");
    await failRequest(page, "POST", "/api/dns/zones", 401);
    await create.getByRole("button", { name: "Create zone" }).click();
    await expect(page).toHaveURL(/\/auth\/login\?.*reason=expired/);

    // The login returns to the same address, which reopens the dialog.
    await clearFailure(page);
    await page.goto("/dns/zones?create=true");
    const again = dialog(page, "Create zone");
    await expect(again.getByRole("textbox", { name: "Zone name" })).toHaveValue(
      "kept.org.",
    );
    await expect(
      again.getByRole("textbox", { name: "Contact email" }),
    ).toHaveValue("a@b.co");
  });

  // One detail page per feature group, at an id the mocked cloud lacks.
  const UNKNOWN_RECORDS = [
    { path: "/compute/instances/no-such-id", noun: "Instance" },
    { path: "/network/routers/no-such-id", noun: "Router" },
    { path: "/storage/volumes/no-such-id", noun: "Volume" },
    { path: "/load-balancers/no-such-id", noun: "Load balancer" },
    { path: "/kubernetes/clusters/no-such-id", noun: "Cluster" },
    { path: "/orchestration/stacks/no-such-id", noun: "Stack" },
    { path: "/dns/zones/no-such-id", noun: "Zone" },
    { path: "/shares/shares/no-such-id", noun: "Share" },
    { path: "/databases/instances/no-such-id", noun: "Database instance" },
    { path: "/object-store/containers/no-such-id", noun: "Container" },
    {
      path: "/identity/application-credentials/no-such-id",
      noun: "Application credential",
    },
    { path: "/reservations/no-such-id", noun: "Reservation" },
  ];
  for (const { path, noun } of UNKNOWN_RECORDS) {
    test(`unknown id shows not found: ${path}`, async ({ page }) => {
      await page.goto(path);
      await expectPage(page, `${noun} not found`);
      await expect(main(page)).toContainText("no-such-id");
      await expect(
        main(page).getByRole("link", { name: /^Back to / }),
      ).toBeVisible();
    });
  }

  test("a detail that fails to load keeps the shell and offers a retry", async ({
    page,
  }) => {
    await failRequest(page, "GET", "/api/compute/keypairs/ada-laptop", 502);
    await page.goto("/compute/key-pairs");
    await table(page, "Key pairs")
      .getByRole("link", { name: "ada-laptop" })
      .click();
    const alert = main(page).getByRole("alert");
    await expect(alert).toContainText("the mock API refused this request");
    await expect(page.getByRole("banner")).toBeVisible();

    await clearFailure(page);
    await alert.getByRole("button", { name: "Try again" }).click();
    await expectPage(page, "ada-laptop");
  });

  test("a page opened after a long pause does not hang on the session", async ({
    page,
  }) => {
    await page.goto("/compute/key-pairs");
    const keyPairs = table(page, "Key pairs");
    await expect(
      keyPairs.getByRole("link", { name: "ada-laptop" }),
    ).toBeVisible();
    // The session was checked when the app loaded; a later failure of that
    // check must not replace the whole app on the next page.
    await failRequest(page, "GET", "/api/session", 502);
    await page.clock.runFor("06:00");
    await keyPairs.getByRole("link", { name: "ada-laptop" }).click();
    await expectPage(page, "ada-laptop");
  });

  test("a disabled service shows service not available", async ({ page }) => {
    await failRequest(page, "GET", "/api/databases/instances/db-1", 501);
    await page.goto("/databases/instances/db-1");
    await expectPage(page, "Service not available");
    await expect(main(page)).toContainText(
      "This service is not available in this cloud.",
    );
    await main(page)
      .getByRole("link", { name: "Back to database instances" })
      .click();
    await expectPage(page, "Database instances");
  });
});
