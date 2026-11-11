/**
 * Controls that report themselves invalid: inputs carry `aria-invalid`, and
 * React Aria pickers (Select, Combobox, date fields) mark their wrapper with
 * `data-invalid` around the button or input the user focuses.
 */
const INVALID_CONTROLS = [
  '[aria-invalid="true"]',
  "[data-invalid] :is(input, textarea, button, [role='spinbutton'])",
].join(", ");

/**
 * The controls a user fills in: native fields, React Aria picker buttons
 * (a Select's trigger, a file input's button) and spin buttons.
 */
const FIELD_CONTROLS = "input, textarea, select, button, [role='spinbutton']";

/**
 * Whether the user can reach `element` with Tab: in the tab order, enabled
 * and not inside hidden content (such as React Aria's hidden native
 * select, which mirrors the visible picker).
 */
function isReachable(element: HTMLElement): boolean {
  return (
    element.tabIndex >= 0 &&
    !element.matches(":disabled") &&
    element.closest("[aria-hidden='true'], [hidden], [inert]") === null
  );
}

/** Focuses the first reachable match of `selector` in document order. */
function focusFirst(root: ParentNode, selector: string): boolean {
  const target = [...root.querySelectorAll<HTMLElement>(selector)].find(
    isReachable,
  );
  target?.focus();
  return target !== undefined;
}

/**
 * Moves focus to the first invalid control inside `root`, in document
 * order, so a keyboard or screen-reader user lands on the problem after a
 * failed submit instead of staying on the submit button. Returns whether
 * anything was focused.
 */
export function focusFirstInvalid(root: ParentNode): boolean {
  return focusFirst(root, INVALID_CONTROLS);
}

/**
 * Moves focus to the first control inside `root`, so a form that opens in
 * a dialog is ready to type into. Returns whether anything was focused.
 */
export function focusFirstField(root: ParentNode): boolean {
  return focusFirst(root, FIELD_CONTROLS);
}
