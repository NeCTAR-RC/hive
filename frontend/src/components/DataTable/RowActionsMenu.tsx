import { ActionsMenu } from "./ActionsMenu";

export interface RowAction {
  id: string;
  label: string;
  onAction: () => void;
  isDisabled?: boolean;
  disabledReason?: string;
  /**
   * Marks a destructive action. The library `Menu` has no danger row yet (a
   * gap in DESIGN-NOTES.md), so the menu does not draw it; the action's
   * confirmation dialog carries the danger tone.
   */
  tone?: "danger";
  /**
   * The menu section the action sits in, named for screen readers;
   * neighbouring actions of one group form a section (see `menuSections`).
   */
  group?: string | undefined;
}

/**
 * A row's "Actions" button and its menu (`ActionsMenu`): every action the
 * row offers, a disabled one with its reason. Renders nothing for a row
 * without actions.
 */
export function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  if (actions.length === 0) return null;
  return (
    <ActionsMenu label="Actions" menuLabel="Row actions" actions={actions} />
  );
}
