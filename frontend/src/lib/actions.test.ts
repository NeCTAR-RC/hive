import { describe, expect, it, vi } from "vitest";
import {
  allows,
  offerActions,
  toRowActions,
  type ActionOffer,
  type ActionTable,
} from "./actions";

interface Disk {
  status: string;
  locked: boolean;
  shared: boolean;
}

type DiskAction = "edit" | "extend" | "forward" | "delete";

const TABLE: ActionTable<DiskAction, Disk, { forwarding: boolean }> = {
  statusOf: (disk) => disk.status,
  statusLabel: (disk) => disk.status.toUpperCase(),
  guard: (disk, id) =>
    disk.status === "deleting" && id !== "delete" && "The disk is going",
  rules: [
    { id: "edit", label: "Edit disk" },
    { id: "extend", label: "Extend disk", statuses: ["available"] },
    {
      id: "forward",
      label: (disk) => (disk.locked ? "Forward locked disk" : "Forward disk"),
      offered: (context) => context.forwarding,
    },
    {
      id: "delete",
      label: "Delete disk",
      tone: "danger",
      statuses: ["available", "deleting"],
      checks: [
        (disk) => disk.locked && "Unlock the disk first",
        (disk) => disk.shared && "Unshare the disk first",
      ],
    },
  ],
};

const FORWARDING = { forwarding: true };

const disk = (overrides: Partial<Disk> = {}): Disk => ({
  status: "available",
  locked: false,
  shared: false,
  ...overrides,
});

/** "id" for an enabled offer, "id: reason" for a disabled one. */
const summary = (offers: ActionOffer<string>[]) =>
  offers.map((o) => (o.isDisabled ? `${o.id}: ${o.disabledReason}` : o.id));

describe("offerActions", () => {
  it("offers every rule in the table's order", () => {
    const offers = offerActions(TABLE, disk(), FORWARDING);
    expect(summary(offers)).toEqual(["edit", "extend", "forward", "delete"]);
    expect(offers.find((o) => o.id === "delete")?.tone).toBe("danger");
    expect(offers.find((o) => o.id === "edit")).not.toHaveProperty("tone");
  });

  it("disables, never hides, an action the status rules out", () => {
    expect(
      summary(offerActions(TABLE, disk({ status: "in-use" }), FORWARDING)),
    ).toEqual([
      "edit",
      "extend: Not available while the status is IN-USE",
      "forward",
      "delete: Not available while the status is IN-USE",
    ]);
  });

  it("gives the first failing check's reason", () => {
    const offers = offerActions(
      TABLE,
      disk({ locked: true, shared: true }),
      FORWARDING,
    );
    expect(summary(offers).at(-1)).toBe("delete: Unlock the disk first");
    expect(
      summary(offerActions(TABLE, disk({ shared: true }), FORWARDING)).at(-1),
    ).toBe("delete: Unshare the disk first");
  });

  it("runs the guard first and lets it spare an action", () => {
    expect(
      summary(offerActions(TABLE, disk({ status: "deleting" }), FORWARDING)),
    ).toEqual([
      "edit: The disk is going",
      "extend: The disk is going",
      "forward: The disk is going",
      "delete",
    ]);
  });

  it("leaves out only an action the cloud does not offer", () => {
    const offers = offerActions(TABLE, disk(), { forwarding: false });
    expect(offers.map((o) => o.id)).toEqual(["edit", "extend", "delete"]);
  });

  it("labels an action from the item", () => {
    const offers = offerActions(TABLE, disk({ locked: true }), FORWARDING);
    expect(offers.find((o) => o.id === "forward")?.label).toBe(
      "Forward locked disk",
    );
  });

  it("words a status rule without a status as the current state", () => {
    const bare: ActionTable<"extend", Disk> = {
      rules: [{ id: "extend", label: "Extend", statuses: ["available"] }],
    };
    expect(summary(offerActions(bare, disk()))).toEqual([
      "extend: Not available in the current state",
    ]);
  });
});

describe("allows", () => {
  it("is true only for an offered, enabled action", () => {
    const offers = offerActions(TABLE, disk({ locked: true }), FORWARDING);
    expect(allows(offers, "edit")).toBe(true);
    expect(allows(offers, "delete")).toBe(false);
    expect(
      allows(offerActions(TABLE, disk(), { forwarding: false }), "forward"),
    ).toBe(false);
  });
});

describe("toRowActions", () => {
  it("keeps each offer's fields and runs its id", () => {
    const run = vi.fn();
    const actions = toRowActions(
      offerActions(TABLE, disk({ status: "in-use" }), FORWARDING),
      run,
    );
    expect(
      actions.map(({ id, label, tone, isDisabled, disabledReason }) => ({
        id,
        label,
        tone,
        isDisabled,
        disabledReason,
      })),
    ).toEqual([
      {
        id: "edit",
        label: "Edit disk",
        tone: undefined,
        isDisabled: false,
        disabledReason: undefined,
      },
      {
        id: "extend",
        label: "Extend disk",
        tone: undefined,
        isDisabled: true,
        disabledReason: "Not available while the status is IN-USE",
      },
      {
        id: "forward",
        label: "Forward disk",
        tone: undefined,
        isDisabled: false,
        disabledReason: undefined,
      },
      {
        id: "delete",
        label: "Delete disk",
        tone: "danger",
        isDisabled: true,
        disabledReason: "Not available while the status is IN-USE",
      },
    ]);
    actions[2]?.onAction();
    expect(run).toHaveBeenCalledWith("forward");
  });
});
