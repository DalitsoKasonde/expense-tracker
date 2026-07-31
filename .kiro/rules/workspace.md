# Expenses workspace rules

These rules apply to every file in this repo. Follow them before proposing or writing any code.

---

## Architecture

- **Web:** Next.js App Router, React 19, TypeScript strict, Tailwind 3. All new pages and components are server components by default; add `"use client"` only when the component needs browser APIs, event handlers, or React hooks.
- **API:** Go + chi + pgx. No ORM. SQL is written by hand in store files. No new packages without explicit approval.
- **Database:** PostgreSQL. Every schema change is a numbered migration in `api/migrations/`. Migrations must include matching `.up.sql` and `.down.sql` files.
- **Offline:** IndexedDB via `lib/offline-db.ts`. The DB handle should be opened once and reused, not re-opened on every call.

---

## Naming and file layout

- Web components live in `components/` (shared, cross-app) or `components/ui/` (design-system primitives).
- Page-specific helpers stay in the page file until reused in two or more places, then move to `lib/` or `components/`.
- `lib/` is for pure logic, hooks, and adapters. No JSX in `lib/`.
- File names: `kebab-case.ts` / `kebab-case.tsx`. No `PascalCase` filenames.
- Barrel `index.ts` files are allowed only in `components/ui/`. Everywhere else, import the file directly.

---

## TypeScript

- `strict: true` is always on. Never disable it.
- `as any` is banned. Use proper generics, type narrowing, or `unknown` with a guard.
- `as unknown as T` double-cast is banned unless the function's contract explicitly states it returns an opaque shell type.
- Never use `@ts-ignore` or `@ts-expect-error` without a comment explaining why the type system cannot handle it correctly.
- Prefer `type` over `interface` for plain data shapes. Use `interface` for objects that are extended or implemented.

---

## React and Next.js

- Data-fetch effects must use the `apiCallRef` pattern to avoid stale-closure re-fires:
  ```ts
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;
  // use apiCallRef.current inside the effect
  ```
- Every `useEffect` that fetches data must include an `ignore` flag and clean up with `return () => { ignore = true; }`.
- Every data-fetch effect must guard on `session?.accessToken` at the top and bail early if absent.
- `useMemo` and `useCallback` are for genuinely expensive operations or stable references passed as props. Don't wrap simple expressions.
- Multiple `useMemo` calls that iterate the same array should be collapsed into a single pass. O(n²) patterns (`.find()` inside `.map()`) are not acceptable.

---

## Currency and money

- All monetary amounts in the API and database are stored as **minor units** (integers, e.g. ngwee for ZMW, cents for USD). Never store floats in the DB.
- All display formatting goes through `lib/format-money.ts → formatMoney(amountMinor, currency)`. No local `formatMoney` duplicates in page files.
- The string `"ZMW"` must not appear as a hardcoded default in more than one place. The canonical fallback is resolved by `useUserCurrency()` (reads `/v1/user/preferences`, falls back to `"ZMW"`). Every screen that shows a monetary value must use this hook or receive currency as a prop.
- Never sum monetary values across different currencies. Group by currency or display each separately.

---

## Design system and styling

- All visual styles are Tailwind utility classes driven by CSS-variable tokens defined in `globals.css`.
- The token names (`bg-surface`, `text-on-surface`, `text-income`, `rounded-lg`, etc.) are the only interface between design and code. Never hardcode hex colors, pixel values, or `rgba()` in JSX or component files — use `var(--token-name)` or the Tailwind alias.
- Charts must reference CSS variables (`var(--income)`, `var(--primary)`, etc.) so they adapt to dark mode.
- Dark mode is toggled via `.dark` class on `<html>`. Token values change under `.dark {}` in `globals.css`. No hardcoded light/dark conditionals in components.
- `globals.css` semantic classes (e.g. `sidebarNav`, `bottomNav`) are being retired. Do not add new semantic classes. Migrate existing ones to Tailwind utilities as you touch each file.

---

## Accessibility

- Every `<input>`, `<select>`, and `<textarea>` must have a matching `<label htmlFor="...">` with a corresponding `id`. No unlabelled form controls.
- Interactive elements (buttons, links) must have visible focus styles and a minimum 44×44 px touch target.
- Decorative elements use `aria-hidden="true"`. Functional icons have an `aria-label` on their wrapping button/link.
- Charts must include a visually-hidden (`sr-only`) text summary of the data they display.
- `role="alert"` on error messages; `role="status"` on live status updates (e.g. sync banner).

---

## Performance

- `SyncStatus` (and any polling) must pause when `document.visibilityState === "hidden"`. Use `navigator.onLine` and the `online` browser event as the primary reconnection signal; hit the server only to confirm.
- The `offline-db.ts` `initDb()` must be called once; cache the resolved `IDBDatabase` or the open `Promise` at module scope and reuse it.
- Images and SVG assets in `public/` must be optimised before commit. Use `next/image` for all raster images.
- Page components must render a `LoadingSkeleton` during async data fetches, never a plain text "Loading..." string.

---

## Error handling

- User-visible errors go in a `role="alert"` element. Never surface raw API error text directly — wrap it: `error instanceof Error ? error.message : "Something went wrong"`.
- Silent failure (`console.error` without user feedback) is acceptable **only** for non-critical background operations (SW registration, offline cache writes). Any failure that prevents the user from completing a task must show an error and a retry action.
- Never swallow promise rejections silently. All `void somePromise()` calls must either be fire-and-forget background work or have a `.catch()`.

---

## Testing

- Every new component in `components/ui/` ships with a focused Vitest + RTL test covering: renders without crashing, key states (loading, empty, error), and primary accessible roles.
- Every new `lib/` utility ships with a unit test.
- Tests live next to the file they test: `foo.ts` → `foo.test.ts`.
- Tests must not mock `fetch` globally — use a typed test double or MSW.
- No snapshot tests. Assert on rendered text, roles, and attributes.

---

## Git and CI

- Never commit directly to `main`. Work on a feature branch.
- Every commit must leave the branch green: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `go build ./...`, `go vet ./...`.
- Do not commit `.env`, `.env.local`, `api/api` (binary), or any file in `api/.cache/` or `web/.next/`. These are already gitignored; verify before staging.
- Commit messages: `<scope>: <what changed>` in lowercase. Example: `dashboard: replace semantic classes with Tailwind tokens`.

---

## What not to do

- Do not install new npm packages without justification and pinned exact versions.
- Do not add new Go packages (`go get`) without explicit approval.
- Do not add `console.log` in production paths. Use `console.error` only for genuinely exceptional failures.
- Do not use `window.location.reload()` as a retry mechanism. Re-fetch the data.
- Do not use `innerHTML`, `dangerouslySetInnerHTML`, or `eval` anywhere.
- Do not add feature flags, A/B test infrastructure, or analytics without approval.
