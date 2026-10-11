import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// The API the dev server proxies to (see `make dev`).
const API = process.env.HIVE_DEV_API ?? "http://127.0.0.1:8000";

export default defineConfig({
  base: "/",
  plugins: [react()],
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
    rollupOptions: {
      output: {
        // One chunk per vendor family so a dashboard release does not
        // invalidate the design system or React for returning browsers.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)
          ) {
            return "vendor-react";
          }
          if (id.includes("react-aria") || id.includes("react-stately")) {
            return "vendor-aria";
          }
          if (id.includes("@ardc-ui")) return "vendor-ds";
          if (
            id.includes("recharts") ||
            id.includes("victory-vendor") ||
            /[\\/]node_modules[\\/](d3-|internmap|delaunator|robust-predicates)/.test(
              id,
            )
          ) {
            return "vendor-charts";
          }
          if (
            id.includes("@tanstack/react-query") ||
            id.includes("@tanstack/query")
          ) {
            return "vendor-query";
          }
          if (
            id.includes("@tanstack/react-router") ||
            id.includes("@tanstack/router")
          ) {
            return "vendor-router";
          }
          return undefined;
        },
      },
    },
  },
});
