import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { rmSync } from "node:fs";
import path from "node:path";

// The API the dev server proxies to (see `make dev`).
const API = process.env.HIVE_DEV_API ?? "http://127.0.0.1:8000";

/**
 * The npm package a module belongs to, from the path after the LAST
 * `node_modules/`: pnpm nests real packages under
 * `node_modules/.pnpm/<name>@<version>_<peers>/node_modules/<name>`, and the
 * store directory name can mention other packages (the design system's
 * includes `react-aria-components`), so matching anywhere in the id is wrong.
 */
export function packageName(id: string): string | null {
  const normalised = id.replace(/\\/g, "/");
  const marker = "/node_modules/";
  const at = normalised.lastIndexOf(marker);
  if (at === -1) return null;
  const [first, second] = normalised.slice(at + marker.length).split("/");
  if (!first) return null;
  return first.startsWith("@") && second ? `${first}/${second}` : first;
}

const CHARTS =
  /^(recharts|victory-vendor|d3-.*|internmap|delaunator|robust-predicates)$/;

/** One chunk per vendor family, so a dashboard release does not invalidate
 * the design system or React for returning browsers. Small packages shared
 * by several families (use-sync-external-store, react-is) are named
 * explicitly: left unassigned, the bundler may place them in a lazy chunk
 * (charts) that the entry then has to load. */
export function vendorChunk(name: string | null): string | undefined {
  if (!name) return undefined;
  if (
    /^(react|react-dom|scheduler|react-is|use-sync-external-store)$/.test(name)
  ) {
    return "vendor-react";
  }
  if (name.startsWith("@ardc-ui/")) return "vendor-ds";
  // The whole React Aria family stays in ONE chunk. `@react-aria/*` imports
  // `@react-stately/*` and `react-aria-components` imports both, so any
  // split between them makes two chunks import each other and one of them
  // evaluates `class X extends undefined` on load (a blank page). The
  // family is about 480 kB together, under the size warning.
  if (
    name === "react-aria" ||
    name === "react-aria-components" ||
    name === "react-stately" ||
    name.startsWith("@react-aria/") ||
    name.startsWith("@react-stately/") ||
    name.startsWith("@react-types/")
  ) {
    return "vendor-aria";
  }
  if (name.startsWith("@internationalized/")) return "vendor-intl";
  if (CHARTS.test(name)) return "vendor-charts";
  if (name === "@tanstack/react-query" || name === "@tanstack/query-core") {
    return "vendor-query";
  }
  if (
    /^@tanstack\/(react-router|router-core|history|react-store|store)$/.test(
      name,
    )
  ) {
    return "vendor-router";
  }
  return undefined;
}

/**
 * MSW's service worker lives in public/ (where `msw init` keeps it) but only
 * the mocked build (VITE_MOCK=1, written to dist-mock) may ship it.
 */
function dropMockWorker(): Plugin {
  let outDir = "";
  return {
    name: "hive-drop-mock-worker",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (process.env.VITE_MOCK === "1") return;
      rmSync(path.join(outDir, "mockServiceWorker.js"), { force: true });
    },
  };
}

export default defineConfig({
  base: "/",
  plugins: [react(), dropMockWorker()],
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
    // The React Aria family cannot be split (see vendorChunk) and weighs
    // about 530 kB; it is cached across releases, so the limit sits just
    // above it and still flags growth in the dashboard's own chunks.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Rolldown's `manualChunks` compatibility pulls every dependency of
        // a classified module into its group, which put
        // use-sync-external-store (needed by the router) into the lazy
        // charts chunk; the native groups with recursion off do not.
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [{ name: (id: string) => vendorChunk(packageName(id)) }],
        },
      },
    },
  },
});
