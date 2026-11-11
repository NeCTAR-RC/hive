// Create-to-delete round trips against the real cloud, each on a scratch
// resource named hive-smoke-<time> that the test removes again, also when
// a step fails. Slow by nature: the cloud does the work.
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import {
  checkPage,
  closeButton,
  dialog,
  expectPage,
  expectToast,
  row,
  rowAction,
  table,
} from "../helpers";
import { getJson, postJson, remove, scratchName, waitUntil } from "./api";

test.describe.configure({ timeout: 10 * 60 * 1000 });

interface Stack {
  id: string;
  name: string;
  is_transitional: boolean;
}

/** Waits until Heat has finished the stack called `name`; returns its id. */
async function completedStackId(page: Page, name: string): Promise<string> {
  const stacks = await waitUntil<{ items: Stack[] }>(
    page,
    "/api/orchestration/stacks",
    (body) => body.items.some((s) => s.name === name && !s.is_transitional),
  );
  const stack = stacks.items.find((s) => s.name === name);
  if (!stack) throw new Error(`stack ${name} is gone`);
  return stack.id;
}

test("an application credential: created, shown once, deleted", async ({
  page,
}) => {
  const name = scratchName();
  await page.goto("/identity/application-credentials");
  await page
    .getByRole("button", { name: "Create application credential" })
    .click();
  const create = dialog(page, "Create application credential");
  await create.getByRole("textbox", { name: "Name" }).fill(name);
  await create
    .getByRole("button", { name: "Create application credential" })
    .click();
  const secret = dialog(page, "Application credential created");
  await expect(secret).toBeVisible({ timeout: 30_000 });
  await checkPage(page);
  await closeButton(secret).click();

  const credentials = table(page, "Application credentials");
  await credentials.getByRole("link", { name, exact: true }).click();
  await expectPage(page, name);
  await checkPage(page);
  await page.goBack();
  await rowAction(row(credentials, name), "Delete");
  await dialog(page, `Delete application credential ${name}?`)
    .getByRole("button", { name: "Delete" })
    .click();
  await expectToast(page, `Application credential ${name} deleted.`);
});

test.describe("a scratch container", () => {
  const container = scratchName();
  const objects = `/api/object-store/containers/${container}`;

  test.afterEach(async ({ page }) => {
    await postJson(page, `${objects}/delete`, {
      names: ["hello.txt", "uploads/"],
    }).catch(() => undefined);
    await remove(page, objects);
  });

  test("uploads through a signed URL, downloads and shows details", async ({
    page,
  }) => {
    await page.goto("/object-store/containers");
    await page.getByRole("button", { name: "Create container" }).click();
    const create = dialog(page, "Create container");
    await create
      .getByRole("textbox", { name: "Container name" })
      .fill(container);
    await create.getByRole("button", { name: "Create container" }).click();
    await expectToast(page, `Container ${container} created.`);

    await page.goto(`/object-store/containers/${container}`);
    await page.getByRole("button", { name: "Create folder" }).click();
    const folder = dialog(page, "Create folder");
    await folder.getByRole("textbox", { name: "Folder name" }).fill("uploads");
    await folder.getByRole("button", { name: "Create folder" }).click();
    await expectToast(page, "Folder uploads created.");

    await page.getByRole("button", { name: "Upload files" }).click();
    const upload = dialog(page, "Upload files");
    const chooser = page.waitForEvent("filechooser");
    await upload.getByRole("button", { name: "Choose files" }).click();
    await (
      await chooser
    ).setFiles({
      name: "hello.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello from the hive live run\n".repeat(40)),
    });
    await upload.getByRole("button", { name: /^Upload 1 file/ }).click();
    await expect(
      page
        .getByRole("region", { name: /notifications/i })
        .getByText("Uploaded hello.txt."),
    ).toBeVisible({ timeout: 60_000 });
    await closeButton(upload).click();

    const hello = row(table(page, "Objects"), "hello.txt");
    const download = page.waitForEvent("download");
    await rowAction(hello, "Download");
    expect((await download).suggestedFilename()).toBe("hello.txt");
    await rowAction(hello, "View details");
    await expect(dialog(page, "hello.txt")).toBeVisible();
    await checkPage(page);
  });
});

test.describe("a scratch stack", () => {
  const name = scratchName();
  const TEMPLATE = `heat_template_version: 2021-04-16
description: Hive live run, holds no cloud resources
resources:
  word:
    type: OS::Heat::RandomString
    properties:
      length: 8
outputs:
  value:
    description: The random string
    value: { get_attr: [word, value] }
`;

  test.afterEach(async ({ page }) => {
    const stacks = await getJson<{ items: Stack[] }>(
      page,
      "/api/orchestration/stacks",
    );
    for (const stack of stacks.items.filter((s) => s.name === name)) {
      await remove(page, `/api/orchestration/stacks/${stack.id}`);
    }
  });

  test("launches from a template, completes and shows its tabs", async ({
    page,
  }) => {
    await page.goto("/orchestration/stacks/new");
    await page
      .getByRole("textbox", { name: "Template", exact: true })
      .fill(TEMPLATE);
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("textbox", { name: "Stack name" }).fill(name);
    await checkPage(page);
    await page.getByRole("button", { name: "Launch" }).click();
    await expectToast(page, `Stack ${name} is being created.`);

    const id = await completedStackId(page, name);
    await page.goto(`/orchestration/stacks/${id}`);
    await expectPage(page, name);
    await checkPage(page);
    for (const tab of ["resources", "events", "template"]) {
      await page.goto(`/orchestration/stacks/${id}?tab=${tab}`);
      await checkPage(page);
    }
  });
});

test.describe("a scratch TXT record set", () => {
  const name = scratchName();

  interface Zone {
    id: string;
    name: string;
  }
  interface RecordSet {
    id: string;
    name: string;
    is_transitional: boolean;
  }

  test("is created on the first zone and shows there", async ({ page }) => {
    const zones = await getJson<{ items: Zone[] }>(page, "/api/dns/zones");
    test.skip(zones.items.length === 0, "this project has no DNS zone");
    const zone = zones.items[0] as Zone;
    const created = await postJson<RecordSet>(
      page,
      `/api/dns/zones/${zone.id}/recordsets`,
      { name, type: "TXT", records: ["hive live run"], ttl: 60 },
    );
    try {
      await waitUntil<{ items: RecordSet[] }>(
        page,
        `/api/dns/zones/${zone.id}/recordsets`,
        (body) =>
          body.items.some((r) => r.id === created.id && !r.is_transitional),
        120_000,
      );
      await page.goto(`/dns/zones/${zone.id}`);
      await expectPage(page, zone.name);
      await expect(
        table(page, "Record sets").getByText(`${name}.${zone.name}`),
      ).toBeVisible();
      await checkPage(page);
    } finally {
      await remove(page, `/api/dns/zones/${zone.id}/recordsets/${created.id}`);
    }
  });
});

test.describe("a scratch share", () => {
  const name = scratchName();

  interface ShareOptions {
    can_create: boolean;
    share_types: { name: string | null }[];
  }
  interface Share {
    id: string;
    status: string;
    is_transitional: boolean;
  }

  /** The CephFS share type rctest offers, as the old live script chose it. */
  function cephType(options: ShareOptions): string | null {
    const names = options.share_types.map((type) => type.name ?? "");
    return (
      names.find((type) => type === "cephfs_share_type") ??
      names.find((type) => type.includes("cephfs")) ??
      null
    );
  }

  test("is created in ardctest-artm, becomes available and is deleted", async ({
    page,
  }) => {
    const options = await getJson<ShareOptions>(page, "/api/shares/options");
    const shareType = cephType(options);
    test.skip(
      !options.can_create || shareType === null,
      "no CephFS share type here",
    );
    const share = await postJson<Share>(page, "/api/shares/shares", {
      name,
      protocol: "CephFS",
      size: 1,
      share_type: shareType,
      availability_zone: "ardctest-artm",
      metadata: "purpose=hive-smoke",
    });
    try {
      const ready = await waitUntil<Share>(
        page,
        `/api/shares/shares/${share.id}`,
        (body) => !body.is_transitional,
      );
      expect(ready.status).toBe("available");
      await page.goto(`/shares/shares/${share.id}`);
      await expectPage(page, name);
      await checkPage(page);
      await page.goto(`/shares/shares/${share.id}?tab=rules`);
      await checkPage(page);
    } finally {
      await remove(page, `/api/shares/shares/${share.id}`);
    }
  });
});
