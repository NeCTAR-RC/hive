import "@testing-library/jest-dom/vitest";

// The DOM types declare these, but jsdom does not implement them.
const dom: Partial<Pick<typeof window, "matchMedia" | "ResizeObserver">> =
  window;

// jsdom has no matchMedia; components only need a non-matching stub.
if (!dom.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom has no ResizeObserver; the library's dropdowns (Select, Combobox)
// observe their list to draw a scrollbar thumb, which tests never look at.
if (!dom.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
