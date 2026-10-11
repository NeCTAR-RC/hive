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
make dev                    # redis + API (:8000, reload) + Vite (:5173)
python scripts/dev-login.py # log the browser in the way manuka does
```

`scripts/dev-login.py` gets an unscoped token with the credentials in
`test-cred` and serves manuka's auto-submitting form once on
`127.0.0.1:8765`, so the real cross-site POST and cookie path is exercised
without a manuka whitelist entry.

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
