import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tanstackQuery from "@tanstack/eslint-plugin-query";
import playwright from "eslint-plugin-playwright";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";

// Rules that need type information, beyond recommendedTypeChecked.
const TYPED_RULES = {
  "@typescript-eslint/no-unnecessary-condition": "error",
  "@typescript-eslint/switch-exhaustiveness-check": [
    "error",
    { considerDefaultExhaustiveForUnions: true },
  ],
  // TanStack Router redirects and MSW replies are thrown Responses by design.
  "@typescript-eslint/only-throw-error": [
    "error",
    {
      allow: [
        { from: "lib", name: "Response" },
        { from: "package", package: "msw", name: "HttpResponse" },
      ],
    },
  ],
};

// Findings in code other changes own (the form kit and the shell rewrite).
// Warnings until those land, then errors like everywhere else; the counts
// are in the change that introduced them.
const NOT_YET_ERRORS = {
  features: [
    "@typescript-eslint/no-misused-promises",
    "@typescript-eslint/no-unnecessary-condition",
    "@typescript-eslint/no-base-to-string",
    "@typescript-eslint/no-unnecessary-type-assertion",
    "@typescript-eslint/no-unsafe-member-access",
  ],
  shell: [
    "@typescript-eslint/no-unnecessary-condition",
    "@typescript-eslint/no-duplicate-type-constituents",
  ],
};

/** The same rules, reported as warnings. */
function asWarnings(rules) {
  return Object.fromEntries(rules.map((rule) => [rule, "warn"]));
}

// Where each layer may import from. Shared code (lib, components) never
// reaches up into the features or the shell, and features never import the
// app's assembly (pages read route state with getRouteApi); a feature
// group's routes.tsx imports only the layout routes it hangs on.
const FEATURES_AND_SHELL = {
  group: ["**/features/**", "**/shell/**"],
  message:
    "Shared code (lib, components) must not import features or the shell.",
};
const APP = {
  group: ["**/app/**"],
  message: "Features must not import src/app; use getRouteApi for route state.",
};
// A feature group's route module hangs its pages on the app's layout
// routes, the one part of src/app a feature may import.
const APP_BUT_LAYOUTS = {
  group: ["**/app/**", "!**/app/layouts"],
  message:
    "A feature route module may import only src/app/layouts from src/app.",
};
// The API types are one module per domain with no barrel. Any layer may
// import any domain's types (a feature reads another group's shapes on
// purpose); it names the domain module. Every block that sets
// no-restricted-imports repeats this pattern, since a later block replaces
// the rule's options rather than adding to them.
const TYPES_WITHOUT_DOMAIN = {
  regex: "(^|/)api/types(/index)?$",
  message:
    "Import the domain module, such as lib/api/types/dns; lib/api/types has no barrel.",
};

export default defineConfig([
  globalIgnores([
    "dist",
    "dist-mock",
    "coverage",
    "playwright-report",
    "test-results",
    "storybook-static",
    "mock-public/mockServiceWorker.js",
    "src/lib/api/generated",
    // Excluded from tsconfig.test.json until the shell rewrite replaces it,
    // so the type-aware rules cannot parse it.
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
      ...tanstackQuery.configs["flat/recommended"],
      eslintConfigPrettier,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: TYPED_RULES,
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [TYPES_WITHOUT_DOMAIN] }],
    },
  },
  {
    files: ["src/lib/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [FEATURES_AND_SHELL, TYPES_WITHOUT_DOMAIN] },
      ],
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [APP, TYPES_WITHOUT_DOMAIN] },
      ],
    },
  },
  {
    files: ["src/features/*/routes.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [APP_BUT_LAYOUTS, TYPES_WITHOUT_DOMAIN] },
      ],
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: asWarnings(NOT_YET_ERRORS.features),
  },
  {
    files: ["src/shell/**/*.{ts,tsx}"],
    rules: asWarnings(NOT_YET_ERRORS.shell),
  },
  {
    files: ["e2e/**/*.ts"],
    extends: [playwright.configs["flat/recommended"]],
    languageOptions: { globals: globals.node },
    rules: {
      // A test states one path; branches belong in helpers or separate
      // tests. Skipping a test for one project is allowed.
      "playwright/no-conditional-in-test": "error",
      "playwright/no-conditional-expect": "error",
      "playwright/no-skipped-test": ["error", { allowConditional: true }],
      "playwright/no-wait-for-timeout": "error",
      "playwright/no-force-option": "error",
      "playwright/prefer-to-have-count": "error",
      // The checks in fixtures.ts and helpers.ts assert too.
      "playwright/expect-expect": [
        "error",
        {
          assertFunctionNames: [
            "checkPage",
            "expectPage",
            "expectToast",
            "expectNoSeriousA11yIssues",
            "expectNoHorizontalScroll",
            "expectSearchSurvivesBack",
          ],
        },
      ],
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
