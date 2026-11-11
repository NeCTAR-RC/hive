// Which page each lasting toast belongs to. A toast without a timeout (an
// error, a warning, a note) stays until dismissed, but only while the user
// is on the page that raised it: moving to another page closes it, so an
// error about a network does not follow the user through every panel.
// Toasts with a timeout (successes) are never tracked.

/** The pages of the lasting toasts on screen, by toast key. */
export interface PageToasts {
  /** Records a lasting toast raised on the page at `path`. */
  raised: (key: string, path: string) => void;
  /** Forgets a toast that has closed. */
  closed: (key: string) => void;
  /**
   * The keys of the toasts raised on another page than `path`, the page
   * just opened; they are forgotten, and the caller closes them.
   */
  leftBehind: (path: string) => string[];
}

export function createPageToasts(): PageToasts {
  const pages = new Map<string, string>();
  return {
    raised: (key, path) => {
      pages.set(key, path);
    },
    closed: (key) => {
      pages.delete(key);
    },
    leftBehind: (path) => {
      const keys = [...pages]
        .filter(([, page]) => page !== path)
        .map(([key]) => key);
      for (const key of keys) pages.delete(key);
      return keys;
    },
  };
}
