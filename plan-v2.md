# Expense Tracker — Plan v2 (Financial Insight System)

Status date: 2026-06-18

This plan supersedes the investment/insight portions of `plan.md` and `build-plan.md`.
It consolidates the review of the existing codebase, all locked decisions, the refined
transaction model, the loan and savings-group design, the bond and equity engines, the
insight/reporting layer, and a build order. Every workstream ends with **validation
criteria** (concrete, checkable acceptance tests) so the implementation can be verified.

Money convention throughout: **integer `bigint` minor units (ngwee), single base currency
ZMW**. "Minor" = 1/100 of a kwacha. K120.50 = `12050`.

---

## 1. What already exists (baseline — do not rebuild)

Verified from migrations and `api/internal/store`:

| Area | Status | Location |
| --- | --- | --- |
| `entry_kind` (free text, **no check constraint**) | exists: `income, expense, saving_transfer, investment_buy, investment_income, bond_principal_redemption` | mig 008, `transactions.go` |
| Account class `asset` / `liability` + `opening_balance` | exists | mig 002, 021 |
| Asset class `bond/stock/cash_equivalent/other` | exists | mig 021 |
| `bond_positions` + `bond_cashflows` + cutoff disposition (`reinvest`/`cash_balance`) + `PostDueCashflows` | exists | mig 021, `bonds.go` |
| `asset_lots` (quantity, remaining_quantity, unit_cost, total_cost) | exists | mig 012, `asset_lots.go` |
| Unified dashboard (income/expense/saving/investment/cash/liabilities/net worth) | exists | `unified_dashboard.go` |
| `asset_valuations` | exists | mig 021 |
| `creditors` / `loans` | **does not exist** | — |
| Savings-group / share-out logic | **does not exist** | — |
| Insight KPIs / annual OVERALL / alerts | **does not exist** | — |

**Known defects to fix (see §3):**
- Money units are inconsistent: `accounts.opening_balance` is read as **major** units
  (`round(opening_balance*100)`) while `transactions.amount` is read as **minor** units
  (`amount::bigint`). Two conventions in the same `numeric(14,2)` type.
- `asset_valuations` lookup in the dashboard has **no `valuation_date <= asOf` bound**, so
  any historical/monthly net worth would use today's prices.

---

## 2. Locked decisions

1. **Money:** `bigint` minor units everywhere.
2. **Loans:** the **liability account balance is the source of truth** for remaining
   principal; the loan record holds amortization detail. No double counting in net worth.
3. **Equities cost basis:** **FIFO (lot-based)**. Weighted-average price is shown as a
   *display* metric only, never used for realized-gain math.
4. **Bond reinvestment:** **manual**. All coupons (pre- and post-cutoff) land in cash; the
   user redeploys manually. No automated rung purchase.
5. **Carry-forward (annual view):** **ending liquid cash balance only** (cash + mobile money
   + bank), excluding savings buckets and investments.
6. **Emergency-fund baseline:** rolling **3-month average** of living expenses;
   months-covered = emergency-fund balance ÷ baseline. User may override with a fixed number.
   The emergency-fund account is **manually designated**, target set by the user.
7. **Seeding:** seed the **expense category tree only** (two-level). **Income sources and
   savings accounts are manual.** Do **not** seed a flat "Debt Repayment" expense category
   (see §10 and rec in §14).
8. **Alerts:** ship with default thresholds (expenses >70% of earned income, debt >30%,
   etc.), user-editable later (stored in `user_preferences`).
9. **FX:** single base currency ZMW; defer multi-currency net worth.

### Savings-group + forced-loan decisions (from Q&A)
- Share-out **profit is only known at share-out** (hold at contributed cost during the cycle).
- Share-out can end in a **gain or a loss** (usually ≥ contributions).
- At share-out the position **pours back to cash as one net settlement**; redeployment
  (savings / stocks / land) is done manually afterward as separate transactions.
- Cycles are ~12 months with **different start months per group**.
- Contributions have a **minimum but are effectively ad-hoc** (often K1,000); no rigid schedule.
- A group can **force the member to borrow**: the member **receives real cash**, the loan is
  recorded in the **main debt ledger** (tagged to the group, flagged `forced`), interest
  **increases if not repaid within a stated period** (the period is recorded), and the loan
  can outlive the cycle.
- Share-out returns a **single net amount**.

---

## 3. Money-unit normalization (build step 0 — foundational)

**Goal:** one convention — `bigint` minor units — for every monetary column and every read.

Changes:
- Convert `accounts.opening_balance` and `transactions.amount` (and `transactions.fees`,
  `unit_price`) to consistently represent **minor units**. Either store as `bigint` minor or
  keep `numeric` but read/write through one helper. Recommended: migrate to `bigint`.
- Remove the `round(opening_balance*100)` special-case; after migration `opening_balance`
  is already minor.
- Centralize all conversion in one Go helper package (`money`) — parse, format, no float math.

**Validation:**
- [ ] Golden test: snapshot current dashboard aggregates (income, expense, saving,
  investment, cash balance, net worth) for existing data **before** migration; assert the
  same values (after unit scaling) **after** migration.
- [ ] No `float64` appears in any money calculation path (grep + review).
- [ ] `K120.50` round-trips as `12050` through the `money` helper.

---

## 4. Refined transaction taxonomy

`entry_kind` is free text today (no constraint), so expanding it is non-breaking. New vocabulary:

| entry_kind | Meaning | Insight bucket | Net-worth effect |
| --- | --- | --- | --- |
| `income_earned` | Salary, projects, gifts | Earned income | + cash |
| `income_borrowed` | Loan proceeds received | Borrowed (NOT income) | + cash, + liability (net 0) |
| `expense_living` | Normal living spend | Living expense | − cash |
| `expense_interest` | Interest paid on debt | Interest leakage | − cash |
| `expense_fee` | Fees / penalties on debt | Interest leakage | − cash |
| `debt_principal_payment` | Principal portion of repayment | Wealth building | − cash, − liability (net 0 to NW) |
| `saving_transfer` | Move cash → savings bucket | Wealth building | moves within assets |
| `investment_buy` | Buy stock/bond/etc. | Wealth building | moves within assets |
| `investment_income` | Coupons, dividends, share-out profit | Investment income | + cash / + asset |
| `bond_principal_redemption` | Bond matures | (inflow) | bond → cash |

**Not a transaction kind:** `asset_valuation` stays in the `asset_valuations` table (it is a
mark-to-market, not a cash movement). Do **not** add it to `transactions`.

**Migration mapping for existing rows:**
- `income` → `income_earned`
- `expense` → `expense_living`
- others unchanged.
- Historical interest/fee splits are unrecoverable (they were never separated) — acceptable.

**Code touch points (the real work):** every `CASE WHEN entry_kind ...` block in
`unified_dashboard.go` (summary aggregation + per-account balance) and
`transactions.go DashboardSummary`.

**Validation:**
- [ ] Optional CHECK constraint enumerating valid kinds added after migration.
- [ ] Account-balance query treats `income_*`/`investment_income`/`bond_principal_redemption`
  as inflow, `expense_*`/`saving_transfer`/`investment_buy`/`debt_principal_payment` as
  outflow on the source account, and credits destination accounts for transfers/principal.
- [ ] Every existing row has a mapped kind (no NULL/legacy values remain).

---

## 5. Compound-event grouping (`origin_event_id`)

Borrowed money, loan repayment, and share-out each create **multiple transactions** that must
commit and undo together. Generalize the existing import-undo pattern:

- Add nullable `origin_event_id uuid` (+ `origin_event_type text`) to `transactions`.
- All legs of one user action share one `origin_event_id`, written in a single DB tx
  (reuse the `BeginTx`/rollback pattern from `bonds.go Create`).
- "Undo" reverses all legs of an event atomically (soft delete by `origin_event_id`).

**Validation:**
- [ ] A borrowed-money event creates exactly 2 legs sharing one `origin_event_id`.
- [ ] Undo of any compound event removes all its legs and leaves balances unchanged vs before.

---

## 6. Loan & debt module

### Schema
`loans` (detail; backed by exactly one liability account):
```
id, user_id,
liability_account_id   -- source of truth for remaining principal
creditor_name
loan_type              -- free text / enum
interest_method        -- 'fixed' | 'compound'
interest_rate_bps      -- nullable
fixed_interest_minor   -- nullable (for flat/fixed total interest)
stated_period_end      -- date; interest grows after this if unpaid
is_forced              -- boolean (salary deduction / group-forced)
group_id               -- nullable; links to a savings group
status                 -- 'active' | 'closed' | 'defaulted'
opened_at, created_at, updated_at
```
Running tallies (principal/interest/fees paid & remaining) are **derived** from the ledger,
not stored, to avoid drift — except remaining principal which equals the liability account
balance.

### Borrowed money (dual-leg, one event)
Receiving K5,000:
- Leg A: `income_borrowed` +5,000 → cash account.
- Leg B: +5,000 → liability account (increase debt).
- Net worth impact: **0** (before any interest/fees).

### Repayment allocation (fees → interest → principal)
A repayment of amount `R` against a loan allocates in order:
1. outstanding **fees** → `expense_fee`
2. outstanding **interest** → `expense_interest`
3. remainder → **principal** → `debt_principal_payment` (reduces liability account)

All legs share one `origin_event_id`.

### Interest growth after stated period
- `fixed`: stated total interest applied; if `stated_period_end` passes unpaid, apply the
  recorded penalty/extra interest (entered manually per decision: fees/penalties are manual,
  but the period and rate are recorded so the app can prompt).
- `compound`: interest accrues on outstanding balance per period; after `stated_period_end`
  the (higher) penalty rate applies.

### Forced loans
- `is_forced = true`. Shown in debt totals and KPIs but **excluded from "next loan to kill"**
  payoff ranking.

### Debt insights / payoff ranking
Rank non-forced active loans by a hybrid score:
1. highest interest/fee burden first,
2. small balances next (quick wins),
3. forced loans listed separately.
Plus: Total Debt Remaining, Principal/Interest/Fees Paid This Month, Interest-Leakage Trend,
Highest-Cost Loan, Next Loan to Kill, Months to Debt Free (projection from rate + scheduled
payment — its own small projection step).

**Validation (worked example):**
Loan opened by borrowing K10,000; outstanding fees K200, interest K300; repay K1,000.
- [ ] Allocation: K200 → `expense_fee`, K300 → `expense_interest`, K500 →
  `debt_principal_payment`.
- [ ] Liability account drops by exactly **K500** (only principal).
- [ ] Living expenses unaffected; interest leakage rises by K500 (interest+fees).
- [ ] Net worth change from this event = **−K500** (the interest+fees expense); principal
  payment is net-worth neutral.
- [ ] Forced loan does not appear in payoff ranking but is in Total Debt Remaining.

---

## 7. Savings groups (chilimba / village banking)

### Schema
`savings_groups`:
```
id, user_id,
account_id            -- the savings bucket (asset account)
name
is_shareout_group     -- true = profit cycle; false = plain savings
cycle_start           -- date (per-group start month)
cycle_length_months   -- default 12
status                -- 'active' | 'closed'
target_minor          -- nullable (goal progress)
```
`savings_group_cycles` (history of closed cycles):
```
id, group_id, cycle_start, cycle_end,
contributed_minor, payout_minor, realized_result_minor  -- payout - contributed (signed)
```

### Lifecycle
1. **Contributions** during the cycle: `saving_transfer` cash → group account. Cost basis
   `C` = sum of contributions this cycle. Ad-hoc amounts allowed (min enforced softly).
2. **During the cycle:** held at contributed cost (profit unknown until share-out). No
   interim mark-to-market.
3. **Forced loans inside the group:** modeled in the **debt ledger** (§6) with
   `group_id` set and `is_forced = true`; member receives real cash. These reduce the
   eventual net share-out and accrue interest over the cycle/after the stated period.
4. **Share-out (cycle close):** user enters the **single net amount** `N` received to cash.
   The app derives the realized result:
   - Return of contributions `C`: `saving_transfer` group → cash.
   - Realized result `(N + outstanding-group-loan-settled) - C`:
     - if positive → `investment_income` (profit share),
     - if negative → realized loss (negative investment result).
   - Any group loan settled at share-out is recorded as a repayment (§6) within the same
     `origin_event_id`.
   - Group account resets to 0; a `savings_group_cycles` row is written; a new cycle may start.

> Note: because the group loan lives in the debt ledger and may not be repaid at share-out,
> the share-out math nets only what was actually settled. Unsettled group loans remain as
> liabilities after the cycle closes.

**Validation (worked example — gain):**
Cycle: contributed `C = K12,000`; share-out net to cash `N = K13,500`; no outstanding loan.
- [ ] `saving_transfer` group→cash of K12,000 (return of contributions, no gain).
- [ ] `investment_income` of **K1,500** (profit share).
- [ ] Group account resets to 0; cycle row: contributed 12,000, payout 13,500, result +1,500.
- [ ] Net worth change over the cycle = **+K1,500**; contributions never counted as spending.

**Validation (worked example — loss):**
`C = K12,000`; `N = K11,400`.
- [ ] Realized result = **−K600** recorded as a loss (negative investment result), not as
  `expense_living`.

**Validation (forced loan affecting share-out):**
Member force-borrows K2,000 mid-cycle (cash +2,000, liability +2,000), interest K150 accrues.
At share-out the K2,000 principal + K150 interest are settled from proceeds.
- [ ] Borrow event: 2 legs, net worth impact 0.
- [ ] At share-out: K150 → `expense_interest`, K2,000 → `debt_principal_payment` (liability → 0),
  remainder follows the share-out gain/loss rules.
- [ ] All share-out legs share one `origin_event_id` and undo together.

---

## 8. Bond ladder (manual reinvestment)

Existing `bond_positions` / `bond_cashflows` stay. Reduced scope per decision 4:
- Keep cutoff routing using existing `disposition` values (`reinvest` / `cash_balance`).
  Reuse these names; do **not** rename to PENDING_REINVESTMENT/LIQUID_CASH.
- All coupons post to a cash account; the user reinvests manually. Pre-cutoff coupons are
  **also manual** (no auto-rung purchase).
- Cutoff boundary rule (documented + tested): the existing `!next.Before(cutoff)` means the
  **cutoff date itself routes to cash**. Keep this; add a test asserting the boundary.
- Final maturity posts `bond_principal_redemption` to cash.
- Projection: Total projected collection = remaining coupons + final face value (already
  computed in `GetProjection`).

**Validation:**
- [ ] A coupon scheduled exactly on the cutoff date routes to cash (`cash_balance`).
- [ ] `PostDueCashflows` is idempotent (running twice posts each cashflow once — guarded by
  `status='projected'`).
- [ ] Grand Harvest 2046 projection sums coupons + face value to the expected total.

---

## 9. Equities (FIFO lots, dividends, DRIP)

Buys already record share count + create lots. To complete:
- **Sells:** consume lots **FIFO**, reduce `remaining_quantity`, compute realized gain =
  proceeds − consumed-lot cost.
- **Average cost (display only):** `total remaining cost / total remaining shares`. Never
  used for realized-gain math.
- **Current market price per share:** store price-per-share (in `asset_valuations` or a price
  field) so Unrealized P&L = `(current_price − avg_cost) × shares` is exact.
- **Cash dividend:** `investment_income` → cash account.
- **DRIP dividend:** creates a new partial-share lot at the reinvestment price (no cash leg).

**Validation (worked example — FIFO):**
Buy 100 @ K10 (lot 1), buy 100 @ K20 (lot 2). Sell 100 @ K25.
- [ ] FIFO consumes lot 1 → realized gain = `(25−10)×100 = K1,500`.
- [ ] Remaining: 100 shares @ K20; avg cost display = K20.
- [ ] Cash dividend K300 → `investment_income` +300 to cash; share count unchanged.
- [ ] DRIP K300 @ K15 → new lot of 20 shares; cash unchanged; total shares +20.

---

## 10. Seeding & onboarding

**Seed (per-user, on first login — follow the lazy per-user pattern):**
- Expense category tree, two-level, each category tagged to an insight bucket:
  - Housing, Food, Transport, Comms/Utilities, Personal Development, Health,
    Family/Dependents, Misc → `expense_living`
  - **Debt Service** group → `Loan Interest` (`expense_interest`), `Loan Fees/Penalties`
    (`expense_fee`)
- **Do NOT seed** a flat "Debt Repayment" expense category (principal is not an expense).

**Manual (not seeded):** income sources, accounts, savings accounts/groups, loans,
emergency-fund designation + target.

**Onboarding wizard (recommended):** currency → cash/bank accounts → income sources →
optional savings groups & loans, so the dashboard is never empty/confusing.

**Validation:**
- [ ] New user gets the expense tree only; no income sources, savings, or "Debt Repayment".
- [ ] Each seeded category resolves to a single insight bucket.

---

## 11. Reporting & insight layer

### Per-month figures
Income (earned), Borrowed money, Total inflow, Living expenses, Debt principal paid, Debt
interest/fees paid, Savings contributions, Investment contributions, Net cash flow, Net worth
change.

### Headline numbers (home screen)
1. **Free Cash Flow**
2. **Net Worth Change**
3. **Wealth Build Rate**

Then: Debt Remaining, Interest Leakage, Savings Rate, Borrowed Dependency.

### KPI formulas (parenthesized — fixes precedence bugs in the source feedback)
```
Operating Balance   = Income − Living Expenses
Free Cash Flow      = Income − Living Expenses − (Debt Principal + Debt Interest + Debt Fees)
Savings Rate        = (Savings + Investments) / Income
Debt Burden Rate    = (Debt Principal + Debt Interest + Debt Fees) / Income
Interest Leakage    = (Interest + Fees) / Income
Borrowed Dependency = Borrowed Money / Total Inflow
Wealth Build Rate   = (Savings + Investments + Principal Repaid) / Income
```
`Income` here = earned income (borrowed money excluded). Guard divide-by-zero (Income = 0 →
display "—").

### Net worth over time
- Fix the valuation lookup to bound `valuation_date <= asOf`.
- Write month-end **net-worth snapshots lazily** (first dashboard view of a new month), like
  `PostDueCashflows`.

**Validation (worked month):**
Earned K20,000; borrowed K5,000; living K8,000; principal K2,000; interest+fees K500;
savings K3,000; investments K1,000.
- [ ] Total inflow = 25,000; Operating Balance = 12,000.
- [ ] Free Cash Flow = 20,000 − 8,000 − 2,500 = **9,500**.
- [ ] Savings Rate = (3,000+1,000)/20,000 = **20%**.
- [ ] Wealth Build Rate = (3,000+1,000+2,000)/20,000 = **30%**.
- [ ] Borrowed Dependency = 5,000/25,000 = **20%**.
- [ ] Borrowed money did not increase Income or Operating Balance.

---

## 12. Annual OVERALL view

Columns: Jan–Dec + YTD. Rows:
```
Earned Income
Borrowed Income
Total Inflow
Living Expenses
Debt Principal Paid
Debt Interest/Fees
Savings
Investments
Operating Balance
Free Cash Flow
Amount Brought Forward      (= prior month ending liquid cash)
Ending Cash Balance         (= liquid cash only; carries to next month)
Net Worth                   (from month-end snapshots)
```

**Validation:**
- [ ] Each month's `Amount Brought Forward` equals the prior month's `Ending Cash Balance`.
- [ ] `Ending Cash Balance` counts only liquid cash accounts (no savings/investments).
- [ ] YTD column equals the sum/most-recent of the monthly columns as appropriate per row.

---

## 13. Executive KPIs, goals & alerts

**Debt:** Total Debt Remaining, Principal/Interest/Fees Paid This Month, Interest-Leakage
Trend, Highest-Cost Loan, Next Loan to Kill (forced excluded), Months to Debt Free.

**Savings/Investment:** Total Saved/Invested This Month, Portfolio Contributions YTD,
Portfolio Value, Emergency Fund Months Covered, Car Fund Progress, Bond Ladder Projected 2046
Value, Stock Unrealized P&L, Cash vs Reinvested Dividends.

**Goals:** `target_minor` on savings accounts → percent funded. Emergency-fund months =
balance ÷ rolling-3-month living-expense average (override allowed).

**Alerts (defaults, editable in `user_preferences`):**
expenses >70% of earned income; debt payments >30% of earned income; interest/fees up vs last
month; borrowed money used this month; savings rate below target; emergency fund below target;
negative free cash flow; loan payoff target slipping.

**Validation:**
- [ ] Emergency fund K30,000, 3-month avg living K10,000 → "3.0 months covered".
- [ ] Car Fund balance K9,000, target K50,000 → "18% funded".
- [ ] With the §11 worked month, no >70%/>30% alert fires (expenses 40%, debt 12.5%).

---

## 14. Recommendations (adopted)

1. No flat "Debt Repayment" category — use Debt Service → Loan Interest / Loan Fees, with the
   repayment flow auto-routing; principal never gets an expense category.
2. Two-level seeded expense tree, each category tagged to an insight bucket.
3. Guided first-run onboarding wizard.
4. `origin_event_id` for atomic multi-leg events (generalize import-undo).
5. Lazy month-end net-worth snapshots (reuse the `PostDueCashflows` lazy pattern).
6. Golden-value tests around the money-unit migration before touching aggregates.
7. Single-currency (ZMW) net worth for now; defer FX.

---

## 15. Build order

| # | Step | Depends on |
| --- | --- | --- |
| 0 | Money-unit normalization → bigint minor; central `money` helper; golden tests | — |
| 1 | Refined `entry_kind` taxonomy + data migration + rewrite all CASE blocks | 0 |
| 2 | `origin_event_id` compound-event grouping + atomic undo | 1 |
| 3 | Per-user seeding (expense tree only) + onboarding wizard | 1 |
| 4 | Loan module: schema, borrowed-money dual-leg, repayment allocation, forced flag | 1,2 |
| 5 | Savings groups: schema, contributions, share-out (gain/loss), forced-loan coupling | 4 |
| 6 | As-of-correct net worth (valuation bound) + lazy month-end snapshots | 1 |
| 7 | Monthly insight aggregates + KPI formulas (parenthesized, divide-by-zero guarded) | 1,4,5 |
| 8 | Annual OVERALL view (carry-forward = ending liquid cash) | 6,7 |
| 9 | Executive KPIs + headline numbers + goals + alerts | 7,8 |
| 10 | Bonds: cutoff-to-cash routing + boundary tests (manual reinvest) | 1 |
| 11 | Equities: FIFO sells, realized gains, dividends (cash + DRIP), avg-cost display | 1 |
| 12 | Loan projections (months-to-debt-free, next-loan-to-kill) + goal widgets | 4,9 |
| 13 | Quick-add UX (all modes) + monthly rollover | all |

---

## 16. Quick-add UX modes (UI)

Floating quick-add → modes: Expense · Income (earned) · Borrowed income · Debt repayment ·
Savings transfer / contribution · Investment buy · Dividend/coupon received · Share-out.
- Debt repayment & borrowed income prompt for loan/creditor.
- Borrowed income & share-out generate multi-leg events (one `origin_event_id`).
- Stock dividends ask cash vs DRIP.
- Bond coupons/principal post to cash automatically when due.

---

## 17. Open items / future

- Months-to-debt-free projection accuracy depends on captured rate + scheduled payment.
- Multi-currency net worth (FX) deferred.
- Optional interim mark-to-market for savings groups (currently held at cost until share-out).
