// The only module that touches the design system's Toast API (which sits on
// React Aria's unstable toast surface). Features call `notify.*`; the
// region is mounted once in app/providers.tsx.
import { createToastQueue } from "@ardc-ui/react";
import type { AlertTone } from "@ardc-ui/react";

export const toasts = createToastQueue();

interface NotifyOptions {
  title?: string;
  /** Milliseconds before auto-dismiss; omit to stay until dismissed. */
  timeout?: number;
}

function push(tone: AlertTone, description: string, options?: NotifyOptions) {
  const content = options?.title
    ? { tone, description, title: options.title }
    : { tone, description };
  return toasts.add(
    content,
    options?.timeout ? { timeout: options.timeout } : undefined,
  );
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
