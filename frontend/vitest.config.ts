import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      css: { modules: { classNameStrategy: "non-scoped" } },
      // The design system ships plain CSS imports; let Vite transform it.
      server: { deps: { inline: ["@ardc-ui/react"] } },
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "lcov"],
        reportsDirectory: "./coverage",
        // The level measured in October 2026 (12.4% statements, 7.7%
        // branches, 7.3% functions, 12.2% lines), floored: a ratchet so
        // coverage cannot fall. Raise it as panels gain tests.
        thresholds: {
          statements: 12,
          branches: 7,
          functions: 7,
          lines: 12,
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
