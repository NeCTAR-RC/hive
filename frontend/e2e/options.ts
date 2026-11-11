// The options the Hive fixture (fixtures.ts) adds to Playwright's `use`,
// kept apart so playwright.config.ts can type its projects with them
// without pulling the browser-side fixture code into the Node config.

export interface HiveOptions {
  /** Where the browser clock starts; null keeps the real clock (live runs). */
  clockStart: Date | null;
}
