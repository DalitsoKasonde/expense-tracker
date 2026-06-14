# Expense Tracker Build Plan

## 1. Product Goal

Build a mobile-first personal finance app that makes daily expense capture fast, supports investment tracking, and can import historical Excel data without losing auditability.

Primary success metric:
- A new cash expense can be recorded in under 10 seconds on a phone.

Secondary success metrics:
- Historical Excel data can be imported with preview and undo support.
- Monthly spending, saving, and investment summaries are trustworthy.
- The app remains usable with weak or intermittent connectivity.
- The app is installable and usable as a PWA on mobile devices.

## 2. Product Principles

- Mobile first: optimize for fast capture on a phone before power-user desktop workflows.
- Trust before cleverness: totals, balances, and imports must be explainable.
- Progressive complexity: basic expense logging should stay simple even if investment tracking becomes advanced.
- Safe imports: every imported row must be traceable, reviewable, and reversible.
- Personal terminology: the UI can use friendly labels while the backend keeps normalized ledger types.

## 3. Recommended MVP

Include in MVP:
- Authentication for a single user
- Quick add for income, expense, savings, and investment entries
- Category management
- Account or wallet tracking
- Account balance tracking from day one
- Income source tracking
- Business or activity tagging for income and expenses
- PWA shell with installability
- Dashboard with current month totals
- Transaction list with search and filters
- Excel import with preview, mapping, confirm, and undo
- Basic investment tracking for manual entries
- Configurable currencies with ZMW as the default
- Configurable investment types with strong defaults for stocks and bonds
- Export to CSV or Excel

Defer until after MVP unless already required:
- Push notifications
- Biometric auth
- Multi-user collaboration
- Bank sync
- Advanced portfolio pricing integrations
- Budgeting rules and alerts
- Recurring transactions with complex schedules

## 4. Core User Flows

### Daily expense entry
1. Open app
2. Tap `Add`
3. Enter amount
4. Choose entry type
5. Choose account and category
6. Optionally link the entry to an income source or business
7. Optionally add note and date
8. Save

### Historical import
1. Upload workbook
2. System parses sheets and rows
3. User reviews detected mappings and row previews
4. User fixes unknown categories or types
5. User confirms import
6. System creates transactions tied to an import batch
7. User can undo the batch later

### Investment entry
1. Choose `Investment`
2. Select subtype such as buy, dividend, coupon, or contribution
3. Enter asset-specific fields, driven by the selected investment type
4. Save
5. Dashboard and portfolio summaries update

## 5. Suggested Tech Stack

- Workspace shape: monorepo
- Frontend: Next.js App Router with TypeScript
- Mobile web shell: PWA manifest and service worker
- UI: Tailwind CSS plus a small reusable component system
- Backend API: Go
- Database: PostgreSQL
- Background work: Go workers or a lightweight queue pattern using database-backed jobs
- File storage: local dev storage first, then object storage in production

Why this split:
- Next.js gives a strong mobile web and installable PWA experience.
- Go is a good fit for import processing, validation, and reporting logic.
- PostgreSQL keeps ledger data, import state, and reporting consistent.
- Local development should use an already-installed local PostgreSQL instance through `DATABASE_URL`, not Docker Compose.

## 6. System Architecture

### Frontend responsibilities
- Authentication screens
- Quick-add flows
- Dashboard and reports
- Offline entry queue
- Import upload, preview, and confirmation UI

### Backend responsibilities
- Auth/session validation
- Transaction and investment APIs
- Import parsing and normalization
- Report aggregation
- Audit logging and undo behavior

### Integration pattern
- Frontend calls Go API over JSON
- Frontend stores unsent entries locally while offline
- Sync worker retries queued writes when connectivity returns

## 7. Domain Model

### Main entities
- `users`
- `accounts`
- `categories`
- `income_sources`
- `businesses`
- `transactions`
- `transaction_splits` if you want one entry divided across categories later
- `assets`
- `asset_lots` for buy transactions if cost-basis tracking matters
- `imports`
- `import_rows`
- `import_mappings`
- `sync_events` or `job_runs`

### Transaction shape
Recommended normalized fields:
- `id`
- `user_id`
- `transaction_date`
- `entry_kind` such as `income`, `expense`, `saving_transfer`, `investment_buy`, `investment_income`
- `amount`
- `currency`
- `account_id`
- `category_id`
- `income_source_id` nullable
- `business_id` nullable
- `asset_id` nullable
- `quantity` nullable
- `unit_price` nullable
- `fees` nullable
- `note`
- `source` such as `manual`, `import`, `adjustment`
- `import_id` nullable
- `created_at`
- `updated_at`

### Important modeling decision
Treat savings and investments as movement into tracked accounts or assets, not as expenses. That keeps net worth and cash flow more accurate.

What this means in practice:
- If you move `ZMW 500` from cash into a savings wallet you can access immediately, that is still your money.
- So it should usually be tracked as a transfer into a savings account, not as money lost.
- Reports can still show `amount saved this month` as a friendly summary, without treating it as spending.

### Business and income-source modeling
- Income should be attributable to sources such as salary, freelance work, business revenue, dividends, or gifts.
- Expenses can optionally be linked to a business or activity so you can separate personal and business spending.
- Keep this lightweight at first: this is tagging and reporting, not full double-entry business accounting.

## 8. API Surface

Recommended initial endpoints:
- `POST /auth/login`
- `GET /me`
- `GET /dashboard/summary`
- `GET /transactions`
- `POST /transactions`
- `PATCH /transactions/{id}`
- `DELETE /transactions/{id}`
- `GET /categories`
- `POST /categories`
- `GET /accounts`
- `POST /accounts`
- `GET /income-sources`
- `POST /income-sources`
- `GET /businesses`
- `POST /businesses`
- `GET /assets`
- `POST /assets`
- `POST /imports/excel`
- `GET /imports/{id}`
- `GET /imports/{id}/preview`
- `POST /imports/{id}/confirm`
- `POST /imports/{id}/undo`
- `GET /reports/monthly`

## 9. Frontend Screens

### Mobile navigation
- `Today`
- `Add`
- `Investments`
- `Reports`
- `Settings`

### MVP screens
- Login
- Today dashboard
- Quick add
- Transactions list
- Transaction detail or edit
- Income sources and businesses settings
- Import center
- Import preview and mapping
- Investments summary
- Settings for categories, accounts, and assets

### Desktop support
Desktop should reuse the same data model but can expose denser tables, filters, and import review tools.

## 10. Excel Import Design

### Import states
- `uploaded`
- `parsed`
- `needs_mapping`
- `ready_to_confirm`
- `confirmed`
- `failed`
- `undone`

### Import pipeline
1. Upload workbook
2. Save raw file and metadata
3. Parse sheets and rows
4. Detect template or fallback to guided mode
5. Normalize candidate rows
6. Flag unknown categories, bad dates, and invalid amounts
7. Show preview
8. Confirm and write transactions in a single database transaction
9. Record import batch and row-to-transaction links

### Undo strategy
- `Undo Import` should reverse only transactions created by that import batch.
- Prefer soft deletion or reversal records instead of hard delete if auditability matters.

### Mapping rules
Store mapping rules so later imports become easier:
- Raw label to category
- Raw label to entry kind
- Sheet pattern to parser strategy

## 11. Reporting

MVP reports:
- This month income vs expenses
- This month saved
- Income by source
- Business income vs business expenses
- Spending by category
- Savings rate
- Investment contributions by month
- Recent transaction activity

Post-MVP reports:
- Net worth over time
- Asset allocation
- Dividend and coupon income over time
- Budget vs actual

## 12. Security and Reliability

- Start with email and password or a simple auth provider
- Encrypt secrets and keep database credentials outside the repo
- Validate all uploaded files and size-limit imports
- Use idempotency keys for offline retries to avoid duplicate transactions
- Add audit fields to important write operations

## 13. Delivery Phases

### Phase 0: Foundations
- Goal: runnable skeleton, database ready, auth working, and PWA installable.

Tasks:
- Scaffold a monorepo with `web/` for Next.js 16 + TypeScript and `api/` for Go + `chi` + `pgx`
- Add 12 SQL migrations for `users`, `accounts`, `categories`, `income_sources`, `businesses`, `investment_types`, `assets`, `transactions`, `imports`, `import_rows`, `import_mappings`, and `asset_lots`
- Configure local PostgreSQL usage through `DATABASE_URL`
- Add invite-only NextAuth on the frontend
- Add Go JWT middleware on the API
- Set up manifest, icons, and a minimal service worker for installability
- Build the `BottomNav` component with `Today`, `Add`, `Investments`, `Reports`, and `Settings`
- Add a CI pipeline

Done when:
- Local PostgreSQL is reachable and migrations run clean
- The app is installable on mobile as a PWA
- Login and logout work end-to-end
- `web/` and `api/` both boot locally with documented env vars

### Phase 1: Manual Tracking MVP
- Auth
- Accounts and categories
- Income sources and businesses
- Quick add transaction flow
- Transaction list
- Basic dashboard totals and account balances
- Currency configuration with ZMW default

### Phase 2: Import MVP
- Upload and store workbook
- Parse with `excelize`
- Support the current single-template workbook shape first
- Preview normalized rows
- Mapping UI
- Confirm import
- Undo import

### Phase 3: Investments MVP
- Configurable investment type definitions
- Asset setup
- Stock transaction model
- Bond transaction model
- Investment entry subtypes
- Holdings and contribution summaries
- Basic investment income reporting

### Phase 4: Offline Support
- Local draft queue
- Sync and retry logic
- Duplicate prevention via idempotency keys

### Phase 5: Polish
- Better reports
- Recurring entries
- Export improvements
- Reminder notifications if still needed

## 14. Testing Strategy

- Unit tests for parsers, normalization, and report calculations
- Integration tests for import confirm and undo flows
- API tests for transaction creation and filters
- Frontend tests for quick-add validation and import review flows
- Manual mobile QA on iPhone Safari and Android Chrome

## 15. Biggest Risks

- Import complexity may grow quickly if historical spreadsheets vary a lot.
- Investment modeling can become accounting-heavy if scope is not controlled.
- Offline sync can create duplicate or conflicting records without idempotency.
- Treating savings as expenses will distort reports unless modeled carefully.

## 16. Decisions Needed From You

Confirmed decisions:
1. Single-user app for now
2. Daily manual entry is the top priority
3. The app should be a PWA
4. Offline support can land right after the core entry and import flow
5. Excel import can target one current template first
6. Currency should be configurable, with ZMW as the main default
7. Investment types should be configurable, with strong support for stock and bond models
8. The app should track balances by account from the start
9. The app should support multiple income sources and business-linked income and expenses

Resolved:
1. Investment types are fully configurable. Stocks and bonds are strong defaults, all others (savings groups, Patuma, etc.) are user-defined.
2. Business tracking stays lightweight: businesses are tags on transactions, used only for filtering and reports. No separate business dashboard.
3. Auth: full auth provider (NextAuth or Clerk), invite-only registration. Only users you explicitly invite can create an account. Each user sees only their own data.
4. Accounts are configurable by the user. Sensible defaults will be pre-seeded (Cash, Mobile Money, Bank) but the user can add, rename, or remove them.
5. Offline sync lands in Phase 4, after the core entry and import flow.

## 17. Recommended Build Order

If we want the fastest path to a usable product:
1. Manual entry MVP
2. Account and category management
3. Dashboard and reports
4. PWA installability
5. Excel import
6. Investments
7. Offline sync

That order gets a working daily-use app live sooner, then adds migration and investment depth without blocking the foundation.
