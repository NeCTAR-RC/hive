import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The API the dev server proxies to (see `make dev`).
const API = process.env.HIVE_DEV_API ?? "http://127.0.0.1:8000";

/** A build or dev server with the API mocked in the browser (VITE_MOCK=1). */
const MOCK = process.env.VITE_MOCK === "1";

// Vite rejects Host headers other than localhost and IPs; accept the one
// the browser uses when the dev server listens on 0.0.0.0 (HIVE_DEV_HOST).
const PUBLIC_HOST = process.env.HIVE_PUBLIC_URL
  ? new URL(process.env.HIVE_PUBLIC_URL).hostname
  : undefined;

/**
 * Serves and emits the files in mock-public/ in mock mode only, so the
 * shipping build never contains them: MSW's service worker (MSW's install
 * step keeps it current, the "msw" key in package.json) and the mocked
 * featured banner's picture, so the mocked home page needs no network.
 */
function mockPublic(): Plugin {
  const FILES: Record<string, string> = {
    "mockServiceWorker.js": "text/javascript",
    "featured-banner.svg": "image/svg+xml",
  };
  const source = (name: string) =>
    readFileSync(path.resolve(import.meta.dirname, "mock-public", name));
  return {
    name: "hive-mock-public",
    configureServer(server) {
      for (const [name, contentType] of Object.entries(FILES)) {
        server.middlewares.use(`/${name}`, (_request, response) => {
          response.setHeader("Content-Type", contentType);
          response.end(source(name));
        });
      }
    },
    generateBundle() {
      for (const name of Object.keys(FILES)) {
        this.emitFile({ type: "asset", fileName: name, source: source(name) });
      }
    },
  };
}

/**
 * Vendor chunk families, highest priority first. React and React Aria come
 * before the design system and the router because those depend on them;
 * the charts family comes last because only lazily loaded charts use it,
 * and `scripts/check-bundle.mjs` fails the build if it is ever preloaded.
 */
const VENDOR_FAMILIES: readonly {
  chunk: string;
  matches: (name: string) => boolean;
  /** Module ids the family leaves to a later group. */
  excludes?: (id: string) => boolean;
}[] = [
  {
    chunk: "vendor-react",
    matches: (name) =>
      [
        "react",
        "react-dom",
        "scheduler",
        "use-sync-external-store",
        "react-is",
      ].includes(name),
  },
  {
    chunk: "vendor-aria",
    matches: (name) =>
      ["react-aria", "react-aria-components", "react-stately"].includes(name) ||
      [
        "@react-aria/",
        "@react-stately/",
        "@react-types/",
        "@internationalized/",
      ].some((scope) => name.startsWith(scope)),
    excludes: isDragAndDrop,
  },
  { chunk: "vendor-ds", matches: (name) => name === "@ardc-ui/react" },
  {
    chunk: "vendor-query",
    matches: (name) =>
      ["@tanstack/react-query", "@tanstack/query-core"].includes(name),
  },
  {
    chunk: "vendor-router",
    matches: (name) =>
      [
        "@tanstack/react-router",
        "@tanstack/router-core",
        "@tanstack/history",
        "@tanstack/react-store",
        "@tanstack/store",
      ].includes(name),
  },
  {
    chunk: "vendor-charts",
    matches: (name) =>
      ["recharts", "victory-vendor", "internmap"].includes(name) ||
      name.startsWith("d3-"),
  },
];

/**
 * Whether a module is React Aria's drag and drop machinery: the
 * `useDragAndDrop` hook of the components package, and in the hooks and
 * state packages the drag and drop hooks and the `dnd` folder. The files
 * are told apart by name because the packages ship them beside the rest.
 */
function isDragAndDrop(id: string): boolean {
  if (
    /react-aria-components\/dist\/(private|exports)\/useDragAndDrop\.mjs$/.test(
      id,
    )
  ) {
    return true;
  }
  const inHooks =
    /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(react-aria|react-stately|@react-aria\/[^/]+|@react-stately\/[^/]+)\/dist\//.test(
      id,
    );
  if (!inHooks) return false;
  const file = id.split("/").pop() ?? "";
  return /[\\/]dnd[\\/]/.test(id) || /drag|drop|dnd/i.test(file);
}

/**
 * The drag and drop chunk, at the lowest priority so every other family
 * claims its modules first. Only the pages that reorder by dragging import
 * it, so it stays off the initial path: with the machinery in `vendor-aria`
 * the first-paint JS grew by about 33 kB gzip (`scripts/check-bundle.mjs`
 * would fail the build).
 */
const DRAG_AND_DROP_GROUP = {
  name: "vendor-dnd",
  test: isDragAndDrop,
  priority: 0,
};

export default defineConfig({
  base: "/",
  plugins: MOCK ? [react(), mockPublic()] : [react()],
  css: {
    modules: {
      localsConvention: "camelCase",
    },
    preprocessorOptions: {
      scss: {
        loadPaths: [path.resolve(import.meta.dirname, "src/styles")],
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: PUBLIC_HOST ? [PUBLIC_HOST] : [],
    // Only the backend's own routes are proxied; /auth/login and friends
    // are SPA pages.
    proxy: {
      "/api/": API,
      "/auth/websso": API,
      "/auth/start": API,
      "/healthz": API,
      "/readyz": API,
      "/metrics": API,
    },
  },
  preview: {
    // `vite preview` serves the mocked build for e2e: no backend to proxy to.
    proxy: {},
  },
  build: {
    sourcemap: true,
    rolldownOptions: {
      output: {
        // One chunk per vendor family so a dashboard release does not
        // invalidate the design system or React for returning browsers.
        // Higher priority claims a module first, and each group also takes
        // the dependencies of what it captures, so the shared helpers (for
        // example use-sync-external-store) land in an initial chunk before
        // the charts group, which only lazy pages import, can claim them.
        codeSplitting: {
          groups: [
            ...VENDOR_FAMILIES.map((family, index) => ({
              name: family.chunk,
              test: (id: string) => {
                const name = packageName(id);
                return (
                  name !== undefined &&
                  family.matches(name) &&
                  !family.excludes?.(id)
                );
              },
              priority: VENDOR_FAMILIES.length - index,
            })),
            DRAG_AND_DROP_GROUP,
          ],
        },
        // A feature group's lazily loaded pages chunk is named after its
        // group (pages-compute-<hash>.js) rather than after its file, which
        // every group calls pages.ts.
        chunkFileNames: (chunk) => {
          const group = featureGroup(chunk.facadeModuleId);
          return group === undefined
            ? "assets/[name]-[hash].js"
            : `assets/pages-${group}-[hash].js`;
        },
      },
    },
  },
});

/**
 * The npm package a module id belongs to, read from the last
 * `node_modules/` segment so pnpm's `.pnpm/<name>@<version>_<peers>/`
 * directory names (which mention peer packages) never match by accident.
 * Undefined for application source.
 */
function packageName(id: string): string | undefined {
  const segments = id.split(/[\\/]/);
  const at = segments.lastIndexOf("node_modules");
  const first = at === -1 ? undefined : segments[at + 1];
  if (first === undefined) return undefined;
  return first.startsWith("@") ? `${first}/${segments[at + 2] ?? ""}` : first;
}

/**
 * The feature group whose pages module (`src/features/<group>/pages.ts`,
 * the group's code-split boundary) a chunk is built from, if any.
 */
function featureGroup(facadeModuleId: string | null): string | undefined {
  return facadeModuleId?.match(
    /[\\/]src[\\/]features[\\/]([^\\/]+)[\\/]pages\.ts$/,
  )?.[1];
}
