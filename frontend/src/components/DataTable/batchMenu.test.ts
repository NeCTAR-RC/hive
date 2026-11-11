import { describe, expect, it, vi } from "vitest";
import {
  BATCH_DISABLED_REASON,
  batchMenuActions,
  batchTriggerLabel,
} from "./batchMenu";

describe("batchMenuActions", () => {
  const rows = ["a", "b"];

  it("lists the actions, then Clear selection in a section of its own", () => {
    const items = batchMenuActions(
      [
        { id: "start", label: "Start", onAction: vi.fn() },
        { id: "delete", label: "Delete", tone: "danger", onAction: vi.fn() },
      ],
      rows,
      vi.fn(),
    );
    expect(items.map((item) => [item.id, item.group])).toStrictEqual([
      ["start", undefined],
      ["delete", undefined],
      ["clear-selection", "Selection"],
    ]);
    expect(items[1]?.tone).toBe("danger");
  });

  it("disables an action the selection rules out, with the reason", () => {
    const isDisabled = vi.fn(() => true);
    const [start] = batchMenuActions(
      [{ id: "start", label: "Start", onAction: vi.fn(), isDisabled }],
      rows,
      vi.fn(),
    );
    expect(isDisabled).toHaveBeenCalledWith(rows);
    expect(start?.isDisabled).toBe(true);
    expect(start?.disabledReason).toBe(BATCH_DISABLED_REASON);
  });

  it("gives an available action no reason", () => {
    const [start] = batchMenuActions(
      [
        {
          id: "start",
          label: "Start",
          onAction: vi.fn(),
          isDisabled: () => false,
        },
      ],
      rows,
      vi.fn(),
    );
    expect(start?.isDisabled).toBe(false);
    expect(start?.disabledReason).toBeUndefined();
  });

  it("runs an action on the rows, then clears the selection", () => {
    const calls: string[] = [];
    const [start, clearItem] = batchMenuActions(
      [
        {
          id: "start",
          label: "Start",
          onAction: (selected) => calls.push(`start ${selected.join(",")}`),
        },
      ],
      rows,
      () => calls.push("clear"),
    );
    start?.onAction();
    clearItem?.onAction();
    expect(calls).toStrictEqual(["start a,b", "clear", "clear"]);
  });
});

describe("batchTriggerLabel", () => {
  it("names the count after the trigger's text", () => {
    expect(batchTriggerLabel(3)).toBe("With selected, 3");
  });
});
