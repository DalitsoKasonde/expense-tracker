# Expenses — working notes for agents

Personal finance PWA. `web/` is Next.js 16 + TypeScript + Tailwind; `api/` is Go
(chi, pgx) on PostgreSQL; `api/migrations/` is plain SQL. Built for Zambian use:
ZMW, Airtel/MTN mobile money, LuSE-listed stocks, government bonds.

## Before you claim anything works

```bash
cd web && npm run typecheck && npm run lint && npm test   # lint is --max-warnings=0
cd api && go build ./... && go vet ./... && go test ./...
```

Run both. A change touching only one side still has to leave the other green.
`npm run build` additionally catches what typecheck alone will not.

**Pushing to `main` deploys to production.** CI builds images, pushes to GHCR and
the Deploy workflow fires automatically on success. Commit only when asked, and
say so when a push will deploy.

## Money

Every amount is an integer in **minor units** (ngwee, cents). `formatMoney`
divides by 100 at the edge; nothing else should. Never use floats for money.

**A transaction's currency must equal its account's currency.** Balances match a
transaction to its account on `(id, currency)` — see the balance expressions in
`store/accounts.go`, `unified_dashboard.go`, `savings_pockets.go` and
`savings_groups.go`. A mismatch is not an error anywhere; the entry is simply
stored, listed, and counted toward no balance. Both directions are now guarded
(`accountCurrencyChangeAllowed`, `validateEntryAccountCurrency`) — keep it that
way, and never mix currencies when aggregating.

A bond is carried at principal, so `current value − cost` is structurally zero
for its whole life. Bond return is **coupons received** — cashflows with
`status = 'posted'`, never `projected`.

Transaction fees are **routine, not an edge case**: mobile money charges on most
movements. A fee is recorded as a second linked transaction sharing an
`origin_event_id`, charged to the account in `movementFeeAccountID`.

## Design system

One system governs every route, layered in `web/app/globals.css`: tokens →
primitives → regions. Tailwind is aliased to the same tokens, so a surface built
from utilities and one built from `.card` render identically.

- Recurring objects (cards, buttons, fields, badges, tables) come from
  `web/components/ui`. Tailwind utilities are for **layout only**.
- **Never put a colour in a class string.** All colour lives in `globals.css` as
  tokens. Four palettes exist — default/Sonto × light/dark — and a literal
  breaks three of them.
- Quicksand's digits are **proportional and it ships no `tnum`**, so
  `font-variant-numeric: tabular-nums` alone does nothing. Figures come from
  `--font-numeric`; the two are paired in exactly one rule.
- Prefer `<Money>` for amounts — it owns the sign, tone and tabular figures.
  Adoption is partial (a handful of call sites against ~130 direct `formatMoney`
  calls); migrate what you touch rather than adding new hand-rolled variants.

`components/ui/design-system.test.ts` enforces these. If it fails, the rule is
the point — fix the code, not the test.

## Conventions

- Comments explain **why**, not what. The existing code does this well; match it.
- Tests state intent in their names and cover the failure that motivated them.
  Prefer pure functions extracted from stores/handlers so logic is testable
  without a database (see `summarizeBonds`, `accountCurrencyChangeAllowed`).
- Commit subjects are `scope: imperative summary` (`bonds:`, `add-entry:`,
  `accounts:`). Bodies explain the reasoning, not a file list.
- User-facing changes get a `## Unreleased` line in `CHANGELOG.md`, written as
  what changed for the person using it.
- `*.md` is gitignored by default; shared guidance is explicitly un-ignored. Add
  an exception if you add a doc meant for others.

## Verifying visual work

Tests do not catch a colour that vanishes in dark mode. For anything visual, use
the `verify-themes` skill in `.claude/skills/` — it renders the real compiled CSS
across all four palettes in headless Chrome.

## Watch out for

- `add-entry-dialog.tsx` (~1,580 lines) and `investments/[assetId]/page.tsx`
  (~1,595) are the two files most likely to sprout off-system UI. Extract into
  `components/add-entry/` or `lib/` rather than growing them.
- The service worker precaches `STATIC_ASSETS` in `web/public/sw.js`. Adding a
  large asset there costs every install; existing installs only reclaim space
  when `CACHE_NAME` changes on a version bump.
- Route order in `api/internal/httpapi/server.go`: literal paths must be
  registered before `{param}` routes.
