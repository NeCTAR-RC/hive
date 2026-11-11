import { Fragment } from "react";
import {
  Button,
  Menu,
  MenuItem,
  MenuSection,
  MenuSeparator,
  MenuTrigger,
} from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import { Text } from "react-aria-components";
import styles from "./DataTable.module.scss";
import type { RowAction } from "./RowActionsMenu";
import { menuSections } from "./sections";

/** One action's row; a disabled one carries its reason as a description. */
function ActionItem({ action }: { action: RowAction }) {
  return (
    <MenuItem id={action.id} textValue={action.label}>
      {action.isDisabled && action.disabledReason ? (
        <span className={styles.disabledAction}>
          <Text slot="label">{action.label}</Text>
          <Text slot="description" className={styles.reason}>
            {action.disabledReason}
          </Text>
        </span>
      ) : (
        action.label
      )}
    </MenuItem>
  );
}

export interface ActionsMenuProps {
  /** The trigger's visible text ("Actions", "With selected"). */
  label: string;
  /** The trigger's accessible name when it says more than `label`. */
  triggerLabel?: string;
  /** The menu's accessible name. */
  menuLabel: string;
  /** Disables the trigger, so the menu cannot open. */
  isDisabled?: boolean;
  actions: RowAction[];
}

/**
 * A secondary extra small library `Button` that opens a library `Menu` of
 * actions, both as shipped. A disabled action can say why: the reason sits
 * under its label as the item's description, so screen readers hear it with
 * the item. Actions that name groups are drawn as the library's sections, a
 * line between each, so a long menu reads in parts (power, network, delete).
 * A row's "Actions" menu and the table's "With selected" menu are both this.
 */
export function ActionsMenu({
  label,
  triggerLabel,
  menuLabel,
  isDisabled,
  actions,
}: ActionsMenuProps) {
  const onAction = (key: Key) => {
    actions.find((action) => action.id === key)?.onAction();
  };
  const disabledKeys = actions
    .filter((action) => action.isDisabled)
    .map((action) => action.id);
  const sections = menuSections(actions);
  return (
    <MenuTrigger>
      <Button
        variant="secondary"
        size="xs"
        isDisabled={isDisabled}
        aria-label={triggerLabel}
      >
        {label}
      </Button>
      <Menu
        aria-label={menuLabel}
        onAction={onAction}
        disabledKeys={disabledKeys}
        placement="bottom end"
      >
        {sections.length === 1
          ? actions.map((action) => (
              <ActionItem key={action.id} action={action} />
            ))
          : sections.map((section, index) => (
              <Fragment key={section.items[0]?.id}>
                {index > 0 && <MenuSeparator />}
                <MenuSection aria-label={section.group}>
                  {section.items.map((action) => (
                    <ActionItem key={action.id} action={action} />
                  ))}
                </MenuSection>
              </Fragment>
            ))}
      </Menu>
    </MenuTrigger>
  );
}
