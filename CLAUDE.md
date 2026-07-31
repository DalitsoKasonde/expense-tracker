# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Expenses: a local-first financial workspace (accounts, daily money movement, goals, imports, investments).

- `web/`: Next.js 16 (App Router) + TypeScript + React 19 PWA, invite-only NextAuth login
- `api/`: Go + chi + pgx API with JWT auth and bootstrap-admin login
- `api/migrations/`: numbered SQL migrations for the schema (`NNN_name.up.sql` / `.down.sql`)

The UI overhaul that shipped is documented in `chuma-redesign-plan.md`, `plan.md`, `plan-v2.md`,
`build-plan.md` and `settings-system-plan.md` at repo root (kept for history; the product is now
called Expenses).
Never commit directly to `main`; work on a feature branch.

## Common commands

Root-level (`package.json`):
```bash
npm run dev:api        # cd api && go run ./cmd/api
npm run test:api       # cd api && go test ./...
npm run migrate:up     # cd api && go run ./cmd/migrate up
npm run migrate:down   # cd api && go run ./cmd/migrate down
```

Web (`web/`):
```bash
npm run dev            # next dev --port 3000
npm run build
npm run typecheck      # tsc --noEmit
npm run lint           # eslint . --max-warnings=0
npm run lint:fix
npm run test           # vitest run
npm run test:watch     # vitest
npm run test:cov
```
Run a single test file: `npx vitest run path/to/file.test.ts`.

API (`api/`):
```bash
go run ./cmd/api       # start the API server
go run ./cmd/migrate up
go run ./cmd/migrate down
go build ./...
go vet ./...
go test ./...
go test ./internal/store/... -run TestName   # single package/test
```

`./dev.sh` from repo root runs migrations then starts both API and web dev servers together.

CI (`.github/workflows/ci.yml`) runs, per side: web → `npm ci`, `typecheck`, `lint`, `test`; api → `go test ./...`.
**Every commit must leave the branch green on:** `npm run lint`, `npm run typecheck`, `npm run test`,
`npm run build` (web) and `go build ./...`, `go vet ./...` (api).

## Local setup

Requires local PostgreSQL (or `docker-compose up` for a `postgres:16-alpine` container on 5432).
Env files: `web/.env.local` needs `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_API_BASE_URL`, `API_BASE_URL`.
`api/.env` needs `DATABASE_URL`, `JWT_SECRET`, `APP_ORIGIN` (comma-separated list of allowed origins),
`ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`. Auth is invite-only: the first login with the bootstrap
admin credentials creates the first admin user; after that only users already in the `users` table can sign in.
See `TEST_CREDENTIALS.md` for seeded dev/test accounts.

## Architecture

- **Web:** Next.js App Router, React 19, TypeScript strict, Tailwind 3. Pages/components are server components
  by default; add `"use client"` only when the component needs browser APIs, event handlers, or hooks.
  Route groups: `web/app/(app)/*` (authenticated app shell — today, transactions, add, investments, reports,
  loans, import, settings/*), `web/app/(auth)/*` (login/register), `web/app/onboarding`.
- **API:** Go + chi + pgx, no ORM — SQL is hand-written in `api/internal/store/*.go`, one file per domain
  (accounts, transactions, assets, loans, savings groups, imports, user preferences, etc.). HTTP handlers live
  in `api/internal/httpapi/*.go`, wired up in `server.go`. Auth (`api/internal/auth/`): JWT issuance + password
  hashing; `api/internal/httpapi/middleware.go` and `auth_cookie.go` handle request-level auth.
  `api/internal/database/postgres.go` owns the pgx pool.
- **Database:** PostgreSQL. Every schema change is a new numbered migration under `api/migrations/` with
  matching `.up.sql`/`.down.sql`. Migrations run via `api/cmd/migrate`.
- **Offline:** IndexedDB via `web/lib/offline-db.ts`. The DB handle is opened once (`initDb()`) and cached at
  module scope — never re-opened per call.
- **Money:** all monetary amounts are integer minor units (e.g. ngwee for ZMW, cents for USD) end-to-end —
  never floats in the DB. Display formatting always goes through `web/lib/format-money.ts → formatMoney(amountMinor, currency)`.
  Currency fallback is resolved via `useUserCurrency()` (`web/lib/use-user-currency.ts`), which reads
  `/v1/user/preferences` and falls back to `"ZMW"` — don't hardcode `"ZMW"` elsewhere. Never sum amounts
  across different currencies; group or display separately.
- **Design tokens:** all styling is Tailwind utilities driven by CSS-variable tokens in `web/app/globals.css`
  (`bg-surface`, `text-on-surface`, `text-income`, etc.). Never hardcode hex/`rgba()`/pixel values in JSX —
  use the token or Tailwind alias. Dark mode toggles via a `.dark` class on `<html>`; token values change under
  `.dark {}` in `globals.css`, no hardcoded light/dark conditionals in components. Legacy semantic classes in
  `globals.css` (e.g. `sidebarNav`, `bottomNav`) are being retired — don't add new ones; migrate to Tailwind
  utilities when touching a file that still uses them.

## Conventions (from `.kiro/rules/workspace.md`)

**File layout:** shared components in `web/components/`, design-system primitives in `web/components/ui/`.
Page-specific helpers stay in the page file until reused 2+ places, then move to `lib/` or `components/`.
`lib/` is pure logic/hooks/adapters only — no JSX. Filenames are `kebab-case`, never `PascalCase`. Barrel
`index.ts` files are allowed only in `components/ui/`.

**TypeScript:** `strict: true` always on. No `as any`, no `as unknown as T` double-casts (unless the function's
contract explicitly returns an opaque shell type), no unexplained `@ts-ignore`/`@ts-expect-error`. Prefer `type`
over `interface` for plain data shapes.

**React/Next data fetching:** every data-fetch `useEffect` must (1) guard on `session?.accessToken` and bail
early if absent, (2) use the `apiCallRef` pattern to avoid stale-closure re-fires:
```ts
const apiCallRef = useRef(apiCall);
apiCallRef.current = apiCall;
```
(3) set an `ignore` flag and clean up with `return () => { ignore = true; }`. Don't wrap simple expressions in
`useMemo`/`useCallback`; collapse multiple `useMemo`s that iterate the same array into one pass; no
`.find()`-inside-`.map()` O(n²) patterns.

**Accessibility:** every input/select/textarea needs a `<label htmlFor>` + matching `id`. Interactive elements
need visible focus styles and a 44×44px minimum touch target. Decorative elements get `aria-hidden="true"`;
icon-only buttons/links get `aria-label`. Charts need an `sr-only` text summary. Errors use `role="alert"`,
live status uses `role="status"`.

**Performance:** polling/sync (e.g. `SyncStatus`) must pause when `document.visibilityState === "hidden"` and
use `navigator.onLine`/the `online` event as the primary reconnect signal. Raster images use `next/image`.
Page components show a `LoadingSkeleton` during async fetches, never a plain "Loading..." string.

**Error handling:** user-visible errors render in a `role="alert"` element, never raw API error text — wrap
with `error instanceof Error ? error.message : "Something went wrong"`. Silent `console.error`-only failure is
acceptable only for non-critical background ops (SW registration, offline cache writes); anything blocking a
user task needs an error + retry. Never silently swallow promise rejections — fire-and-forget `void` calls need
a `.catch()` or must genuinely be background work.

**Testing:** every new `components/ui/` component ships a Vitest + RTL test (renders, key states, accessible
roles). Every new `lib/` utility ships a unit test. Tests live next to the file (`foo.ts` → `foo.test.ts`).
Don't mock `fetch` globally — use a typed test double or MSW. No snapshot tests.

**Git/commits:** commit messages are `<scope>: <what changed>`, lowercase (e.g. `dashboard: replace semantic
classes with Tailwind tokens`). Don't commit `.env`, `.env.local`, `api/api` (binary), `api/.cache/`, `web/.next/`.

**What not to do:** no new npm packages without justification + pinned exact versions; no new Go packages
(`go get`) without approval; no `console.log` in production paths; no `window.location.reload()` as a retry
mechanism (re-fetch instead); no `innerHTML`/`dangerouslySetInnerHTML`/`eval`; no feature flags, A/B test
infra, or analytics without approval.
