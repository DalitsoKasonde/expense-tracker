# Chuma UI Redesign — Detailed Implementation Plan

Branch: `chuma-redesign` (off `main`). Checkpoint commit made before any redesign work.

## 0. Decisions locked in (from review)

| # | Decision |
|---|----------|
| 1 | Safety checkpoint committed; all redesign work on `chuma-redesign`. |
| 2 | **Canonical reference:** on-disk `stitch_untitled_project/` (blue "Inscribed" set — primary `#264E86`, sky `#0074E4`, ice canvas `#F4F8FC`, Quicksand). Used for layout, density, card hierarchy. The deleted teal `modernization_refresh` set is NOT used (wrong palette; remains in git history). |
| 3 | **Styling:** migrate components to **Tailwind utilities** driven by CSS-variable tokens. Retire the 1,690-line semantic-class `globals.css` incrementally. |
| 4 | **Backend:** plan-v2 API is still changing. Build UI against current shapes, isolated behind adapters so API churn touches one layer. |
| 5 | **Tooling:** add ESLint + Vitest + React Testing Library (the assumed "test baseline" did not exist). |
| 6 | **Currency:** multi-currency. Investments may be denominated in other currencies; format each value in its own currency and never sum across currencies blindly. |
| 7 | **Logo:** user supplies later. Until then, render a text "Chuma" wordmark; drop the "Great Vibes" accent font and "Engineered for Creativity" tagline. |
| 8 | **Information architecture:** Chuma is organized around accounting concepts (Expense/Income/Saving/Borrowed/Debt payment/Investment) instead of everyday actions. Reorganize copy and flows around what the user is doing, without removing functionality. See §6a, §7a, §8a–c. |
| 9 | **Navigation:** unify mobile and desktop around one 5-item structure — Home, Activity, Add, Portfolio, More — instead of today's diverging sets (mobile has no Loans; desktop does; Settings link target differs between the two). "More" holds configuration/secondary screens (Loans, Goals, Reports, Imports, Settings) so they stop competing with daily-use destinations. Supersedes the nav item list in the original §4. |
| 10 | **Dashboard order amended:** "items needing attention" moves from last to third, ahead of recent activity. This **supersedes** the originally locked mobile above-the-fold order in §6 — the two were in direct conflict and #10 is the resolution. |
| 11 | **Onboarding replaces auto-create:** instead of silently creating three fixed `ZMW` accounts, ask currency, account locations, opening balances, and whether the user has loans/stocks/bonds, then hand off to a checklist. See §7a. |
| 12 | **Investment quick-add unifies with asset/bond creation:** the "I bought an investment" flow should let a user select-or-create a stock and add a bond inline, without leaving the dialog. See §8a. |
| 13 | **Portfolio trend chart:** the current chart fabricates data points from a hardcoded multiplier array scaled by current value — it is not a time series. Remove or replace it now (frontend-only); treat "plot real historical valuations" as a **separate, backend-inclusive** follow-up (see §8b), not part of this redesign's cost estimate. |
| 14 | **Self-service sign-up:** already functionally implemented end-to-end in the working tree (uncommitted). Scope here is hardening + doc correction, not building it from scratch. See §11. |

## 1. Brand & naming cleanup

Strip every "Inscribed" trace and decorative branding:

- `components/sidebar-nav.tsx`: brand mark `I`, `sidebarAppName` "Inscribed", `sidebarAppPulse` "Engineered for Creativity" → Chuma wordmark.
- `tailwind.config.ts`: `fontFamily.accent` (cursive / Great Vibes) → removed or repurposed.
- `app/layout.tsx`, `app/manifest.ts`: app name/title/short_name, theme-color, icons → Chuma.
- `app/globals.css`: any `--font-accent`, Great Vibes `@font-face`/import, and Inscribed-specific tokens.
- `README.md` and `public/` icons (`icon.svg`, `mask-icon.svg`, `manifest`) when the logo arrives.
- Grep sweep for `Inscribed`, `Great Vibes`, `accent`, `Engineered for Creativity` to confirm none remain.

## 2. Tooling (Phase 1 — partially done)

Done:
- Dev deps installed (pinned): `eslint@9.39.1`, `eslint-config-next@16.2.9`, `vitest@4.1.9`, `@vitest/coverage-v8@4.1.9`, `@vitejs/plugin-react@6.0.2`, `jsdom@29.1.1`, `@testing-library/react@16.3.2`, `@testing-library/jest-dom@6.9.1`, `@testing-library/user-event@14.6.1`.
- `eslint.config.mjs` (flat config, extends `next/core-web-vitals` + `next/typescript`).
- `vitest.config.ts` (jsdom, globals, `@`→root alias, coverage v8) + `vitest.setup.ts` (jest-dom matchers + cleanup).

Remaining:
- Add `web/package.json` scripts: `lint` (`eslint .`), `lint:fix`, `test` (`vitest run`), `test:watch` (`vitest`), `test:cov` (`vitest run --coverage`).
- Verify `@eslint/eslintrc` resolves for `FlatCompat`; add if missing.
- Run `npm run lint` on the existing tree, fix or scope-ignore legitimate errors so the baseline is green.
- Write one smoke test to prove the harness runs (e.g., render a trivial component).
- Wire CI (`.github/workflows/ci.yml` web job): add `npm run lint` and `npm run test` after `typecheck`.
- Re-verify: `lint`, `typecheck`, `test`, `build` all green; commit.

## 3. Chuma design system on Tailwind (Phase 1)

Token layer in `globals.css` under `:root` (light) and `.dark` / `[data-theme="dark"]` (dark), keeping the existing theme-toggle mechanism (`preference-theme-sync.tsx`):

- **Surfaces:** `--background` (ice `#F4F8FC` light), `--surface` (white), `--surface-soft`, `--surface-raised`; dark equivalents (deep navy canvas, slightly lifted cards).
- **Primary:** `--primary #264E86`, `--primary-strong`, `--primary-soft`, `--primary-softer`; sky accent `#0074E4` for focus/interactive/data highlights.
- **Text:** `--on-surface` (midnight `#181A2A`), `--on-surface-soft`.
- **Outline:** `--outline`, `--outline-strong` (`#E2E8F0`-style hairlines).
- **Financial semantics (new):** `--income`/`--positive`, `--expense`/`--negative`, `--savings`, `--investment`, plus `--warning`. Each needs a readable text shade and a tinted background (~10% opacity) for chips/badges in both themes.
- **Typography:** Quicksand (display/body) via `next/font`; tabular figures for money. Type scale from DESIGN.md (display-lg 48, headline 32/24, body 18/16, label 14/12).
- **Radii:** cards 16px (`--radius-lg`), controls 10px (`--radius-md`), chips 4px (`--radius-sm`), `--radius-pill`.
- **Shadows:** soft micro-shadows (`--shadow-sm` 2px/3%, `--shadow-md` indigo-tinted for overlays).
- **Spacing/layout:** 4px baseline; desktop max-width ~1280px; desktop margins ~64px, mobile 16px; 24px gutters.

Expose all tokens through `tailwind.config.ts` (extend `colors`, `fontFamily`, `borderRadius`, `boxShadow`, `maxWidth`) so components use utilities like `bg-surface`, `text-on-surface`, `text-income`, `rounded-lg`, `shadow-sm`. Add `darkMode: ["class"]` (or `["selector"]`) aligned to the current toggle.

**Standard states** as reusable primitives (see §5): loading skeletons, empty states, inline error + retry, offline banner (tie to existing `sync-status.tsx` / `offline-db.ts`). `prefers-reduced-motion` respected in all animations.

## 4. Application shell (Phase 1)

Files: `app/(app)/layout.tsx`, `components/sidebar-nav.tsx`, `components/bottom-nav.tsx`, `components/nav-icons.tsx`, `components/sign-out-button.tsx`.

**Nav item set (revised per decision #9)** — one shared structure for mobile and desktop, replacing the current divergence (today: mobile has 5 items with no Loans and links Settings to `/settings`; desktop has 6 items including Loans and links Settings to `/settings/preferences`):

- **Home** (`/today`), **Activity** (`/transactions`), **Add** (`/add`, emphasized), **Portfolio** (`/investments`), **More**.
- **More** is a single destination (sheet/menu on mobile, expandable section or dedicated page on desktop) containing: Loans, Goals, Reports, Imports, Settings. These are configuration/periodic screens and shouldn't compete with the four everyday destinations.
- Both nav targets for a given label must resolve identically on mobile and desktop (fix the Settings-target mismatch as part of this work, not as a separate bug).

Remaining shell details (unchanged from original plan):
- **Desktop sidebar (permanent):** Chuma wordmark; compact active state (sky/indigo tint + indicator); user block (name/email) + sign-out at bottom. Tailwind-only; remove `sidebarNav`/`sidebarBrand*` CSS classes.
- **Mobile bottom nav:** the five destinations above, with Add as a prominent central quick-add (FAB-style). Min 44px touch targets. Replaces `bottomNav`/`floatingAddButton` classes.
- **Responsive container:** sidebar visible ≥ `lg`, bottom nav < `lg`; main content max-width + responsive padding.
- **Preserve behavior (critical):**
  - Auth gating + server-side accounts fetch → `/onboarding` redirect in `layout.tsx` stays intact.
  - PWA: keep `service-worker-register.tsx`, `public/sw.js`. **Bump the SW cache version / asset list** so the restyle doesn't serve stale CSS/JS offline. Verify offline still loads the shell.
- Tests: active-route highlighting, quick-add link target, sign-out handler, nav renders all destinations (including that Loans/Goals/Reports/Imports/Settings are reachable via More on both breakpoints).

## 5. Reusable components (Phase 1–2)

New `components/ui/` (Tailwind, themed, accessible, unit-tested):

| Component | Key props / behavior |
|-----------|----------------------|
| `PageHeader` | title, subtitle, actions slot. Replaces `app-page-header.tsx`. |
| `AccountCard` | account name/type, balance (per-currency formatting), primary variant = restrained blue gradient; others = flat surface. |
| `MetricCard` | label, value, delta (+/- with `--positive`/`--negative`), optional sparkline slot, financial-semantic accent. |
| `TransactionRow` | date, category/note, signed amount colored by entry kind, pending badge (offline). 16px row padding, dividers. |
| `TransactionFilters` | date range, account, category; controlled; emits filter state. |
| `SavingsGoalCard` | goal name, current/target, progress bar, percent, currency-aware. |
| `ChartCard` | title + chart slot + **accessible text summary** (sr-only table/description). |
| `EmptyState` | icon, title, description, optional CTA. |
| `LoadingSkeleton` | shimmer blocks honoring reduced-motion. |
| `ConfirmationDialog` / `FormDialog` | accessible modal (focus trap, Esc, labelled), confirm/cancel; FormDialog wraps form submission + validation/error display. |

Each ships with a focused Vitest + RTL test (render, key states, a11y roles).

## 6. Dashboard redesign — `/today` (Phase 1)

Data sources: `lib/use-unified-dashboard.ts` (`UnifiedDashboardData`: income/expense/saving/investment, netWorth, `accountBalances[]`, `assets[]`, cashBalance, etc.) + `today/page.tsx` fetches `/v1/transactions?limit=5` and insights.

**Mobile above-the-fold order (revised per decision #10 — supersedes the original order):**
1. Money available + money in/out this month (hero `MetricCard`s from `cashBalance`/`netCashFlow`/`income`/`expense`).
2. Prominent Add entry action.
3. **Items needing attention** (`insights?.alerts`, currently rendered last in `today/page.tsx` — move up). Empty state if nothing needs attention, not an omitted section.
4. Recent transactions (`TransactionRow` list + link to History).
5. Account summaries (`AccountCard` from `accountBalances[]`; primary gradient card).
6. Savings goals (`SavingsGoalCard` from savings groups — see §7).
7. Income-vs-expense chart (`ChartCard`).

**Desktop:** responsive grid (hero metrics + attention row; two-column accounts + recent; goals + chart), max-width 1280, 64px margins. **Mobile:** single-column stack in the order above.

Multi-currency: account/asset values formatted in their own `currency`; don't sum mixed currencies — group or label instead.

## 6a. Add Entry simplification (Phase 1–2)

`add-entry-dialog.tsx` already branches conditionally by `entryKind` (Loan fields, Destination fields, Investment fields, Category chips) — this is a reordering and relabeling pass, not a rebuild.

- **Ask what happened first.** Move the entry-type selector above the amount field (currently amount renders first, `quickAddAmountBlock` before the type section). Once a type is picked, show only the fields relevant to it — the conditional sections already exist; just gate the amount/detail fields behind the type choice instead of showing everything at once.
- **Relabel the six entry types** with action language:
  - `expense_living` "Expense" → **"I spent money"**
  - `income_earned` "Income" → **"I received money"**
  - `saving_transfer` "Saving" → **"I moved money to savings"**
  - `income_borrowed` "Borrowed" → **"I took a loan"**
  - `debt_principal_payment` "Debt payment" → **"I paid a loan"**
  - `investment_buy` "Investment" → **"I bought an investment"**
- Keep the underlying `entryKind` values unchanged (API contract) — this is a display-label change plus a field-ordering change, not a data-model change.
- Test: type-first flow renders only the relevant fields per kind; existing submit/validation logic is unaffected.

## 7. Supporting features / data wiring (Phase 2)

- **Account cards** ← `accountBalances[]` (already in unified dashboard).
- **Savings goals** ← savings groups API (`api/internal/httpapi/savings_groups.go`, untracked/in-flight). Behind an adapter; if shape isn't final, map defensively and degrade to empty state.
- **Transaction filters** ← date/account/category against `/v1/transactions` query params (confirm supported params; aggregate client-side only where the API can't filter).
- **Dashboard aggregation:** prefer server values from unified dashboard; add client aggregation only where APIs are insufficient, isolated in hooks.
- **Currency formatting util:** central `formatMoney(amountMinor, currency)` (Intl.NumberFormat), tabular figures; replace the hardcoded `ZMW` default in `use-unified-dashboard.ts` with per-value currency and a user-preference default (preferences system exists).

## 7a. Guided first-run onboarding (Phase 2–3)

`app/onboarding/page.tsx` currently has one interaction — a "Get Started" button — that POSTs three hardcoded accounts (`Cash`, `Mobile Money`, `Bank`, all `currency: "ZMW"`) with no user input at all.

Replace with a short guided flow:
1. **Currency** — write to the existing user-preference currency setting (`use-user-currency.ts` / settings/preferences already support arbitrary currencies; onboarding just needs to call that same preference write before/while creating accounts, not invent new storage).
2. **Where do you keep money?** — let the user name and type their own accounts instead of accepting three fixed ones (reuse the account-create endpoint already used by `settings/accounts`).
3. **Current balances** — optional opening balance per account created.
4. **Existing loans, stocks, or bonds?** — branch into the loan-create and investment-add flows if yes; skip cleanly if no.
5. End with a checklist ("Add first transaction", "Add first investment") rather than dropping the user straight into `/today` with no follow-up prompt.
- Test: onboarding no longer silently creates fixed accounts; each step's data lands via the real create endpoints (accounts, preferences, loans/assets), not a one-shot default payload.

## 8. Apply Chuma across all screens (Phase 2–3)

Routes (from build manifest, 25 total):
- **Phase 2:** `/transactions`, `/add`, `/investments`, `/investments/add`, `/investments/[assetId]`, `/reports`.
- **Phase 3:** `/import`, `/import/new`, `/import/[id]`, `/import/[id]/preview`; `/settings` + sections (`accounts`, `businesses`, `categories`, `income-sources`, `preferences`, `loans`, `savings-groups`) and `settings/layout.tsx` + `settings-nav.tsx`; `(auth)/login`, `(auth)/register`, `onboarding`.

Each screen: swap semantic classes for Tailwind + shared components; wire loading/empty/error/offline; verify per-currency formatting (esp. investments). Retire `globals.css` sections as screens migrate; delete the file once empty.

## 8a. Unify investment quick-add (Phase 2)

Today, `add-entry-dialog.tsx`'s `investment_buy` branch only offers a `<select>` of existing assets; if none exist it links out to "Create an asset first" on `/investments`, and bonds aren't reachable from quick-add at all — bond creation only exists on the standalone `/investments/add` page (`createBond()` → `POST /v1/bonds`).

- Add "select existing or create new" inline to the `investment_buy` section — reuse the same asset-create call `/investments/add` already makes, surfaced as an inline combobox-with-create instead of a redirect.
- Add a bond path inline (reuse the existing `POST /v1/bonds` call from `investments/add/page.tsx`) so "I bought an investment" covers stocks and bonds without leaving the dialog.
- No backend changes expected — both endpoints already exist and are proven working from the standalone page; this is a frontend consolidation.

## 8b. Portfolio trend chart — remove fabricated data (Phase 2)

`chartPoints` in `investments/page.tsx` synthesizes a fixed 6-point curve (`[0.55, 0.62, 0.68, 0.74, 0.88, 1]` multipliers scaled by current portfolio value) — it is not derived from any stored time series, and is misleading in financial software.

- **Now (in scope for this redesign):** remove the fabricated chart, or replace it with a fact-based comparison the data already supports (e.g., current value vs. invested cost, which the portfolio page already computes).
- **Separately (out of scope for this redesign — flag as follow-up):** a real historical trend needs backend work first — `AssetValuationStore` (`api/internal/store/asset_valuations.go`) currently only has `Upsert`, no list/history method, and there's no API route to fetch valuations over time. Don't estimate this alongside the copy/layout work in §8; it's a distinct backend-inclusive item.

## 8c. Actionable language pass (Phase 2–3)

Replace descriptive/editorial copy with copy that states a fact or implies an action. Known instances (`investments/page.tsx`):
- `accent="Measured for the long view"` (Portfolio page tagline) → e.g. **"Your largest holding"** or a real summary metric.
- `"Editorial read"` kicker over "What deserves attention next" → e.g. **"Upcoming bond payment"**, **"Spending increased this month"**, **"Add today's transactions"** — whichever is actually true for the user's data, not a static label.
- Sweep the rest of Phase 2–3 screens for similar tone-over-substance copy as they're migrated (§8); this is a per-screen check, not a one-time grep — new copy should default to naming a fact or an action, not a mood.

## 9. Responsive + accessibility pass (Phase 3)

- Breakpoints: phone / tablet / laptop / wide. Verify shell switch and grid reflow.
- Keyboard nav + visible focus rings (sky `#0074E4`); logical tab order; focus-trapped dialogs.
- Screen-reader: landmarks (`nav`/`main`), labelled controls, sr-only chart summaries.
- Touch targets ≥ 44px; reduced-motion; WCAG AA contrast in both themes (check financial colors on tinted backgrounds).

## 10. Verification (Phase 3 / ongoing)

Per-phase and final:
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` — all green.
- `go build ./...` + `go vet ./...` green (no API regressions from UI work).
- Manual flows: authenticated + unauthenticated (redirects), onboarding redirect, sign-out, **sign-up** (see §11).
- States: loading, empty, offline (PWA), form validation, API error.
- Widths: mobile / tablet / laptop / wide.
- Commit per phase with green checks; keep diffs reviewable.

## 11. Self-service sign-up (Phase 2–3, backend-leaning)

The core flow already exists in the working tree (uncommitted): `register-form.tsx` → `POST /v1/auth/register` (`server.go` `s.register`) → validates + checks for a duplicate email → `auth.HashPassword` (bcrypt) → `UserStore.CreateInvitedUser` (despite the name, this is a general create-user call, not invite-gated) → JWT issued → cookie set → auto sign-in → `/today`. `users` table already supports it (`email`, `password_hash`, `role` constrained to `admin`/`member`, `is_active`). There is no invite-token concept anywhere in the codebase — the README's "invite-only" section (currently "Invite-only auth means users cannot self-register...") is stale and describes behavior the code no longer has.

Remaining work before treating this as shippable, roughly in order:
1. **README correction** — rewrite the "Bootstrap admin" / invite-only section to describe the real flow: bootstrap credentials create the *first* admin only; everyone else self-registers via `/register`.
2. **Server-side password policy** — currently only the frontend checks password match; no length/complexity check exists server-side in `s.register`.
3. **Dedicated rate limiting for `/v1/auth/register`** — currently shares the generic `authLimiter` (10 req/5min) with login; if this is publicly reachable, registration abuse (mass account creation) deserves its own limit or a CAPTCHA.
4. **Email verification** — none exists; accounts are active and logged-in immediately on registration. Decide whether that's acceptable for this app's threat model (personal/small-group finance tool) or whether a verification step is required before exposing sign-up publicly.
5. **Role/permissions review** — all self-registered users get `role: 'member'`; confirm that's the correct default before opening registration beyond a trusted circle, since `member` vs `admin` capabilities haven't been audited here.
6. **Deployment env docs** — update `.env.example`/README to clarify `ADMIN_BOOTSTRAP_EMAIL`/`ADMIN_BOOTSTRAP_PASSWORD` are now only for seeding the very first admin, not the only way to get an account.

This is lower risk than the UI passes above (no visual/nav rework needed) but should land before or alongside Phase 2, since README/docs currently misrepresent already-shipped-in-working-tree behavior.

## Rollout

- **Phase 1:** tooling, design system + tokens, shell (incl. unified 5-item nav, §4), core reusable components, dashboard (incl. revised attention-first order, §6), Add Entry type-first reorder + relabel (§6a).
- **Phase 2:** transactions, add-entry, portfolio (+ asset detail/create, unified quick-add §8a, fabricated-chart removal §8b), reports, data wiring, multi-currency util, guided onboarding (§7a), sign-up hardening (§11).
- **Phase 3:** import, settings (all sections), auth, onboarding; actionable-language sweep (§8c); full a11y + responsive + final verification; retire `globals.css`; integrate uploaded logo.

## Risks & mitigations

- **In-flight plan-v2 backend** → adapter layer isolates API churn; defensive mapping + empty states.
- **globals.css ↔ Tailwind dual system during migration** → migrate screen-by-screen, delete CSS as you go, lint to catch leftover classes.
- **SW stale cache after restyle** → bump cache version + verify offline load.
- **Multi-currency mis-summing** → never aggregate across currencies; format per value; central util.
- **No prior tests** → harness + smoke test first, then component tests as built.
- **Logo pending** → text wordmark placeholder; single swap point when asset arrives.
- **Dashboard order conflict** → resolved via decision #10; don't let §6 and any older references drift out of sync again.
- **Fabricated portfolio chart** → remove/replace now (§8b); don't let "build real history" scope-creep into this redesign — it needs its own backend work (store + API route).
- **Open self-service sign-up** → currently no rate-limit dedicated to registration, no email verification, no server-side password policy; don't treat §11 item 1 (README fix) as sufficient on its own if registration is exposed publicly before items 2–5 land.
