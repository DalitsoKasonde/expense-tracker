# Product Feedback Remediation Plan

## Objective

Resolve the trust-breaking correctness issues identified in the full product
audit before addressing findability and visual polish. Preserve the existing
task-oriented Add Entry flow, Home summary, and Activity filters.

## Implementation status

Updated 23 July 2026:

- [x] Diagnose and fix the shared Reports/Notifications SQL failure.
- [x] Add friendly retry states and request-scoped server diagnostics.
- [x] Make investment purchase and asset-lot creation atomic.
- [x] Add an idempotent migration for repairable missing investment lots.
- [x] Exclude assets without a recorded position from portfolio totals and
      label them clearly.
- [x] Repair duplicate active account names and enforce case-insensitive
      uniqueness.
- [x] Add account type and currency context to key account selectors.
- [x] Shorten onboarding to two screens and make starter accounts optional.
- [ ] Improve imported transaction presentation.
- [ ] Add category search and visible hierarchy.
- [ ] Replace the clipped Add Entry category chip row.
- [ ] Complete responsive/manual review of the remaining polish items.

Validation completed for the first implementation slice:

- The API Go test suite passes.
- All 27 frontend tests pass.
- TypeScript and ESLint pass.
- Both data migrations execute successfully against the existing PostgreSQL
  dataset inside a rolled-back validation transaction.
- The repair migration reduces repairable missing lots from 2 to 0.
- The account migration reduces active case-insensitive duplicate groups from
  1 to 0.

## Guiding principles

- Fix root causes before masking failures with friendlier copy.
- Never show raw backend or database errors to users.
- Treat financial totals as data-integrity concerns, not presentation details.
- Preserve import provenance while making everyday views concise.
- Make data-repair migrations idempotent and safe for the existing PostgreSQL
  container.
- Do not automatically reorganize user-created categories.

## Phase 1: Correctness and trust

### 1. Reports and Notifications

Current finding:

- Reports exposes `failed to build annual overview`.
- Notifications exposes `failed to build notifications`.
- Both depend on the shared annual/monthly insight calculation path.

Implementation:

- Reproduce the shared query failure with empty, manual, and imported data.
- Log the underlying server error with the request ID and operation name.
- Return stable public errors without database details.
- Add a reusable frontend error state with Retry.
- Keep previously loaded content visible during a retry where possible.

Acceptance criteria:

- Reports and Notifications load with empty and populated datasets.
- A failed request shows friendly copy and a working Retry action.
- Raw API error strings are absent from the interface.
- Server logs retain enough context to diagnose the underlying failure.

### 2. Portfolio consistency

Current finding:

- Portfolio totals come from `asset_lots` or bond positions.
- Activity can contain `investment_buy` transactions without a corresponding
  lot.
- Asset-lot creation errors are currently ignored after transaction creation.

Implementation:

- Make investment transaction and asset-lot creation one database transaction.
- Roll back the transaction if lot creation fails.
- Validate asset ownership, currency, quantity, price, and fees before writing.
- Add a diagnostic query for:
  - non-bond assets with no lots;
  - investment purchases with no corresponding lot;
  - lot totals that disagree with purchase data.
- Add an idempotent repair migration or administrative repair command for
  purchases that contain enough information to reconstruct a lot.
- Show `No position recorded` for an asset that genuinely has no position,
  rather than presenting an authoritative zero.

Acceptance criteria:

- A purchase of ZMW 100.97 produces ZMW 100.97 invested cost.
- A lot failure leaves neither a transaction nor a partial position.
- Existing repairable purchases are restored without duplicates.
- Unrepairable historical activity remains visible and is clearly labelled.

### 3. Account-name integrity

Current finding:

- Active account names are not unique per user.
- Duplicate names make account selectors ambiguous.

Implementation:

- Audit active duplicate names case-insensitively.
- Rename existing duplicates deterministically while preserving the oldest
  account name.
- Reject duplicate names in create and update handlers.
- Add a case-insensitive partial unique index for active accounts.
- Include account type and currency in selectors as secondary context.

Acceptance criteria:

- No user has indistinguishable active account names.
- `Cash` and `cash` are treated as duplicates for the same user.
- Archived accounts do not prevent reuse of a name.
- Existing account IDs and transaction relationships remain unchanged.

## Phase 2: Activity and category findability

### 4. Imported transaction presentation

Implementation:

- Enrich Activity rows with category, source, and import metadata.
- Use category or transaction type as the primary label.
- Show an `Imported` badge.
- Put the full workbook provenance note in expandable details.
- Do not rewrite or discard stored audit notes.

Acceptance criteria:

- Activity is scannable without losing import provenance.
- Search includes both the concise label and the full stored note.

### 5. Category management

Implementation:

- Remove copy claiming a hierarchy when all categories are top-level.
- Add search and category-group filters.
- Render parent groups as collapsible sections.
- Add a curated hierarchy only for system/default categories.
- Preserve custom parent relationships.

Acceptance criteria:

- Any category can be located quickly.
- Parent-child relationships are visibly nested.
- User-created categories are never automatically reparented.

### 6. Add Entry category picker

Implementation:

- Replace the single clipped chip row with a searchable grouped picker.
- Preserve recent/frequent categories as quick choices.
- Ensure full keyboard and mobile support.

Acceptance criteria:

- Every category is discoverable without hidden horizontal scrolling.
- The picker remains usable with 50 or more categories.

## Phase 3: Consistency polish

- Add a standard Settings page header.
- Reproduce and stabilize the More icon active/loading state.
- Show only the empty-state goal CTA when there are no goals.
- Add `inputMode="decimal"` and clearer mobile amount formatting.
- Consider recent amounts as a separate enhancement after observing usage.

## Validation strategy

- Backend integration tests for Reports, Notifications, investment purchases,
  and account-name conflicts.
- Migration tests against a representative copy of imported data.
- Frontend tests for retry states, concise imported rows, category search, and
  responsive picker behavior.
- Production build, TypeScript, ESLint, Go tests, and `git diff --check`.
- Manual responsive review at mobile and desktop breakpoints.

## Delivery sequence

1. Reports/Notifications diagnostics and retry UI.
2. Investment transaction atomicity and data repair.
3. Account-name migration and enforcement.
4. Activity/import presentation.
5. Categories and picker.
6. Settings/navigation/Goals/form polish.
