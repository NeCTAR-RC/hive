/**
 * The window never scrolls (see `global.scss`): each layout scrolls its own
 * content column, and the docked sidebar scrolls on its own beside it. The
 * columns carry these TanStack Router scroll restoration ids, so their
 * positions are saved under a stable key and restored on Back.
 */
export const SCROLL_IDS = {
  /** The page and the footer under it, in either layout. */
  content: "content",
  /** The docked sidebar. */
  sidebar: "sidebar",
} as const;

/**
 * The column a new navigation starts at the top of (the router's
 * `scrollToTopSelectors`). The sidebar keeps its place across pages.
 */
export const CONTENT_SCROLL_SELECTOR = `[data-scroll-restoration-id="${SCROLL_IDS.content}"]`;
