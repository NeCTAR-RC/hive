// The DS Button takes `state` and `loadingText` together or not at all (a
// union its types enforce), so a conditional spread needs this shape. Use
// with `isPending`, which keeps the one button focusable while it works.
export type ButtonLoadingProps =
  | { state: "loading"; loadingText: string }
  | { state?: never; loadingText?: never };

export function loadingProps(
  isPending: boolean,
  loadingText: string,
): ButtonLoadingProps {
  return isPending ? { state: "loading", loadingText } : {};
}
