import type { BatchAction } from "./DataTable";
import type { RowAction } from "./RowActionsMenu";

/** The reason under a batch action none of the selected rows allows. */
export const BATCH_DISABLED_REASON = "Not available for the selected rows";

/** The "With selected" trigger's accessible name: its text and the count. */
export function batchTriggerLabel(count: number): string {
  return `With selected, ${count}`;
}

/**
 * The "With selected" menu's items: each batch action for `rows`, disabled
 * with a reason when its `isDisabled` says the selection rules it out, then
 * "Clear selection" in a section of its own. Running an action, or the
 * clear, ends with `clear`, so the selection is gone once the menu closes.
 */
export function batchMenuActions<T>(
  actions: readonly BatchAction<T>[],
  rows: T[],
  clear: () => void,
): RowAction[] {
  const items = actions.map((action): RowAction => {
    const isDisabled = action.isDisabled?.(rows) ?? false;
    return {
      id: action.id,
      label: action.label,
      tone: action.tone,
      isDisabled,
      disabledReason: isDisabled ? BATCH_DISABLED_REASON : undefined,
      onAction: () => {
        action.onAction(rows);
        clear();
      },
    };
  });
  return [
    ...items,
    {
      id: "clear-selection",
      label: "Clear selection",
      group: "Selection",
      onAction: clear,
    },
  ];
}
