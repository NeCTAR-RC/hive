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
