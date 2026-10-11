import {
  expect,
  expectNoHorizontalScroll,
  expectNoSeriousA11yIssues,
  test,
} from "./fixtures";

test.describe("object store", () => {
  test("lists containers and creates one", async ({ page }) => {
    await page.goto("/object-store/containers");
    const table = page.getByRole("grid", { name: "Containers" });
    await expect(table.getByRole("link", { name: "docs" })).toBeVisible();
    await page.getByRole("button", { name: "Create container" }).click();
    const dialog = page.getByRole("dialog", { name: "Create container" });
    await dialog.getByRole("textbox", { name: "Container name" }).fill("fresh");
    await expectNoSeriousA11yIssues(page);
    await dialog.getByRole("button", { name: "Create container" }).click();
    await expect(page.getByText("Container fresh created.")).toBeVisible();
    await expect(table.getByRole("link", { name: "fresh" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("browses folders, uploads, copies and deletes objects", async ({
    page,
  }) => {
    await page.goto("/object-store/containers/docs");
    const table = page.getByRole("grid", { name: "Objects" });
    await expect(table.getByRole("link", { name: "notes/" })).toBeVisible();
    await expect(page.getByText("Public access")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await table.getByRole("link", { name: "notes/" }).click();
    await expect(page).toHaveURL(/\/object-store\/containers\/docs\/notes$/);
    await expect(
      table.getByRole("rowheader", { name: "todo.txt" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Upload files" }).click();
    const upload = page.getByRole("dialog", { name: "Upload files" });
    await upload.getByRole("button", { name: "Choose files" }).click();
    await page.setInputFiles('input[type="file"]', {
      name: "hello.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello world"),
    });
    await upload.getByRole("button", { name: /^Upload 1 file/ }).click();
    await expect(page.getByText("Uploaded hello.txt.")).toBeVisible();
    await upload
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .click();
    await expect(
      table.getByRole("rowheader", { name: "hello.txt" }),
    ).toBeVisible();

    const row = page
      .getByRole("row")
      .filter({ has: page.getByRole("rowheader", { name: "hello.txt" }) });
    await row.getByRole("button", { name: /actions/i }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("dialog", { name: "Delete hello.txt?" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(page.getByText("Deleted hello.txt.")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe("kubernetes", () => {
  test("lists clusters with quota and opens the detail tabs", async ({
    page,
  }) => {
    await page.goto("/kubernetes/clusters");
    await expect(page.getByText("1 of 10 clusters")).toBeVisible();
    const table = page.getByRole("grid", { name: "Clusters" });
    await expect(table.getByText("Create complete")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await table.getByRole("link", { name: "samtest1" }).click();
    await expect(
      page.getByRole("heading", { name: "samtest1", level: 1 }),
    ).toBeVisible();
    await page
      .getByRole("tab", { name: "Node groups" })
      .or(page.getByRole("button", { name: "Node groups" }))
      .click();
    await expect(
      page
        .getByRole("grid", { name: "Node groups" })
        .getByText("default-worker"),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("creates a cluster from the version, zone and driver pickers", async ({
    page,
  }) => {
    await page.goto("/kubernetes/clusters/new");
    await page.getByRole("textbox", { name: "Cluster name" }).fill("demo");
    await page.getByRole("button", { name: /Kubernetes version/ }).click();
    await page.getByRole("option", { name: "1.33.4" }).click();
    await page.getByRole("button", { name: /Availability zone/ }).click();
    await page.getByRole("option", { name: "aucklandtest" }).click();
    await expect(
      page.getByText("This template runs a single control plane node."),
    ).toBeVisible();
    await expect(
      page.getByText("kubernetes-v1.33.4-aucklandtest-cilium-v2"),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Create cluster" }).click();
    await expect(
      page.getByText("Cluster demo is being created."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/kubernetes\/clusters$/);
  });

  test("upgrades a cluster", async ({ page }) => {
    await page.goto("/kubernetes/clusters/c-1");
    await page.getByRole("button", { name: "Upgrade" }).click();
    const dialog = page.getByRole("dialog", { name: "Upgrade samtest1" });
    await expect(dialog.getByText(/runs Kubernetes v1.33.4/)).toBeVisible();
    await dialog.getByRole("button", { name: "Upgrade", exact: true }).click();
    await expect(page.getByText(/is being upgraded/)).toBeVisible();
  });

  test("lists cluster templates", async ({ page }) => {
    await page.goto("/kubernetes/cluster-templates");
    const table = page.getByRole("grid", { name: "Cluster templates" });
    await table
      .getByRole("link", { name: "kubernetes-v1.34.0-ardctest-artm-calico-v1" })
      .click();
    await expect(page.getByText("Control plane load balancer")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });
});

test.describe("load balancers", () => {
  test("lists load balancers and shows the tree", async ({ page }) => {
    await page.goto("/load-balancers");
    const table = page.getByRole("grid", { name: "Load balancers" });
    await expect(table.getByRole("link", { name: "web" })).toBeVisible();
    await expect(table.getByText("Active")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await table.getByRole("link", { name: "web" }).click();
    await page
      .getByRole("tab", { name: "Listeners" })
      .or(page.getByRole("button", { name: "Listeners" }))
      .click();
    await expect(
      page
        .getByRole("grid", { name: "Listeners" })
        .getByRole("link", { name: "http" }),
    ).toBeVisible();
    await page
      .getByRole("tab", { name: "Pools" })
      .or(page.getByRole("button", { name: "Pools" }))
      .click();
    await page
      .getByRole("grid", { name: "Pools" })
      .getByRole("link", { name: "web-pool" })
      .click();
    await expect(
      page.getByRole("grid", { name: "Members" }).getByText("192.168.1.20:80"),
    ).toBeVisible();
    await expect(page.getByText("GET /healthz")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test("creates a load balancer through the wizard", async ({ page }) => {
    await page.goto("/load-balancers/new");
    await page.getByRole("textbox", { name: "Name" }).fill("api");
    await page.getByRole("button", { name: /Subnet/ }).click();
    await page.getByRole("option", { name: /private/ }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("textbox", { name: "Port" })).toHaveValue("80");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Add instance" }).isDisabled();
    await page.getByRole("button", { name: /Available instances/ }).click();
    await page.getByRole("option", { name: /db-1/ }).click();
    await page.getByRole("button", { name: "Add instance" }).click();
    await expect(page.getByRole("textbox", { name: "IP address" })).toHaveValue(
      "192.168.1.30",
    );
    await page.getByRole("button", { name: "Next" }).click();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Create load balancer" }).click();
    await expect(
      page.getByText("A new load balancer is being created."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/load-balancers$/);
  });

  test("manages L7 policies on a listener", async ({ page }) => {
    await page.goto("/load-balancers/lb-1/listeners/l-1");
    await expect(
      page.getByRole("grid", { name: "L7 policies" }).getByText("block-admin"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create policy" }).click();
    const dialog = page.getByRole("dialog", { name: "Create L7 policy" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("to-docs");
    await dialog.getByRole("button", { name: /Action/ }).click();
    await page.getByRole("option", { name: "REDIRECT TO URL" }).click();
    await dialog
      .getByRole("textbox", { name: "Redirect URL" })
      .fill("https://docs.example.org");
    await dialog.getByRole("button", { name: "Create policy" }).click();
    await expect(
      page.getByText("A new L7 policy is being created."),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });
});
