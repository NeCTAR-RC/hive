import { useEffect, useRef } from "react";
import {
  Button,
  DropIndicator,
  GridList,
  GridListItem,
  useDragAndDrop,
} from "react-aria-components";
import { reorderKeys } from "./reorder";
import styles from "./ReorderList.module.scss";

/**
 * How long after the new order appears focus is restored: past the 50ms in
 * which React Aria moves focus itself after a drop.
 */
const FOCUS_AFTER_DROP_MS = 100;

/** One row of a `ReorderList`. */
export interface ReorderItem {
  id: string;
  label: string;
}

/** The drag handle's glyph: two columns of three dots. */
function GripIcon() {
  return (
    <svg
      className={styles.grip}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="5.5" cy="3" r="1.5" />
      <circle cx="10.5" cy="3" r="1.5" />
      <circle cx="5.5" cy="8" r="1.5" />
      <circle cx="10.5" cy="8" r="1.5" />
      <circle cx="5.5" cy="13" r="1.5" />
      <circle cx="10.5" cy="13" r="1.5" />
    </svg>
  );
}

/**
 * An ordered list the user rearranges by dragging a row, with the pointer
 * or the keyboard: Enter or Space on a row's handle lifts it, the arrow
 * keys move the drop point, Enter drops it and Escape cancels. React Aria's
 * `GridList` and `useDragAndDrop` own the interaction and announce every
 * move; the design system has no drag and drop (gap "Reorderable list").
 * Each row shows its position, so the order reads without dragging.
 * `onReorder` gets every id in the new order; the caller owns the list.
 */
export function ReorderList({
  items,
  onReorder,
  "aria-label": ariaLabel,
}: {
  items: ReorderItem[];
  onReorder: (ids: string[]) => void;
  "aria-label": string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const moved = useRef<string | null>(null);
  const ids = items.map((item) => item.id);
  const order = items.map((item) => `${item.id}:${item.label}`).join("\n");

  // A keyboard drop removes the focused drop point and leaves focus on the
  // page body. Once the new order is on screen, and React Aria's own focus
  // update after a drop (a 50ms window) is over, focus goes back to the
  // moved row, so the user carries on from where the row now is. Focus on a
  // control outside the list is left alone.
  useEffect(() => {
    const key = moved.current;
    if (key === null) return;
    moved.current = null;
    const timer = setTimeout(() => {
      const list = listRef.current;
      const active = document.activeElement;
      if (!list || (active !== document.body && !list.contains(active))) return;
      list
        .querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)
        ?.focus();
    }, FOCUS_AFTER_DROP_MS);
    return () => clearTimeout(timer);
  }, [order]);

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) =>
      [...keys].map((key) => ({
        "text/plain": items.find((i) => i.id === key)?.label ?? String(key),
      })),
    onReorder: (event) => {
      const next = reorderKeys(ids, event.keys, event.target);
      // A drop that leaves the order as it was has nothing to focus.
      if (next.join("\n") === ids.join("\n")) return;
      moved.current = String([...event.keys][0]);
      onReorder(next);
    },
    renderDropIndicator: (target) => (
      <DropIndicator target={target} className={styles.dropIndicator} />
    ),
  });
  return (
    <GridList
      ref={listRef}
      aria-label={ariaLabel}
      items={items}
      // A row's position number is read from `items`, outside the row's
      // own item, so every row renders again when the order changes.
      dependencies={[order]}
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
