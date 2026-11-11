import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// Pinned so date formatting is the same on every machine and in CI; set
// here, before the test workers start, because they inherit it.
process.env.TZ = "Australia/Melbourne";

/**
 * Logic tests that still need a browser API: the API client reads the CSRF
 * cookie and drives XMLHttpRequest, the download helpers and the script
 * loaders work on the document, the banner parser uses DOMParser, and the
 * mocks' contract test needs `location`, against which MSW resolves the
 * handlers' relative paths.
 */
const LOGIC_TESTS_NEEDING_A_DOM = [
  "src/lib/api/*.test.ts",
  "src/lib/download.test.ts",
  "src/lib/extras.test.ts",
  "src/shell/megamenu.test.ts",
  "src/features/home/banner.test.ts",
  "src/mocks/contract.test.ts",
];

// Two projects: pure logic (`*.test.ts`) runs in plain Node, which starts in
// a fraction of jsdom's time; components (`*.test.tsx`) and the few logic
// tests listed above get jsdom. A `.test.ts` failing with "document is not
// defined" belongs in that list.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      css: { modules: { classNameStrategy: "non-scoped" } },
      // The design system ships plain CSS imports; let Vite transform it.
      server: { deps: { inline: ["@ardc-ui/react"] } },
      projects: [
        {
          extends: true,
          test: {
            name: "logic",
            environment: "node",
            include: ["src/**/*.test.ts"],
            exclude: LOGIC_TESTS_NEEDING_A_DOM,
          },
        },
        {
          extends: true,
          test: {
            name: "dom",
            environment: "jsdom",
            include: ["src/**/*.test.tsx", ...LOGIC_TESTS_NEEDING_A_DOM],
            setupFiles: ["./src/test/setup.ts"],
          },
        },
      ],
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "lcov"],
        reportsDirectory: "./coverage",
        // A ratchet for `pnpm test:coverage`: a point under the coverage
        // measured on 2026-10-22 (statements 32.8, branches 32.3, functions
        // 23.2, lines 31.4). Raise it as tests are added; never lower it.
        thresholds: {
          statements: 31,
          branches: 31,
          functions: 22,
          lines: 30,
        },
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/**/*.test.{ts,tsx}",
          "src/**/*.stories.tsx",
          "src/test/**",
          "src/mocks/**",
          "src/vite-env.d.ts",
          "src/main.tsx",
        ],
      },
    },
  }),
);
