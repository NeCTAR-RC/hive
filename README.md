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
make restart                # restart the API and Vite after backend edits (session survives)
make status                 # what is running, and where the logs are (.dev/)
make stop                   # stop everything, redis included
```

Those targets call `scripts/dev-stack.sh`, which also has `logs`. `make dev`
runs the same stack in the foreground instead. `uvicorn --reload` can miss
backend edits on machines at the inotify watch limit; `make restart` is the
fix.

`make login` runs `scripts/dev-login.py`: it gets an unscoped token with the
credentials in `test-cred` and serves manuka's auto-submitting form once on
`127.0.0.1:8765`, so the real cross-site POST and cookie path is exercised
without a manuka whitelist entry. The URL is consumed on first use and
lands you in the account's first project; switch projects from the header.

```
tox                 # unit tests and lint (py314, pep8)
tox -e cover        # coverage with a 90% floor
tox -e frontend     # lint, test and build the SPA (node 24 + corepack)
tox -e live         # against rctest; needs HIVE_TEST_CRED=/path/to/test-cred
```

Configuration is entirely `HIVE_*` environment variables; see
`backend/hive/config.py` and `.env.example`.

## Container and chart

```
make build          # registry.rc.nectar.org.au/nectar/hive:<git describe>
docker compose up   # smoke test the built image with redis
```

The helm chart lives in the `hive-helm` repository.

Releases use [reno](https://docs.openstack.org/reno/) for release notes.
Contributions go through gerrit; use conventional commits and `git commit -s`.
