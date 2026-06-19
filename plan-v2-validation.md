# Plan v2 Validation

Status date: 2026-06-18

## Implemented

- Money and transaction foundation
  - `transactions.origin_event_id` and `origin_event_type` added.
  - New transaction taxonomy is enforced by a database check constraint.
  - Existing `income` and `expense` rows are migrated to `income_earned` and `expense_living`.
  - `accounts.opening_balance`, `transactions.amount`, `transactions.fees`, and `transactions.unit_price` are normalized toward minor-unit integers.

- Loan and debt module
  - `loans` and `loan_charges` schema added.
  - Borrowed money creates a linked two-leg event: cash inflow plus liability increase.
  - Repayments allocate in order: fees, interest, principal.
  - Principal repayment reduces the liability account and is not treated as living expense.
  - Forced loans are represented with `is_forced`.
  - Frontend Loans settings page supports creating loans, recording borrowed money, and recording repayments.

- Annual reporting and insights
  - Annual OVERALL endpoint added with Jan-Dec + YTD data.
  - Rows include earned income, borrowed income, total inflow, living expenses, debt principal, debt interest/fees, savings, investments, operating balance, free cash flow, amount brought forward, ending cash balance, and net worth.
  - Insight endpoint exposes free cash flow, net worth change, wealth build rate, debt remaining, interest leakage, borrowed dependency, and alerts.
  - Reports frontend renders headline metrics and the OVERALL matrix.
  - Today frontend renders practical insight cards and alerts.

- Savings groups
  - `savings_groups` and `savings_group_cycles` schema added.
  - Create group workflow creates a backing savings account.
  - Share-out workflow records return of contributions plus investment gain or investment loss.
  - Frontend Savings Groups settings page supports creating groups and recording share-outs.

- Bond ladder
  - Existing bond projection and due cashflow posting remain wired.
  - Dashboard valuation lookup is now bounded by `valuation_date <= asOf`.

- Equities
  - Asset lot schema compatibility fixed for `unit_price`, `fees`, `total_cost`, and `acquisition_date`.
  - FIFO sell workflow consumes oldest remaining lots first and computes realized gain.
  - Cash dividend workflow records `investment_income`.
  - DRIP dividend workflow records `dividend_drip` and creates a partial-share lot.
  - Frontend asset detail page supports sell, dividend cash/DRIP, and valuation update for non-bond assets.

- Quick Add UX
  - Floating add button added.
  - Quick Add supports expense, earned income, borrowed income, debt repayment, savings transfer, and investment buy.

## Verified

- API compile/test: `GOCACHE=$PWD/.cache/go-build GOMODCACHE=$PWD/.cache/go-mod go test ./...`
- Frontend typecheck: `npm run typecheck`

## Remaining Gaps

- Lazy month-end net-worth snapshot persistence is not yet implemented; annual net worth is computed on demand.
- Seeded per-user expense category tree and guided onboarding wizard are not yet implemented.
- Loan payoff projections and months-to-debt-free are not yet implemented.
- Savings group forced-loan settlement inside share-out is not yet automated.
- Full browser visual QA was blocked by the local Next dev-server process/port issue in this environment.
