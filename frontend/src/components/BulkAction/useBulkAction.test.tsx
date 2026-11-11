import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notify } from "../../lib/notify";
import { createTestQueryClient } from "../../test/queryClient";
import { DELETE } from "./messages";
import { useBulkAction } from "./useBulkAction";

vi.mock("../../lib/notify", () => ({
  notify: { success: vi.fn(), danger: vi.fn(), info: vi.fn() },
}));

interface Disk {
  id: string;
  name: string;
  locked: boolean;
}

const DISKS: Disk[] = [
  { id: "d1", name: "alpha", locked: false },
  { id: "d2", name: "beta", locked: false },
  { id: "d3", name: "gamma", locked: false },
];

const DISK_KEYS = (projectId: string) => ["disks", projectId];

/** A page with one batch delete, showing the rows the hook reselects. */
function Page({
  disks,
  request,
}: {
  disks: Disk[];
  request: (disk: Disk) => Promise<unknown>;
}) {
  const bulk = useBulkAction<Disk, "delete">({
    noun: { one: "disk", many: "disks" },
    name: (disk) => disk.name,
    getId: (disk) => disk.id,
    invalidates: [DISK_KEYS],
    actions: {
      delete: {
        verb: DELETE,
        request,
        eligible: (disk) => !disk.locked,
        body: <p>Deleted disks are gone.</p>,
      },
    },
  });
  return (
    <>
      <button type="button" onClick={() => bulk.run("delete", disks)}>
        Delete selected
      </button>
      <output>{bulk.tableProps.reselect?.join(",") ?? ""}</output>
      {bulk.dialog}
    </>
  );
}

function renderPage(
  client: QueryClient,
  disks: Disk[],
  request: (disk: Disk) => Promise<unknown>,
) {
  return render(
    <QueryClientProvider client={client}>
      <Page disks={disks} request={request} />
    </QueryClientProvider>,
  );
}

describe("useBulkAction", () => {
  let client: QueryClient;
  beforeEach(() => {
    vi.clearAllMocks();
    client = createTestQueryClient("p1");
  });

  it("sends every item, refetches once and keeps the failed row", async () => {
    const user = userEvent.setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const request = vi.fn((disk: Disk) =>
      disk.id === "d2"
        ? Promise.reject(new Error("the disk is in use"))
        : Promise.resolve(),
    );
    renderPage(client, DISKS, request);

    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(notify.danger).toHaveBeenCalledWith(
        "Could not delete 1 of 3 disks: the disk is in use",
      );
    });
    expect(request).toHaveBeenCalledTimes(3);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["disks", "p1"] });
    expect(notify.success).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("d2");
  });

  it("stays busy until the last request of the batch settles", async () => {
    const user = userEvent.setup();
    let finishLast: () => void = () => undefined;
    const request = (disk: Disk) =>
      disk.id === "d3"
        ? new Promise<void>((resolve) => {
            finishLast = resolve;
          })
        : Promise.resolve();
    renderPage(client, DISKS, request);

    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    // Pending, the same button keeps focus and ignores presses.
    const busy = await screen.findByRole("button", { name: /Working/ });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).toHaveFocus();

    finishLast();
    await waitFor(() => {
      expect(notify.success).toHaveBeenCalledWith("Deleted 3 disks.");
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names the rows it skips and sends only the eligible ones", async () => {
    const user = userEvent.setup();
    const request = vi.fn(() => Promise.resolve());
    const disks = [DISKS[0]!, { ...DISKS[1]!, locked: true }];
    renderPage(client, disks, request);

    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    const confirm = screen.getByRole("dialog", { name: "Delete disk alpha?" });
    expect(confirm).toHaveTextContent(
      "Skipped beta: not available in the current state.",
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(notify.success).toHaveBeenCalledWith("Deleted disk alpha.");
    });
    expect(request).toHaveBeenCalledOnce();
  });
});
