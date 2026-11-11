// The only module that touches the design system's Toast API (which sits on
// React Aria's unstable toast surface). Features call `notify.*`; the
// region is mounted once in app/providers.tsx, and the shell tells the
// notifier when the user moves to another page (`leavePage`).
import { createToastQueue } from "@ardc-ui/react";
import type { AlertTone } from "@ardc-ui/react";
import { createPageToasts } from "./pageToasts";

export const toasts = createToastQueue();

/** The lasting toasts and the pages they belong to. */
const pageToasts = createPageToasts();

interface NotifyOptions {
  title?: string;
  /**
   * Milliseconds before auto-dismiss. Without one the toast stays until it
   * is dismissed or the user moves to another page.
   */
  timeout?: number;
}

function push(tone: AlertTone, description: string, options?: NotifyOptions) {
  const content = options?.title
    ? { tone, description, title: options.title }
    : { tone, description };
  if (options?.timeout) {
    return toasts.add(content, { timeout: options.timeout });
  }
  const key = toasts.add(content, {
    onClose: () => pageToasts.closed(key),
  });
  pageToasts.raised(key, window.location.pathname);
  return key;
}

export const notify = {
  info: (description: string, options?: NotifyOptions) =>
    push("info", description, options),
  success: (description: string, options?: NotifyOptions) =>
    push("success", description, { timeout: 6000, ...options }),
  warning: (description: string, options?: NotifyOptions) =>
    push("warning", description, options),
  danger: (description: string, options?: NotifyOptions) =>
    push("danger", description, options),
};

/**
 * Closes the lasting toasts raised on other pages than `pathname`, the
 * page the user has just moved to. The shell calls it after every
 * navigation that changes the path; a change of tab or search keeps them.
 */
export function leavePage(pathname: string) {
  for (const key of pageToasts.leftBehind(pathname)) toasts.close(key);
}
