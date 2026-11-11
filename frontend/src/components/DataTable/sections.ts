/** An item that may name the menu section it belongs to. */
export interface Grouped {
  group?: string | undefined;
}

/** A run of neighbouring items of one group, as one menu section. */
export interface Section<T extends Grouped> {
  /** The group's name, or undefined for items that name none. */
  group: string | undefined;
  items: T[];
}

/**
 * Splits a menu's items into sections: each run of neighbouring items with
 * the same group is one section, in the items' order. Items without a group
 * form sections of their own the same way, so a menu without groups is a
 * single section.
 */
export function menuSections<T extends Grouped>(
  items: readonly T[],
): Section<T>[] {
  const sections: Section<T>[] = [];
  for (const item of items) {
    const last = sections.at(-1);
    if (last && last.group === item.group) last.items.push(item);
    else sections.push({ group: item.group, items: [item] });
  }
  return sections;
}
