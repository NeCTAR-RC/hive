# Hive frontend

React 19 + TypeScript single-page app on the ARDC design system
(`@ardc-ui/react`), TanStack Router, Query and Table, Vite 8, pnpm.

```
corepack pnpm install     # node 24+, pnpm from the packageManager pin
pnpm dev                  # Vite on :5173, proxies /api and /auth to :8000
VITE_MOCK=1 pnpm dev      # the same against the in-browser mocked API
pnpm lint                 # eslint, stylelint, prettier, design-token check
pnpm test                 # vitest
pnpm test:e2e             # playwright + axe against a mocked build
pnpm build                # tsc -b && vite build (never `vite build` alone)
```

## Registry

`@ardc-ui/react` comes from the in-network registry named in `.npmrc`,
which answers reads anonymously. Off-network, point your own `~/.npmrc` at
`https://npm-registry.rc.nectar.org.au/` with basic auth for the `@ardc-ui`
scope and edit the project `.npmrc` locally (do not commit the change).

## Conventions

- Styles are CSS Modules in Sass. Components consume `--hive-*` custom
  properties only (`src/styles/tokens.scss` is the single bridge from the
  design-system tokens); `pnpm check:tokens` enforces it.
- ASCII only in source, comments and content.
- Every feature lives in `src/features/<group>/<panel>/`; shared pieces in
  `src/components/` and `src/lib/`; the shell in `src/shell/`.
- A panel appears in the sidebar through `src/shell/navigation/panels.ts`;
  flip its status to `built` when it has a Hive route.
- Horizon paths are mapped in `backend/hive/data/horizon-redirects.json`,
  served as 301s by the backend and applied by the SPA.
- The live browser smoke test (`scripts/live-smoke.mjs`) drives the real
  manuka-style login against a running backend; see the root README.
