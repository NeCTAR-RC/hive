// Test-only: jsdom has no ResizeObserver, and the design system's overlay
// scrollbar (Modal, Menu, Combobox, Select popovers) needs one to mount.
// Better moved into src/test/setup.ts; kept here until it is.
export function stubResizeObserver(): void {
  if (typeof globalThis.ResizeObserver !== "undefined") return;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
