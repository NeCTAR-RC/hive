/**
 * The library `Button` takes `state` and `loadingText` together or not at
 * all (a union its types enforce), so a conditional spread needs this shape.
 */
export type ButtonLoadingProps =
  | { state: "loading"; loadingText: string }
  | { state?: never; loadingText?: never };

/**
 * The loading state for one button that stays in place while its action
 * runs: spread it on the button instead of swapping in a disabled copy. The
 * library sets React Aria's `isPending` from it, which keeps the button
 * focusable (a disabled button drops keyboard focus to the page), ignores
 * presses and stops a submit button submitting its form again.
 */
export function loadingProps(
  isPending: boolean,
  loadingText: string,
): ButtonLoadingProps {
  return isPending ? { state: "loading", loadingText } : {};
}
