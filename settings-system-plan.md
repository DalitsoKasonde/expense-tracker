# Corrected Settings System Plan

## Goal

Replace the current placeholder settings experience with a real configuration system that matches the existing codebase and data model.

The plan below is intentionally rebased on the current repo state:

- Next.js App Router frontend under `web/app/(app)/...`
- Go API with existing CRUD for accounts, categories, income sources, businesses, and investment types
- Existing PostgreSQL migrations through `016_*`
- Existing onboarding, add-transaction, and auth flows

## Current State

### Already implemented

- Auth exists via NextAuth credentials + Go login API
- Account CRUD exists
- Category CRUD exists
- Income source CRUD exists
- Business CRUD exists
- Investment type CRUD exists
- Settings page exists, but is still a stub
- `/add` already posts transactions, but does not yet use configurable settings data fully

### Already known mismatches

- Categories require `category_group` in the database, but current handlers/stores ignore it
- Investment types require `code` and `model_kind` in the database, but current handlers/stores only use `name`
- Account delete is a hard delete, but transactions reference accounts with `on delete restrict`
- Import undo is incomplete and cannot yet fully reverse created transactions
- There is no `user_preferences` table yet
- There is no safe account-security flow for verified email change
- There is no savings-goal model yet

## Product Scope

## Phase 1 Settings MVP

Ship in the first settings pass:

- Preferences
  - Currency
  - Theme
  - Notifications toggle placeholder or local preference flag
- Accounts
  - List, create, edit
  - Archive or guarded delete behavior
- Categories
  - List, create, edit
  - Subcategory support
- Income Sources
  - List, create, edit, delete
- Businesses
  - List, create, edit, delete
- Investment Types
  - List, create, edit, delete
- Account
  - Profile summary
  - Password change
- Data
  - Export data as JSON

## Phase 2 or later

Do not block Phase 1 on these:

- Verified email change by email token
- Full account-and-all-data deletion UX
- Savings goals with target tracking
- Rich notification delivery settings
- Separate business dashboard

## Why these deferrals

- Email verification needs delivery infrastructure that the app does not currently have.
- Full destructive account deletion needs a safer archival/deactivation design first.
- Savings goals should be built after transfer semantics are settled, otherwise `current_amount` will drift.

## Corrected Architecture Decisions

## 1. Settings should manage all existing financial dimensions

The original plan missed two important resource types already supported by the app:

- `income_sources`
- `businesses`

They must be first-class settings sections because:

- the product supports multiple income sources
- business-linked expenses are already part of the transaction model

## 2. Settings routes should match App Router structure

Do not plan around old-style page files like:

- `/settings/accounts.tsx`

Use App Router subroutes instead:

- `web/app/(app)/settings/page.tsx`
- `web/app/(app)/settings/accounts/page.tsx`
- `web/app/(app)/settings/categories/page.tsx`
- `web/app/(app)/settings/income-sources/page.tsx`
- `web/app/(app)/settings/businesses/page.tsx`
- `web/app/(app)/settings/investments/page.tsx`
- `web/app/(app)/settings/preferences/page.tsx`
- `web/app/(app)/settings/account/page.tsx`
- `web/app/(app)/settings/data/page.tsx`

## 3. API updates should preserve current route conventions

The current API already uses:

- `GET`
- `POST`
- `PATCH`
- `DELETE`

Do not introduce `PUT` just for settings if the rest of the API uses `PATCH`.

## 4. Account deletion must be safe

Do not expose raw delete for accounts that already have transactions.

Preferred Phase 1 behavior:

- Add `is_active` or `archived_at` to accounts
- Replace hard delete with archive for in-use accounts
- Only allow hard delete for empty accounts if still desired

## 5. Savings goals should not store mutable truth casually

Do not implement savings goals by incrementing `current_amount` in place on each transfer unless every update, delete, import, and undo path is reconciled too.

Preferred design:

- store `target_amount`, `target_date`, `account_id`, and metadata
- derive current saved amount from qualifying transactions or account balances
- if cached summaries are needed later, build them as derived projections

## 6. Investment types need schema reconciliation first

The table already requires:

- `name`
- `code`
- `model_kind`
- `is_system`

So the settings UI and API should manage at least:

- `name`
- `code`
- `model_kind`

Do not introduce `risk_level` unless there is a real reporting or UX use for it.

## 7. Category subcategories need a real schema migration

Subcategories are still worth doing, but they require:

- `parent_id`
- preserved `category_group`
- cycle prevention
- delete rules for parent categories

Preferred Phase 1 behavior:

- add `parent_id uuid null references categories(id) on delete set null`
- keep `category_group`
- represent categories as a flat list with `parent_id`
- build tree rendering on the frontend

## Corrected Delivery Plan

## Task Group A: Reconcile schema and stores first

### Task A1: Add preferences and account-management tables

Create new migrations after `016_*`:

- `017_user_preferences.up.sql`
- `018_password_changes.up.sql`
- `019_email_change_requests.up.sql`

`user_preferences` should include:

- `user_id` primary key
- `default_currency`
- `theme`
- `notifications_enabled`
- `created_at`
- `updated_at`

`password_changes` should be audit-only:

- `id`
- `user_id`
- `changed_at`
- optional metadata like `changed_by_ip` later

`email_change_requests` should be added only if we want to reserve schema now.
If no mail verification is coming immediately, this can be deferred to Phase 2.

### Task A2: Fix category schema for subcategories

Add migration:

- `020_category_hierarchy.up.sql`

Changes:

- add `parent_id uuid null references categories(id) on delete set null`
- add index on `(user_id, parent_id)`
- keep `category_group`

Update store methods to read and write:

- `name`
- `category_group`
- `parent_id`

Add validation rules:

- category cannot parent itself
- child and parent must belong to same user
- no simple cycles

### Task A3: Fix investment type store/API to match live schema

Add migration only if needed for defaults or soft-delete/archive fields.

Update store and handlers to manage:

- `name`
- `code`
- `model_kind`
- `is_system`

Recommended `model_kind` values:

- `stock`
- `bond`
- `crypto`
- `savings_group`
- `patuma`
- `custom`

### Task A4: Make account deletion safe

Add migration:

- `021_account_archival.up.sql`

Changes:

- add `archived_at timestamptz null`

Update account list queries to return active accounts by default.

Update delete behavior:

- if account has transactions, archive instead of hard delete
- if account has no transactions, hard delete is allowed

### Task A5: Decide and stage savings infrastructure

Do not add `savings_goals.current_amount` yet.

If savings goals must start now, add:

- `022_savings_goals.up.sql`

Fields:

- `id`
- `user_id`
- `account_id`
- `name`
- `target_amount`
- `target_date`
- `notes`
- `created_at`
- `updated_at`

Current saved value should be derived at query time.

## Task Group B: Add backend endpoints that match the current architecture

### Task B1: Preferences and profile endpoints

Add:

- `GET /v1/user/preferences`
- `PATCH /v1/user/preferences`
- `GET /v1/user/profile`
- `PATCH /v1/user/password`
- `POST /v1/user/export`

Phase 2:

- `POST /v1/user/email-change/request`
- `POST /v1/user/email-change/confirm`
- `POST /v1/user/data/delete`

### Task B2: Upgrade existing settings-resource endpoints instead of recreating them

Keep and extend existing endpoints:

- `/v1/accounts`
- `/v1/categories`
- `/v1/income-sources`
- `/v1/businesses`
- `/v1/investment-types`

Required upgrades:

- better validation
- clearer error messages
- archive-aware account delete
- subcategory-aware category payloads
- full investment-type payloads

### Task B3: Add optional savings endpoint only after model choice is settled

If goals land in Phase 1:

- `GET /v1/savings`
- `POST /v1/savings/goals`
- `PATCH /v1/savings/goals/{id}`
- `DELETE /v1/savings/goals/{id}`

If not, remove savings from the first implementation plan entirely.

## Task Group C: Build the settings UI around real sub-pages

### Task C1: Turn `/settings` into a settings hub

Update:

- `web/app/(app)/settings/page.tsx`

It should become the parent settings hub with tab or side-nav links for:

- Preferences
- Accounts
- Categories
- Income Sources
- Businesses
- Investments
- Account
- Data

### Task C2: Add settings sections as real App Router pages

Create:

- `web/app/(app)/settings/preferences/page.tsx`
- `web/app/(app)/settings/accounts/page.tsx`
- `web/app/(app)/settings/categories/page.tsx`
- `web/app/(app)/settings/income-sources/page.tsx`
- `web/app/(app)/settings/businesses/page.tsx`
- `web/app/(app)/settings/investments/page.tsx`
- `web/app/(app)/settings/account/page.tsx`
- `web/app/(app)/settings/data/page.tsx`

### Task C3: Build reusable settings UI primitives

Create shared components:

- section shell
- list card
- empty state
- inline create/edit form
- destructive action confirmation

Keep styling aligned with the existing mobile-first shell.

## Task Group D: Connect settings data back into the app

### Task D1: Update `/add` to use configurable data

The add form should fetch and display:

- accounts
- categories
- income sources when `entryKind = income`
- businesses optionally
- investment types when `entryKind` is investment-related

For categories:

- show flat list with indentation first
- tree UI is optional later

### Task D2: Apply preferences globally

Preferences should drive:

- default currency in forms and reports
- theme on the document root

Implementation detail:

- load preference in app shell or a client preference provider
- persist theme via API
- avoid local-only theme state drifting from server state

### Task D3: Export data from the backend

`POST /v1/user/export` should return a JSON snapshot of:

- profile
- preferences
- accounts
- categories
- income sources
- businesses
- investment types
- assets
- transactions
- imports if desired

The export should be read-only and safe before any destructive-data feature exists.

## Recommended Build Order

1. Reconcile schema mismatches first
2. Add preferences/profile backend
3. Fix account archival behavior
4. Fix category hierarchy support
5. Fix investment type payload support
6. Build settings hub and sub-pages
7. Add income source and business settings UIs
8. Wire `/add` to dynamic settings data
9. Add export
10. Revisit savings goals only after transfers are modeled safely

## Concrete Acceptance Criteria

### Backend

- Preferences endpoints work for authenticated users
- Account delete archives in-use accounts instead of failing or corrupting data
- Categories support `parent_id` and retain `category_group`
- Investment types support `name`, `code`, and `model_kind`
- Export endpoint returns valid JSON scoped to the authenticated user

### Frontend

- `/settings` is no longer a stub
- All settings sections are navigable from one hub
- Users can manage accounts, categories, income sources, businesses, and investment types
- `/add` reflects configured categories and investment types
- Theme and default currency persist

### Safety

- No destructive user-data deletion ships without explicit confirmation and backend safeguards
- No savings-goal balance is stored in a way that can silently drift from transaction truth

## Suggested First Milestone

If we want the highest-value slice first, implement this milestone before anything else:

1. `user_preferences`
2. settings hub + preferences UI
3. accounts UI with safe archive behavior
4. categories UI with `parent_id`
5. income sources and businesses UI

That would convert settings from placeholder to genuinely useful without taking on the riskiest parts too early.
