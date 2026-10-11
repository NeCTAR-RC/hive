import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tanstackQuery from "@tanstack/eslint-plugin-query";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";

export default defineConfig([
  globalIgnores([
    "dist",
    "dist-mock",
    "coverage",
    "playwright-report",
    "test-results",
    "storybook-static",
    "public/mockServiceWorker.js",
    "src/lib/api/schema.d.ts",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
      ...tanstackQuery.configs["flat/recommended"],
      eslintConfigPrettier,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
  {
    // Route and registry modules export data alongside components.
    files: [
      "src/app/**/*.tsx",
      "src/shell/navigation/**/*.ts",
      "src/**/routes.tsx",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
]);
