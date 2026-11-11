// Deleting, releasing or removing one seeded resource of every type that
// has the action, from its list: the confirmation must name what is about
// to go and never ask for the name to be typed (Horizon never does), the
// row must leave the list, and keyboard focus must land in the table, not
// fall to the page body. Key pairs, objects, reservations and instance
// shut-off are covered with their panels.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { dialog, expectPage, main, row, rowAction, table } from "./helpers";

interface Destruction {
  /** What is being deleted, for the test title. */
  resource: string;
  /** The page holding the list. */
  path: string;
  /** The list's accessible name. */
  grid: string;
  /** The row: its row header's exact text, or a pattern over the row. */
  row: string | RegExp;
  /** The row menu's item. */
  item: string;
  /** The confirmation's title. */
  title: string;
  /** The confirmation's button. */
  button: string;
  /** Text naming the resource in the confirmation (default: the row). */
  names?: string;
}

const DESTRUCTIONS: Destruction[] = [
  {
    resource: "server group",
    path: "/compute/server-groups",
    grid: "Server groups",
    row: "web-tier",
    item: "Delete server group",
    title: "Delete server group web-tier?",
    button: "Delete",
  },
  {
    resource: "instance",
    path: "/compute/instances",
    grid: "Instances",
    row: "worker-1",
    item: "Delete instance",
    title: "Delete worker-1?",
    button: "Delete",
  },
  {
    resource: "image",
    path: "/compute/images",
    grid: "Images",
    row: "my-webserver-image",
    item: "Delete image",
    title: "Delete image my-webserver-image?",
    button: "Delete",
  },
  {
    resource: "volume",
    path: "/storage/volumes",
    grid: "Volumes",
    row: "boot-ubuntu",
    item: "Delete volume",
    title: "Delete volume boot-ubuntu?",
    button: "Delete",
  },
  {
    resource: "volume snapshot",
    path: "/storage/snapshots",
    grid: "Volume snapshots",
    row: "web-data-before-upgrade",
    item: "Delete snapshot",
    title: "Delete snapshot web-data-before-upgrade?",
    button: "Delete",
  },
  {
    resource: "volume backup",
    path: "/storage/backups",
    grid: "Volume backups",
    row: "web-data-nightly",
    item: "Delete backup",
    title: "Delete backup web-data-nightly?",
    button: "Delete",
  },
  {
    resource: "cluster",
    path: "/kubernetes/clusters",
    grid: "Clusters",
    row: "samtest1",
    item: "Delete cluster",
    title: "Delete cluster samtest1?",
    button: "Delete",
  },
  {
    resource: "subnet",
    path: "/network/networks/net-private?tab=subnets",
    grid: "Subnets",
    row: "private-subnet",
    item: "Delete subnet",
    title: "Delete subnet private-subnet?",
    button: "Delete",
  },
  {
    resource: "port",
    path: "/network/networks/net-private?tab=ports",
    grid: "Ports",
    row: "spare-port",
    item: "Delete port",
    title: "Delete port spare-port?",
    button: "Delete",
  },
  {
    resource: "router",
    path: "/network/routers",
    grid: "Routers",
    row: "backup",
    item: "Delete router",
    title: "Delete router backup?",
    button: "Delete",
  },
  {
    resource: "router interface",
    path: "/network/routers/r-1?tab=interfaces",
    grid: "Interfaces",
    row: "port-router-1",
    item: "Delete interface",
    title: "Delete interface 10.0.0.1?",
    button: "Delete",
    names: "10.0.0.1",
  },
  {
    resource: "security group",
    path: "/network/security-groups",
    grid: "Security groups",
    row: "web",
    item: "Delete security group",
    title: "Delete security group web?",
    button: "Delete",
  },
  {
    resource: "security group rule",
    path: "/network/security-groups/secgroup-web",
    grid: "Rules",
    row: /203\.0\.113\.0\/24/,
    item: "Delete rule",
    title: "Delete rule?",
    button: "Delete",
    names: "ingress TCP 22 from 203.0.113.0/24",
  },
  {
    resource: "floating IP",
    path: "/network/floating-ips",
    grid: "Floating IPs",
    row: /203\.0\.113\.101/,
    item: "Release floating IP",
    title: "Release floating IP 203.0.113.101?",
    button: "Release",
    names: "203.0.113.101",
  },
  {
    resource: "trunk",
    path: "/network/trunks",
    grid: "Trunks",
    row: "trunk-1",
    item: "Delete trunk",
    title: "Delete trunk trunk-1?",
    button: "Delete",
  },
  {
    resource: "load balancer",
    path: "/load-balancers",
    grid: "Load balancers",
    row: "web",
    item: "Delete load balancer",
    title: "Delete load balancer web?",
    button: "Delete",
  },
  {
    resource: "listener",
    path: "/load-balancers/lb-1?tab=listeners",
    grid: "Listeners",
    row: "http",
    item: "Delete listener",
    title: "Delete listener http?",
    button: "Delete",
  },
  {
    resource: "pool",
    path: "/load-balancers/lb-1?tab=pools",
    grid: "Pools",
    row: "web-pool",
    item: "Delete pool",
    title: "Delete pool web-pool?",
    button: "Delete",
  },
  {
    resource: "pool member",
    path: "/load-balancers/lb-1/pools/p-1",
    grid: "Members",
    row: /192\.168\.1\.20:80/,
    item: "Remove member",
    title: "Remove member 192.168.1.20:80?",
    button: "Remove",
    names: "192.168.1.20:80",
  },
  {
    resource: "container",
    path: "/object-store/containers",
    grid: "Containers",
    row: "backups",
    item: "Delete container",
    title: "Delete container backups?",
    button: "Delete",
  },
  {
    resource: "database instance",
    path: "/databases/instances",
    grid: "Database instances",
    row: "appdb",
    item: "Delete instance",
    title: "Delete database instance appdb?",
    button: "Delete",
  },
  {
    resource: "database backup",
    path: "/databases/backups",
    grid: "Database backups",
    row: "nightly",
    item: "Delete backup",
    title: "Delete backup nightly?",
    button: "Delete",
  },
  {
    resource: "configuration group",
    path: "/databases/configuration-groups",
    grid: "Configuration groups",
    row: "tuned",
    item: "Delete configuration group",
    title: "Delete configuration group tuned?",
    button: "Delete",
  },
  {
    resource: "stack",
    path: "/orchestration/stacks",
    grid: "Stacks",
    row: "web-tier",
    item: "Delete stack",
    title: "Delete stack web-tier?",
    button: "Delete",
  },
  {
    resource: "DNS zone",
    path: "/dns/zones",
    grid: "Zones",
    row: "example.org.",
    item: "Delete zone",
    title: "Delete zone example.org.?",
    button: "Delete",
  },
  {
    resource: "record set",
    path: "/dns/zones/zone-1",
    grid: "Record sets",
    row: "www.example.org.",
    item: "Delete record set",
    title: "Delete record set www.example.org.?",
    button: "Delete",
  },
  {
    resource: "share snapshot",
    path: "/shares/snapshots",
    grid: "Share snapshots",
    row: "datasets-snap",
    item: "Delete snapshot",
    title: "Delete snapshot datasets-snap?",
    button: "Delete",
  },
  {
    resource: "security service",
    path: "/shares/security-services",
    grid: "Security services",
    row: "corp-ad",
    item: "Delete security service",
    title: "Delete security service corp-ad?",
    button: "Delete",
  },
  {
    resource: "share group",
    path: "/shares/share-groups",
    grid: "Share groups",
    row: "group-a",
    item: "Delete share group",
    title: "Delete share group group-a?",
    button: "Delete",
  },
  {
    resource: "application credential",
    path: "/identity/application-credentials",
    grid: "Application credentials",
    row: "deploy-bot",
    item: "Delete",
    title: "Delete application credential deploy-bot?",
    button: "Delete",
  },
  {
    resource: "project member",
    path: "/members",
    grid: "Project members",
    row: /ann@example\.edu/,
    item: "Remove",
    title: "Remove ann@example.edu as member?",
    button: "Remove",
    names: "ann@example.edu",
  },
];

/** The text that names the resource in its confirmation. */
function namedAs(destruction: Destruction): string {
  return destruction.names ?? String(destruction.row);
}

/**
 * Whether keyboard focus sits in the table named `grid` (on the table or one
 * of its rows) or on the page heading, rather than on the page body.
 */
function focusInTableOrHeading(page: Page, grid: string): Promise<boolean> {
  return page.evaluate((name) => {
    const active = document.activeElement;
    if (!active || active === document.body) return false;
    if (active.tagName === "H1") return true;
    const table = active.closest('[role="grid"]');
    return table?.getAttribute("aria-label") === name;
  }, grid);
}

test.describe("destructive actions", () => {
  for (const destruction of DESTRUCTIONS) {
    test(`${destruction.resource}: confirms by name, then leaves the list`, async ({
      page,
    }) => {
      await page.goto(destruction.path);
      const target = row(table(page, destruction.grid), destruction.row);
      await rowAction(target, destruction.item);
      const confirmation = dialog(page, destruction.title);
      await expect(confirmation).toContainText(namedAs(destruction));
      await expect(confirmation.getByRole("textbox")).toHaveCount(0);
      await confirmation
        .getByRole("button", { name: destruction.button, exact: true })
        .click();
      await expect(confirmation).toHaveCount(0);
      await expect(target).toHaveCount(0);
      await expect
        .poll(() => focusInTableOrHeading(page, destruction.grid))
        .toBe(true);
    });
  }
});

interface DetailDeletion {
  resource: string;
  /** The detail page. */
  path: string;
  /** The detail page's heading: the resource's name. */
  name: string;
  /** Opens the confirmation from the page header. */
  open: (page: Page) => Promise<void>;
  title: string;
  /** The list the page returns to after the delete. */
  list: string;
}

/** Presses a button in the detail page's header. */
async function pressHeaderButton(page: Page, name: string) {
  await main(page).getByRole("button", { name, exact: true }).click();
}

/** Picks an item of the detail page's "Actions" menu. */
async function pickHeaderAction(page: Page, item: string) {
  await main(page).getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

// The detail pages that used to ask for the name to be typed.
const DETAIL_DELETIONS: DetailDeletion[] = [
  {
    resource: "cluster",
    path: "/kubernetes/clusters/c-1",
    name: "samtest1",
    open: (page) => pressHeaderButton(page, "Delete"),
    title: "Delete cluster samtest1?",
    list: "Clusters",
  },
  {
    resource: "database instance",
    path: "/databases/instances/db-1",
    name: "appdb",
    open: (page) => pressHeaderButton(page, "Delete"),
    title: "Delete database instance appdb?",
    list: "Database instances",
  },
  {
    resource: "stack",
    path: "/orchestration/stacks/stack-1",
    name: "web-tier",
    open: (page) => pressHeaderButton(page, "Delete"),
    title: "Delete stack web-tier?",
    list: "Stacks",
  },
  {
    resource: "DNS zone",
    path: "/dns/zones/zone-1",
    name: "example.org.",
    open: (page) => pressHeaderButton(page, "Delete zone"),
    title: "Delete zone example.org.?",
    list: "Zones",
  },
  {
    resource: "share",
    path: "/shares/shares/share-1",
    name: "datasets",
    open: (page) => pickHeaderAction(page, "Delete share"),
    title: "Delete share datasets?",
    list: "Shares",
  },
  {
    resource: "application credential",
    path: "/identity/application-credentials/ac-1",
    name: "deploy-bot",
    open: (page) => pickHeaderAction(page, "Delete"),
    title: "Delete application credential deploy-bot?",
    list: "Application credentials",
  },
];

test.describe("deletes from a detail page", () => {
  for (const deletion of DETAIL_DELETIONS) {
    test(`${deletion.resource}: confirms without a typed name`, async ({
      page,
    }) => {
      await page.goto(deletion.path);
      await expectPage(page, deletion.name);
      await deletion.open(page);
      const confirmation = dialog(page, deletion.title);
      await expect(confirmation.getByRole("textbox")).toHaveCount(0);
      const confirm = confirmation.getByRole("button", {
        name: "Delete",
        exact: true,
      });
      await expect(confirm).toBeEnabled();
      await confirm.click();
      await expectPage(page, deletion.list);
    });
  }
});
