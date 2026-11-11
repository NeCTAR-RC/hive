import {
  clearFailure,
  expect,
  expectNoSeriousA11yIssues,
  failRequest,
  test,
} from "./fixtures";
import {
  checkPage,
  dialog,
  expectPage,
  expectSearchSurvivesBack,
  expectToast,
  main,
  openSection,
  row,
  table,
} from "./helpers";

test.describe("clusters", () => {
  test("lists clusters with quota and opens the detail tabs", async ({
    page,
  }) => {
    await page.goto("/kubernetes/clusters");
    await expect(
      main(page).getByRole("meter", { name: "Clusters" }),
    ).toBeVisible();
    const clusters = table(page, "Clusters");
    await expect(clusters.getByText("Create complete")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await clusters.getByRole("link", { name: "samtest1" }).click();
    await expectPage(page, "samtest1");
    await openSection(page, "Node groups");
    await expect(
      table(page, "Node groups").getByText("default-worker"),
    ).toBeVisible();
    await checkPage(page);
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
      main(page).getByText("This template runs a single control plane node."),
    ).toBeVisible();
    await expect(
      main(page).getByText("kubernetes-v1.33.4-aucklandtest-cilium-v2"),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole("button", { name: "Create cluster" }).click();
    await expectToast(page, "Cluster demo is being created.");
    await expect(page).toHaveURL(/\/kubernetes\/clusters$/);
  });

  test("upgrades a cluster", async ({ page }) => {
    await page.goto("/kubernetes/clusters/c-1");
    await page.getByRole("button", { name: "Upgrade" }).click();
    const upgrade = dialog(page, "Upgrade samtest1");
    await expect(upgrade.getByText(/runs Kubernetes v1.33.4/)).toBeVisible();
    await upgrade.getByRole("button", { name: "Upgrade", exact: true }).click();
    await expectToast(page, /is being upgraded/);
  });

  test("keeps Upgrade disabled when the targets do not load", async ({
    page,
  }) => {
    await failRequest(
      page,
      "GET",
      "/api/kubernetes/clusters/c-1/upgrade-options",
      500,
    );
    await page.goto("/kubernetes/clusters/c-1");
    await page.getByRole("button", { name: "Upgrade" }).click();
    const upgrade = dialog(page, "Upgrade samtest1");
    await expect(
      upgrade.getByText("Could not load the upgrade targets"),
    ).toBeVisible();
    await expect(
      upgrade.getByRole("button", { name: "Upgrade", exact: true }),
    ).toBeDisabled();
    // Once the request succeeds, Try again loads the targets.
    await clearFailure(page);
    await upgrade.getByRole("button", { name: "Try again" }).click();
    await expect(upgrade.getByText(/runs Kubernetes v1.33.4/)).toBeVisible();
    await expect(
      upgrade.getByRole("button", { name: "Upgrade", exact: true }),
    ).toBeEnabled();
  });
});

test.describe("create cluster checks", () => {
  test("clears each message once the form fills its field", async ({
    page,
  }) => {
    await page.goto("/kubernetes/clusters/new");
    await page.getByRole("button", { name: "Create cluster" }).click();
    const content = main(page);
    await expect(content).toContainText("Choose an availability zone");
    await expect(content).toContainText("Choose a worker flavour");
    await page.getByRole("button", { name: /Kubernetes version/ }).click();
    await page.getByRole("option", { name: "1.34.0" }).click();
    // The zone, driver and flavours follow from the version's one template.
    for (const message of [
      "Choose a Kubernetes version",
      "Choose an availability zone",
      "Choose a network driver",
      "Choose a control plane flavour",
      "Choose a worker flavour",
    ]) {
      await expect(content).not.toContainText(message);
    }
  });

  test("holds the nodes to the compute quota", async ({ page }) => {
    await page.goto("/kubernetes/clusters/new");
    await page.getByRole("textbox", { name: "Cluster name" }).fill("big");
    await page.getByRole("button", { name: /Kubernetes version/ }).click();
    await page.getByRole("option", { name: "1.34.0" }).click();
    const workers = page.getByRole("textbox", { name: "Worker nodes" });
    await expect(workers).toHaveAccessibleDescription(
      "The project has 7 instances, 24 vCPUs and 48 GB of RAM left.",
    );
    await workers.fill("500");
    await page.getByRole("button", { name: "Create cluster" }).click();
    await expect(main(page)).toContainText(
      "The cluster needs 501 instances; the project has 7 left",
    );
    await expect(page).toHaveURL(/\/kubernetes\/clusters\/new$/);
  });

  test("creates a cluster with a key pair and autoscaling", async ({
    page,
  }) => {
    await page.goto("/kubernetes/clusters/new");
    await page.getByRole("textbox", { name: "Cluster name" }).fill("scaled");
    await page.getByRole("button", { name: /Kubernetes version/ }).click();
    await page.getByRole("option", { name: "1.34.0" }).click();
    await page.getByRole("button", { name: /Key pair/ }).click();
    await page.getByRole("option", { name: "ada-laptop" }).click();
    await page.getByText("Autoscale the workers").click();
    await page.getByRole("textbox", { name: "Fewest workers" }).fill("1");
    await page.getByRole("textbox", { name: "Most workers" }).fill("3");
    const create = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().endsWith("/api/kubernetes/clusters"),
    );
    await page.getByRole("button", { name: "Create cluster" }).click();
    expect((await create).postDataJSON()).toMatchObject({
      keypair: "ada-laptop",
      autoscaling: true,
      min_node_count: 1,
      max_node_count: 3,
    });
    await expectToast(page, "Cluster scaled is being created.");
  });

  test("lets a cluster being created be deleted, not yet downloaded", async ({
    page,
  }) => {
    await page.goto("/kubernetes/clusters/new");
    await page.getByRole("textbox", { name: "Cluster name" }).fill("oops");
    await page.getByRole("button", { name: /Kubernetes version/ }).click();
    await page.getByRole("option", { name: "1.34.0" }).click();
    await page.getByRole("button", { name: "Create cluster" }).click();
    await expectToast(page, "Cluster oops is being created.");
    const oops = row(table(page, "Clusters"), "oops");
    await oops.getByRole("button", { name: "Actions" }).click();
    for (const item of ["Download CA certificate", "Sign a certificate"]) {
      const action = page.getByRole("menuitem", { name: new RegExp(item) });
      await expect(action).toBeDisabled();
      await expect(action).toContainText("The cluster has no API address yet");
    }
    await page.getByRole("menuitem", { name: "Delete cluster" }).click();
    const confirm = dialog(page, "Delete cluster oops?");
    await expect(confirm).toContainText("stops building");
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expectToast(page, /Deleted cluster oops/);
  });

  test("downloads the CA certificate through the API", async ({ page }) => {
    await page.goto("/kubernetes/clusters");
    const download = page.waitForEvent("download");
    await row(table(page, "Clusters"), "samtest1")
      .getByRole("button", { name: "Actions" })
      .click();
    await page
      .getByRole("menuitem", { name: "Download CA certificate" })
      .click();
    expect((await download).suggestedFilename()).toBe("samtest1_ca.pem");
  });
});

test.describe("cluster templates", () => {
  test("creates a cluster from a template, pre-filled", async ({ page }) => {
    await page.goto("/kubernetes/cluster-templates/t-133");
    await expect(
      main(page).getByRole("link", {
        name: "NeCTAR Ubuntu 24.04 LTS (Noble) amd64",
      }),
    ).toHaveAttribute("href", "/compute/images/img-ubuntu");
    await expect(
      main(page).getByRole("link", {
        name: "kubernetes-v1.34.0-ardctest-artm-calico-v1",
      }),
    ).toHaveAttribute("href", "/kubernetes/cluster-templates/t-134");
    await main(page).getByRole("link", { name: "Create cluster" }).click();
    await expectPage(page, "Create cluster");
    await expect(
      page.getByRole("button", { name: /Kubernetes version/ }),
    ).toContainText("1.33.4");
    await expect(
      page.getByRole("button", { name: /Availability zone/ }),
    ).toContainText("ardctest-artm");
    await expect(
      page.getByRole("button", { name: /Network driver/ }),
    ).toContainText("calico");
  });

  test("says a missing template is not visible, with a way back", async ({
    page,
  }) => {
    await page.goto("/kubernetes/cluster-templates/nope");
    await expectPage(page, "Cluster template not found");
    await expect(main(page)).toContainText("visible to this project");
    await main(page)
      .getByRole("link", { name: "Back to cluster templates" })
      .click();
    await expectPage(page, "Cluster templates");
  });

  test("links a cluster to its template", async ({ page }) => {
    await page.goto("/kubernetes/clusters/c-1");
    await expect(
      main(page).getByRole("link", {
        name: "kubernetes-v1.33.4-ardctest-artm-calico-v5",
      }),
    ).toHaveAttribute("href", "/kubernetes/cluster-templates/t-133");
  });

  test("lists templates and opens one", async ({ page }) => {
    await page.goto("/kubernetes/cluster-templates");
    await table(page, "Cluster templates")
      .getByRole("link", { name: "kubernetes-v1.34.0-ardctest-artm-calico-v1" })
      .click();
    await expect(
      main(page).getByText("Control plane load balancer"),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });
});

test("keeps the clusters search when coming back to the list", async ({
  page,
}) => {
  await expectSearchSurvivesBack(page, {
    path: "/kubernetes/clusters",
    table: "Clusters",
    text: "samtest",
    link: "samtest1",
  });
});
