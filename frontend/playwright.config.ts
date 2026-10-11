import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build with the API mocked in
// the browser by MSW (VITE_MOCK=1). The mock build goes to dist-mock so a
// mocked bundle can never be mistaken for the shipping one in dist/.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    // Toasts and dialogs settle instantly, so axe never samples a fade.
    reducedMotion: "reduce",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: {
    command:
      "VITE_MOCK=1 vite build --outDir dist-mock && vite preview --outDir dist-mock --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
