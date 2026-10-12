# Hive

React SPA + FastAPI backend-for-frontend replacing the Nectar Horizon
dashboard. Full design and milestone plan: the approved plan this repo was
scaffolded from (Oct 2026); reference code for parity lives beside the repo
in `../existing-dashboard-code/` (git-ignored).

## Layout

- `backend/hive/`: the Python package (packaging at the repo root).
  `api/` routers, `clients/` upstream HTTP (no Nectar policy), `nectar/`
  pure Nectar rules (no IO), `services/` orchestration, `session/`,
  `cache/`, `auth/`, `web/app.py` (factory + `hive-web`).
- `backend/tests/`: `unit`, `api` (fakeredis + respx), `live` and
  `contract` (rctest, need `HIVE_TEST_CRED`).
- `frontend/`: Vite + React 19 + TypeScript; see `frontend/README.md`.
- `backend/hive/data/horizon-redirects.json`: the Horizon URL map, served
  as 301s by the backend and imported by the SPA.
- The helm chart is the separate `hive-helm` repository.

## Rules

- `tox` for Python (py314, pep8 = pre-commit with ruff + hacking + typos,
  cover >= 90%); `pnpm lint && pnpm test && pnpm build` for the frontend.
  Always `pnpm build` (tsc + vite), never `vite build` alone.
- Gerrit, no branches; conventional commits; `git commit -s`; a reno note
  per user-visible change (`releasenotes/notes/`).
- Hacking H306: imports in alphabetical order within each group.
- ASCII only in source, comments and content (no em dashes, curly quotes).
- Frontend styles consume `--hive-*` custom properties only;
  `src/styles/tokens.scss` is the single bridge to the design-system Sass
  tokens (`pnpm check:tokens` enforces it). Use `@ardc-ui/react` components
  first; build gaps in `src/components/`.
- Every Nectar behaviour in `backend/hive/nectar/` cites the Horizon patch
  or file it reproduces in its docstring.
- Never log or echo tokens, cookies or form bodies. The manuka receiver
  `POST /auth/websso/` is the only CSRF-exempt route.
- Settings are `HIVE_*` environment variables (`backend/hive/config.py`);
  `make env` writes a local `.env` from `test-cred` (both git-ignored).

## Dev loop

```
make env && make start          # redis + API :8000 + Vite :5173, in the background
make login                      # one-shot login URL (consumed on first use)
make restart                    # after backend edits (reload misses them here)
make status | make stop         # logs and pids live in .dev/
node frontend/scripts/live-smoke.mjs <one-shot url>   # browser smoke + axe
```

`scripts/dev-stack.sh` is behind those targets; `make dev` is the
foreground variant. Never write the literal patterns `dev-login.py`,
`hive-web --host` or `vite` in a shell command that runs the script: its
pkill fallbacks would match that shell.
