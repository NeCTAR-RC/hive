# Hive

The Nectar Research Cloud dashboard: a React single-page app backed by a
FastAPI backend-for-frontend, replacing the Horizon dashboard panel by
panel.

## How it works

```
browser (SPA) --same origin--> FastAPI (/api, /auth, static SPA)
                                 |-- Redis: sessions and caches
                                 |-- Keystone, Nova, Neutron, Cinder, Glance,
                                 |   Swift, Octavia, Magnum, Heat, Designate,
                                 |   Manila, Trove, CloudKitty, Gnocchi
                                 |-- manuka, Langstroth, Varroa, Warre
                                 `-- Horizon /rest_api/ (allocations)
```

- The browser never holds an OpenStack token. manuka (the accounts
  service) POSTs an unscoped Keystone token to `/auth/websso/`; the backend
  validates it, scopes it to a project and keeps both tokens in a Redis
  session behind an HttpOnly cookie, as Horizon does.
- Every OpenStack and Nectar call goes through the backend with the user's
  scoped token. Slow, shared lists are cached in Redis with
  stale-while-revalidate; per-project lists are fetched live.
- Nectar-specific behaviour (network classification, flavour SU rates,
  AZ-scoped volume types, community images and so on) lives in
  `backend/hive/nectar/` as pure functions, each citing the Horizon patch
  it reproduces.
- Horizon URLs keep working: `backend/hive/data/horizon-redirects.json` is
  served as 301s by the backend and applied by the SPA.

## Development

```
make env                    # .env from ./test-cred (git-ignored)
make start                  # redis + API (:8000, reload) + Vite (:5173), in the background
make login                  # print a one-shot login URL; open it once in a browser
make restart                # restart the API and Vite, for example after editing .env
make status                 # what is running, and where the logs are (.dev/)
make stop                   # stop everything, redis included
```

Those targets call `scripts/dev-stack.sh`, which also has `logs`. `make dev`
runs the same stack in the foreground instead. To look at the UI without
a backend or credentials, `pnpm -C frontend dev:mock` serves it on :5173
against the in-browser mocked API. The API reloads on edits
under `backend/hive` only, so `frontend/node_modules` no longer exhausts the
file watcher.

`make login` runs `scripts/dev-login.py`: it gets an unscoped token with the
credentials in `test-cred` and serves manuka's auto-submitting form once on
`127.0.0.1:8765`, so the real cross-site POST and cookie path is exercised
without a manuka whitelist entry. The URL is consumed on first use and
lands you in the account's first project; switch projects from the header.

```
tox                 # the whole gate: the Python envs and the frontend envs
tox -m python       # the Python side only (py314, pep8, typecheck, deps)
tox -m frontend     # frontend-lint, -unit, -build and e2e (node 26 + pnpm)
tox -e cover        # coverage with a 90% floor
tox -e lock         # rewrite requirements.lock after changing dependencies
tox -e frontend     # lint, test and build the SPA (node 26 + pnpm)
tox -e live         # against rctest; needs HIVE_TEST_CRED=/path/to/test-cred
```

Runtime dependencies are pinned with hashes in `requirements.lock`, which
the image installs; `tox -e deps` fails when it no longer matches
`pyproject.toml`.

Configuration is entirely `HIVE_*` environment variables; see
`backend/hive/config.py` and `.env.example`.

## Production settings

With `HIVE_ENV=prod` the app refuses to start unless these are set:

- `HIVE_WEBSSO_ALLOWED_ORIGINS`: manuka's origin. The login receiver is
  the one CSRF-exempt route, and an empty list rejects every login.
- `HIVE_COOKIE_SECURE=true` (the default) and an `https` `HIVE_PUBLIC_URL`.
- `HIVE_DOCS_ENABLED=false` (the default).
- `HIVE_KEYSTONE_URL`, explicitly (the default points at rctest).

The chart should also set:

- `HIVE_FORWARDED_ALLOW_IPS`: the ingress addresses whose
  `X-Forwarded-For` and `X-Forwarded-Proto` are trusted (default
  `127.0.0.1`).
- `HIVE_METRICS_ALLOWED_NETWORKS`: the networks Prometheus scrapes from.
  `/metrics` answers 404 to everyone else (default: localhost only).

The ingress should not expose `/metrics`, `/healthz` or `/readyz`: they
are for the cluster, not the internet.

## Container and chart

```
make build          # registry.rc.nectar.org.au/nectar/hive:<git describe>
docker compose up   # smoke test the built image with redis
```

The helm chart lives in the `hive-helm` repository.

Releases use [reno](https://docs.openstack.org/reno/) for release notes.
Contributions go through gerrit; use conventional commits and `git commit -s`.
