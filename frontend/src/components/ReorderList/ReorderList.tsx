// An ordered list the reader rearranges by dragging a row, with the pointer
// or from the keyboard: each row's drag handle lifts it on Enter or Space,
// the arrow keys move the drop point, and Enter drops it. React Aria owns
// the drag and drop and announces every move. The design system defers drag
// and drop (ruling 59), so this composes the React Aria primitives the
// design system itself builds on, drawn with Hive's tokens.
import {
  Button,
  DropIndicator,
  GridList,
  GridListItem,
  useDragAndDrop,
} from "react-aria-components";
import { reorderKeys } from "./reorder";
import styles from "./ReorderList.module.scss";

export interface ReorderItem {
  id: string;
  label: string;
}

function GripIcon() {
  // Two columns of three dots, the usual drag-handle glyph.
  return (
    <svg
      width="12"
      height="16"
      viewBox="0 0 12 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="3.5" cy="3" r="1.5" />
      <circle cx="8.5" cy="3" r="1.5" />
      <circle cx="3.5" cy="8" r="1.5" />
      <circle cx="8.5" cy="8" r="1.5" />
      <circle cx="3.5" cy="13" r="1.5" />
      <circle cx="8.5" cy="13" r="1.5" />
    </svg>
  );
}

export function ReorderList({
  items,
  onReorder,
  "aria-label": ariaLabel,
}: {
  items: ReorderItem[];
  /** Called with the ids in their new order. */
  onReorder: (ids: string[]) => void;
  "aria-label": string;
}) {
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) =>
      [...keys].map((key) => ({
        "text/plain": items.find((i) => i.id === key)?.label ?? String(key),
      })),
    onReorder: (event) =>
      onReorder(
        reorderKeys(
          items.map((i) => i.id),
          event.keys,
          event.target,
        ),
      ),
    renderDropIndicator: (target) => (
      <DropIndicator target={target} className={styles.dropIndicator} />
    ),
  });
  return (
    <GridList
      aria-label={ariaLabel}
      items={items}
      selectionMode="none"
      dragAndDropHooks={dragAndDropHooks}
      className={styles.list}
    >
      {(item) => (
        <GridListItem
          id={item.id}
          textValue={item.label}
          className={styles.item}
        >
          <Button slot="drag" className={styles.handle}>
            <GripIcon />
          </Button>
          <span className={styles.position} aria-hidden="true">
            {items.indexOf(item) + 1}
          </span>
          <span className={styles.label}>{item.label}</span>
        </GridListItem>
      )}
    </GridList>
  );
}
