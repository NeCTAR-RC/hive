import type { Key } from "react-aria-components";

export interface DropTargetLike {
  key: Key;
  dropPosition: "before" | "after" | "on";
}

/**
 * The ids in their order after a drop, as React Aria reports it: the moved
 * keys land before or after the target, keeping their own relative order. A
 * drop onto one of the moved items, or onto an unknown target, changes
 * nothing.
 */
export function reorderKeys(
  ids: readonly string[],
  moved: Set<Key>,
  target: DropTargetLike,
): string[] {
  const picked = ids.filter((id) => moved.has(id));
  if (picked.length === 0 || moved.has(target.key)) return [...ids];
  const rest = ids.filter((id) => !moved.has(id));
  const at = rest.indexOf(String(target.key));
  if (at < 0) return [...ids];
  const index = target.dropPosition === "after" ? at + 1 : at;
  return [...rest.slice(0, index), ...picked, ...rest.slice(index)];
}
