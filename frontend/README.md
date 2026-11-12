# Hive frontend

React 19 + TypeScript single-page app on the ARDC design system
(`@ardc-ui/react`), TanStack Router and Query, Vite 8, pnpm.

```
pnpm install              # node 26+, global pnpm switches to the packageManager pin
pnpm dev                  # Vite on :5173, proxies /api and /auth to :8000
pnpm dev:mock             # the same against the in-browser mocked API, no backend needed
pnpm lint                 # eslint, stylelint, prettier, design-token, design-source and API contract checks
pnpm test                 # vitest
pnpm generate:api         # regenerate the API contract after a backend route or model change
pnpm test:e2e             # type check, then playwright + axe against a mocked build
pnpm build                # tsc -b, vite build, then the first-paint bundle budget
```

## Testing

Pure functions get unit tests (`*.test.ts`, Vitest in plain Node; the few
that need a DOM and the component tests, `*.test.tsx`, run in jsdom). The UI
gets end-to-end tests. No test exists only for coverage; `pnpm
test:coverage` fails if coverage drops under the floor in
`vitest.config.ts`, which is raised as tests are added, never lowered.

`pnpm test:e2e` type-checks, builds the app with the mocked API into
`dist-mock/`, serves it on port 4183 and runs every spec in `e2e/` on two
projects, desktop Chrome and Pixel 5. Port 4183 is Hive's own and the
server is never reused (`--strictPort`, `reuseExistingServer: false`), so a
run cannot test another app or a stale build; if the port is taken, free it
(`lsof -ti :4183 | xargs kill`). The browser clock starts at a fixed
instant (`E2E_NOW`, 2026-10-14 00:00 UTC) in the Australia/Melbourne zone
with the en-AU locale and reduced motion, so seed data, relative dates and
number formats are the same on every run; a spec that waits on the mocked
cloud advances the clock (`page.clock.runFor`) instead of waiting.

- Feature specs are named after the sidebar's groups (`compute`,
  `network`, `load-balancers`, ...). `routes.spec.ts` is the route smoke:
  it opens every page and checks its heading, axe (WCAG 2.1 AA) and that it
  never scrolls sideways. `destructive.spec.ts` deletes one record of every
  type from its list. `errors.spec.ts` covers failed loads, failed dialogs,
  a session ending mid-task, unknown records and a disabled service.
  `create-flows.spec.ts` covers what every create page shares: the leave
  question and the wizards' focus on a step change.
- Every spec imports `test` and `expect` from `e2e/fixtures.ts`, which
  blocks third-party hosts, starts the clock and fails a test on a mock
  contract error, and builds on the page vocabulary in `e2e/helpers.ts`
  (`expectPage`, `checkPage`, `table`, `row`, `rowAction`, `expectToast`,
  ...). ESLint's Playwright rules apply to `e2e/`.
- `failRequest(page, method, path, failure)` makes the mocked API fail one
  request with an HTTP status (409 by default) or a network error, until
  `clearFailure(page)`. It sets the fault cookie (`hive_mock_fail`), which
  `src/mocks/faults.ts` reads before every domain's handlers.
  `setMockSession` and `setInstancePageSize` set the other mock cookies (a
  logged-out or Keystone-down session, a short instances page).
  `failBuiltFiles(page, files)` answers built files (a page group's chunk)
  with a 404, as after a deploy, until the function it returns is called.

The mocked API lives in `src/mocks/<domain>/`: `handlers.ts` holds a
domain's in-memory state and handlers, `schemas.ts` the request bodies it
accepts. A request body that does not match its schema, or an `/api`
request no handler serves, fails the spec that sent it (see
`e2e/fixtures.ts`), so add the handler and its schema with the feature.
Mock builds alone carry `mock-public/`: MSW's service worker and the
mocked featured banner's picture, so the mocked home page needs no network.

A mocked tab left hidden for a while can lose its mocks: Chrome stops the
idle service worker, and the restarted worker no longer knows the tab, so
`/api` requests reach the dev server's proxy and fail. When the tab is shown
again, `src/mocks/wake.ts` notices and restarts the mocking ("[mock]
restarted the mocked API" in the console); a reload does the same.

`tsc -b` type-checks the unit tests, the mocks and the e2e specs too
(`tsconfig.test.json`), and the node scripts as JavaScript
(`tsconfig.scripts.json`); `pnpm build` ends with `scripts/check-bundle.mjs`,
which fails when the JS loaded on first paint grows past its budget or
preloads the lazily loaded charts.

`pnpm lint` runs two design checks (see `DESIGN-NOTES.md`, "Guard
rails"): `pnpm check:tokens` holds styles to the token bridge and to a `///`
docblock naming each rule block's design source, and
`pnpm design:sources --check` fails when the "Sources by selector" appendix
no longer matches those docblocks (`pnpm design:sources --write` rewrites
it).

### API contract

The SPA's API types are generated from the backend. `pnpm generate:api`
exports the OpenAPI document without a server
(`backend/scripts/export_openapi.py`) into
`src/lib/api/generated/openapi.json` and builds
`src/lib/api/generated/openapi.d.ts` from it with openapi-typescript. Both
are committed and never edited by hand; run the command after changing a
backend route or model. The export needs a Python with the backend's
dependencies: `HIVE_PYTHON`, else the first of `.tox/dev`, `.tox/py314`,
`.tox/py312` and `.venv` that exists, else `python3`.

`pnpm lint` ends with `pnpm generate:api --check`, which fails when either
file is stale. Without `HIVE_PYTHON` or a backend virtualenv it skips the
export with a notice and checks only that the types match the committed
document, so a frontend-only CI job still passes; a job with the backend
installed checks both.

The mocks are held to the same contract:

- `src/mocks/contract.test.ts` checks that every route a mock serves is a
  documented operation, then calls every documented read the mocks serve
  (on a seeded record from `SAMPLES`) and validates the reply's status and
  body against its schema with ajv. `UNCHECKED_READS` names the reads it
  leaves out, each with the reason.
- In the e2e suite the mock worker validates every mocked reply, writes
  too, and logs a "[mock]" error for one that breaks the contract, which
  fails the spec.
- Every handler types its reply as `Reply<path, method>`
  (`src/mocks/http.ts`), so `tsc` rejects a reply field the backend does
  not send.

### Gates

The same four gates run in CI, in tox and before every push:

| Gate  | tox                     | pnpm                                     |
| ----- | ----------------------- | ---------------------------------------- |
| lint  | `tox -e frontend-lint`  | `pnpm lint`                              |
| unit  | `tox -e frontend-unit`  | `pnpm test`                              |
| build | `tox -e frontend-build` | `pnpm build`                             |
| e2e   | `tox -e e2e`            | `pnpm test:e2e:install && pnpm test:e2e` |

`tox -m frontend` runs all four. The tox envs set `ARDC_HOOKS=0`, so their
`pnpm install` installs no git hook.

`pnpm install` installs a pre-push hook (`scripts/hooks/pre-push`, through
the `prepare` script) that runs all four, so a push fails locally exactly
when CI would fail it. Skip it with `ARDC_HOOKS=0` or `git push
--no-verify`; set `ARDC_HOOKS=0` during `pnpm install` to not install it.
pre-commit also runs `pnpm lint` on commits that touch `frontend/`.

`tox -e e2e` sets `CI=1`: two retries, and a test that passes only on a
retry still fails the run; the workers are half the cores, as locally.
The HTML report lands in `playwright-report/` and traces in
`test-results/`.

CI runs these through the nectar-ci `{name}-resolute-tox-{environment}`
job template on the `resolute` agents (node 26 and a global pnpm; the e2e
env downloads Chromium per run): Hive's entry in `data/projects/python.yaml`
runs `frontend` (lint, unit tests and build in one job) and `e2e`, beside
the Python envs `py314`, `pep8` and `cover`. The split envs `frontend-lint`,
`frontend-unit` and `frontend-build` are for running one gate locally.

### Live runs

Setting `HIVE_LIVE_URL` swaps the mocked projects for three live ones
against a running Hive with a real backend, on the real clock:

- `live-login` (`e2e/live/login.setup.ts`) logs in once through a one-shot
  URL and saves the session for the other two.
- `live` runs `e2e/live/*.spec.ts` on desktop Chrome: a smoke of the home
  page and My details with the Horizon redirect map, every page (and the
  first record of each list) with axe, and create-to-delete round trips on
  scratch resources named `hive-smoke-<time>`.
- `live-phone` runs the smoke on Pixel 5.

Point it at the backend serving the built SPA (the Horizon redirects are
the backend's):

```
make login    # prints a one-shot login URL
HIVE_LIVE_URL=http://127.0.0.1:8000 HIVE_LIVE_LOGIN_URL='<one-shot URL>' \
  HIVE_LIVE_PROJECT=pt-50 pnpm exec playwright test
```

`HIVE_LIVE_PROJECT` is optional; without it the run stays in the account's
first project.

### Render captures

`e2e/visual.spec.ts` captures the content (`main`) of six pages: the login
page, the home page, the instances list, an instance, the launch wizard's
first step and the create reservation page; plus one capture of the shell
around a page (the instances list, with its `main` masked) and one of a
confirm dialog, on desktop and on the phone project. The clock is frozen
at the fixture's instant so relative dates cannot drift. Each picture is
attached to the run's report (`playwright-report/`, and the test's folder
under `test-results/`), where a reviewer looks at it. Nothing is compared:
the repository keeps no reference pictures, so a look change is verified
by eye, here and on the change's review site. A failure means a page did
not render far enough to be captured.

```
pnpm exec playwright test e2e/visual.spec.ts
pnpm exec playwright show-report   # the captures sit under each test
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
- Every feature lives in `src/features/<group>/<panel>/` (a group with one
  page per panel, such as `reservations` or `account`, keeps its files at
  the group root); shared pieces in `src/components/` and `src/lib/`; the
  shell in `src/shell/`. A group's `api.ts`, `status.ts`, `routes.tsx`,
  `pages.ts`, `data/` and stylesheet sit at the group root. Inside a panel,
  files are grouped by purpose and named after their one export: pages at
  the panel root (`InstancesPage.tsx`, one page per file), dialogs in
  `dialogs/` (one per file), wizard steps in `steps/` (`<Name>Step.tsx`),
  detail tabs in `tabs/` (`<Name>Tab.tsx`), and pure logic (request
  builders, cascades, rules) in lowercase modules such as `request.ts`
  with a `*.test.ts` beside each. A `<Resource>Actions.tsx` exports its
  `use<Resource>Actions` hook.
- The backend's response and request shapes live in
  `src/lib/api/types/<domain>.ts`, named after the feature group that shows
  them, plus `common.ts` (list envelopes) and `session.ts` (the shell's
  session, user and project). Each type aliases the generated contract
  (`export type Zone = Schemas["Zone"]`); a name that differs from the
  backend's says so in its docblock, and the few shapes the backend does not
  send (the Swift banner, the service keys, the generic list envelopes) are
  declared there with the reason. Import the domain module you need
  (`lib/api/types/dns`); there is no barrel, and lint rejects
  `lib/api/types` on its own. A feature may import another group's types.
- A form value picked from a list the backend offers (a protocol, an
  affiliation) becomes its request field's union through `offered()`
  (`src/lib/api/offered.ts`); the backend validates it.
- A feature group declares its routes in `src/features/<group>/routes.tsx`
  on the layout routes of `src/app/layouts.tsx`, and `src/app/router.tsx`
  assembles the groups. Pages read their params and search with
  `getRouteApi("<route id>")` and never import from `src/app`. Each group's
  pages load lazily, as one chunk, through its `pages.ts`; only the shell,
  login, signed out, home and the 404 page load with the app.
- A list backed by a query spreads `useQueryTable(query, { noun, search })`
  into its `DataTable`, which filters and searches the rows itself. Every
  search box keeps its text in the URL as `q` through `useListSearch`
  (the route's schema extends `listSearch` in `src/lib/search.ts`), and
  every other search-param change (a filter, a dialog flag) goes through
  `useSearchPatch`.
- A dialog exists only while it is open: the page renders it while its
  `dialog` state (or URL flag) says so and passes `onClose`, so the
  dialog's form, request and local state start fresh on every open. A form
  dialog binds its form to its request with `useMutationForm` and spreads
  the result onto `FormDialog`; its fields are the bindings that
  `fieldsFor<Values>()` returns (`src/components/Form/fields`), which read
  the form from context. A single-step form outside a dialog uses `Form`.
- Every cached resource has its keys in `src/lib/queryKeys.ts`
  (`queryKeys.<service>.<resource>`: `all`, `list(projectId, params?)`,
  `detail(projectId, id)`), and a write marks what it changed stale with
  `useInvalidate()` (`src/lib/hooks/useInvalidate.ts`). A feature's
  `api.ts` builds its queries and mutations on them; no feature writes a
  key by hand.
- The project id is read, never passed down. A mutation hook reads it
  itself (`useDeleteKeyPair()`). A query helper takes it as its first
  argument (`keyPairsQuery(projectId)`), so the same helper serves a
  component, the shell and a test; a component reads it once with
  `useProjectId()`. No page hands `projectId` to a dialog or a hook.
- Every confirmed or batch request runs through `useBulkAction`
  (`src/components/BulkAction/`): one request per item settled together
  (`settleAll` in `src/lib/bulk.ts`), one refetch and one toast per batch,
  the failed rows left selected and focus returned to the table. A
  confirmation names what it touches and never asks for a typed name.
- A row menu reads its actions from a rule table (`ActionTable` in
  `src/lib/actions.ts`) in the feature's status module: every action is
  listed, and one that cannot run now is disabled with its reason, never
  hidden. A resource's actions sit behind one `use<Resource>Actions()`
  hook returning `{ run(action, items), dialogs, tableProps }`; pages map
  the offers with `toRowActions`, render `dialogs` and spread `tableProps`
  onto the table.
- A detail page renders its record through `DetailPage`
  (`src/shell/DetailPage/`): it owns the page header and the loading, not
  found (a 404, or a record missing from the list or tree it is picked
  from), service not available (501 `service_not_enabled`) and failed
  states, each with a link back to the list; the page supplies the body for
  a loaded record. A tabbed page declares its tab ids once, in its route's
  search schema (`tabParam` or `tabSearch` in `src/lib/search.ts`), and
  reads and sets the tab with `useTabSearch`.
- A multi-step create page is `useWizard` plus `WizardForm`
  (`src/components/Wizard/`): its steps are a typed record of title, fields
  and step component (which reads the form from context), Next validates
  the step's fields, a failed submit shows the first step with an error,
  and focus moves to the step's heading on every change. Every create page
  asks before the user leaves with unsaved input (`useLeaveGuard`, which a
  wizard includes) and releases the guard once the create has succeeded.
- A query that follows a changing resource polls through `pollWhile`
  (`src/lib/queries.ts`) on one of the `pollIntervals`.
- A status reads through `src/lib/status.ts`: `defineStatus` turns a
  feature's tables (busy, good and bad statuses, the words that differ)
  into its tone, label and busy readers, `heatStatus` reads Heat-style
  `<ACTION>_<STATE>` values, and `humanise` and `enumLabel` write any other
  raw value. A feature's `status.ts` holds the tables, not the rules.
- A panel appears in the sidebar through `src/shell/navigation/panels.ts`;
  flip its status to `built` when it has a Hive route.
- Horizon paths are mapped in `backend/hive/data/horizon-redirects.json`,
  served as 301s by the backend and applied by the SPA; a row whose target
  is the requested path does not match in either.
- A button whose action runs (a dialog's submit, a wizard's last step)
  stays the same focusable button and spreads `loadingProps(isPending,
text)` (`src/components/buttonState.ts`) instead of swapping in a disabled
  copy, which would drop keyboard focus.
- Third-party scripts load from code, never inline, so the CSP needs no
  `'unsafe-inline'`: `appendScript` (`src/lib/scripts.ts`) for Google
  Analytics and the Freshworks widget when `/api/config` names them
  (`src/lib/extras.ts`), and for the agency mega menu, which is hidden if
  its loader fails (`src/shell/megamenu.ts`). The footer's loader is a
  plain external script in `index.html`.
- The live browser checks (the `live` Playwright project, see Live runs)
  drive the real manuka-style login against a running backend. The
  `scripts/live-*.mjs` scripts left exercise single panels against rctest.
