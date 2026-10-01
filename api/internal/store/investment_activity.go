package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

/*
InvestmentActivity is the investing record behind every portfolio dashboard's
habit card: how much new money went in month by month, for how long it has
been held, and when each holding was last added to.

The point is to put weight on what the investor controls. A price over a few
months is mostly noise; putting money in regularly and leaving it there is the
part that is theirs. So "invested" means new money only. A reinvested
dividend or a bond coupon rolled over is return, not a contribution, and
counting it would flatter the habit.

Scopes are the whole portfolio ("all") and each kind of holding. Money moved
from one investment into another — a stock bought out of a savings pocket —
is a contribution to the kind it went into, but not new money for the
portfolio as a whole, which it never left.
*/
type InvestmentActivity struct {
	AsOf     string                                  `json:"asOf"`
	Scopes   map[string][]InvestmentCurrencyActivity `json:"scopes"`
	Holdings []HoldingActivity                       `json:"holdings"`
	// Targets is each scope's monthly target in the person's default currency;
	// a scope with no target is absent.
	Targets map[string]int64 `json:"targets"`
}

const ScopeAll = "all"

// InvestingTargetScopes are the parts of the portfolio a target can be set on.
var InvestingTargetScopes = []string{ScopeAll, "stock", "bond", "savings_pocket", "savings_group"}

var ErrUnknownInvestingScope = errors.New("unknown investing target scope")

type InvestmentCurrencyActivity struct {
	Currency string `json:"currency"`
	// Months is the last twelve calendar months, oldest first, ending with the
	// current one; a month with no contribution is present with zero.
	Months []InvestmentMonth `json:"months"`
	// MonthsInARow counts consecutive months with a contribution, ending this
	// month — or last month, so the run is not broken before this one is over.
	MonthsInARow int `json:"monthsInARow"`
	// AverageHoldingDays weights each lot still held by what it cost. It is
	// reported for stocks only: a bond gets a lot only when a coupon is
	// reinvested, so its lots would describe the rollovers rather than the
	// bond, and savings have no lots at all. Nil when nothing is held.
	AverageHoldingDays *int   `json:"averageHoldingDays"`
	FirstPurchaseDate  string `json:"firstPurchaseDate"`
	TotalContributed   int64  `json:"totalContributedMinor"`
}

type InvestmentMonth struct {
	Month         string `json:"month"`
	InvestedMinor int64  `json:"investedMinor"`
}

// HoldingActivity is one holding's part of the record. ID is the asset id for
// stocks and bonds, and the pocket or group id for savings.
type HoldingActivity struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
	// LastContributionDate is the last time new money went into this holding.
	LastContributionDate *string `json:"lastContributionDate"`
	// IncomeMinor is what the holding has paid: dividends, posted bond coupons,
	// pocket interest, or a savings group's realised share-out results.
	IncomeMinor int64 `json:"incomeMinor"`
}

type contributionRow struct {
	Kind        string
	HoldingID   string
	Currency    string
	Month       string
	AmountMinor int64
	FirstDate   string
	LastDate    string
	// Internal marks money that came out of another investment.
	Internal bool
}

type lotRow struct {
	Kind          string
	Currency      string
	RemainingCost int64
	AcquiredAt    string
}

const monthLayout = "2006-01"

// lastTwelveMonths names the twelve calendar months ending with now's.
func lastTwelveMonths(now time.Time) []string {
	first := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	months := make([]string, 0, 12)
	for offset := 11; offset >= 0; offset-- {
		months = append(months, first.AddDate(0, -offset, 0).Format(monthLayout))
	}
	return months
}

// monthsInARow counts back from this month through consecutive months with a
// contribution. An empty current month is skipped rather than ending the run:
// on the 3rd, not having added anything yet this month is not a lapse.
func monthsInARow(invested map[string]int64, now time.Time) int {
	month := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	if invested[month.Format(monthLayout)] <= 0 {
		month = month.AddDate(0, -1, 0)
	}
	count := 0
	for invested[month.Format(monthLayout)] > 0 {
		count++
		month = month.AddDate(0, -1, 0)
	}
	return count
}

// averageHoldingDays weights each lot still held by its remaining cost, so a
// large early purchase counts for more than a small recent top-up.
func averageHoldingDays(lots []lotRow, now time.Time) *int {
	var weighted, total float64
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	for _, lot := range lots {
		acquired, err := time.Parse(dateLayout, lot.AcquiredAt)
		if err != nil || lot.RemainingCost <= 0 {
			continue
		}
		days := today.Sub(acquired).Hours() / 24
		if days < 0 {
			days = 0
		}
		weighted += days * float64(lot.RemainingCost)
		total += float64(lot.RemainingCost)
	}
	if total == 0 {
		return nil
	}
	average := int(weighted/total + 0.5)
	return &average
}

type scopeTally struct {
	order     []string
	invested  map[string]map[string]int64
	firstDate map[string]string
	totals    map[string]int64
	lots      map[string][]lotRow
}

func newScopeTally() *scopeTally {
	return &scopeTally{
		invested:  map[string]map[string]int64{},
		firstDate: map[string]string{},
		totals:    map[string]int64{},
		lots:      map[string][]lotRow{},
	}
}

func (t *scopeTally) remember(currency string) {
	if _, ok := t.invested[currency]; !ok {
		t.invested[currency] = map[string]int64{}
		t.order = append(t.order, currency)
	}
}

func (t *scopeTally) add(row contributionRow) {
	t.remember(row.Currency)
	t.invested[row.Currency][row.Month] += row.AmountMinor
	t.totals[row.Currency] += row.AmountMinor
	if first := t.firstDate[row.Currency]; first == "" || row.FirstDate < first {
		t.firstDate[row.Currency] = row.FirstDate
	}
}

func (t *scopeTally) summarize(months []string, now time.Time) []InvestmentCurrencyActivity {
	result := make([]InvestmentCurrencyActivity, 0, len(t.order))
	for _, currency := range t.order {
		grid := make([]InvestmentMonth, 0, len(months))
		for _, month := range months {
			grid = append(grid, InvestmentMonth{Month: month, InvestedMinor: t.invested[currency][month]})
		}
		result = append(result, InvestmentCurrencyActivity{
			Currency:           currency,
			Months:             grid,
			MonthsInARow:       monthsInARow(t.invested[currency], now),
			AverageHoldingDays: averageHoldingDays(t.lots[currency], now),
			FirstPurchaseDate:  t.firstDate[currency],
			TotalContributed:   t.totals[currency],
		})
	}
	return result
}

// summarizeActivity folds the query results into one summary per scope.
// Separate from the queries so the month grid, the run, the weighting and the
// internal-transfer rule can be tested without a database. Currencies are
// never mixed.
func summarizeActivity(contributions []contributionRow, lots []lotRow, now time.Time) map[string][]InvestmentCurrencyActivity {
	months := lastTwelveMonths(now)
	tallies := map[string]*scopeTally{ScopeAll: newScopeTally()}
	tally := func(scope string) *scopeTally {
		if existing, ok := tallies[scope]; ok {
			return existing
		}
		created := newScopeTally()
		tallies[scope] = created
		return created
	}

	for _, row := range contributions {
		tally(row.Kind).add(row)
		if !row.Internal {
			tallies[ScopeAll].add(row)
		}
	}
	for _, lot := range lots {
		t := tally(lot.Kind)
		t.remember(lot.Currency)
		t.lots[lot.Currency] = append(t.lots[lot.Currency], lot)
	}

	result := make(map[string][]InvestmentCurrencyActivity, len(tallies))
	for scope, t := range tallies {
		result[scope] = t.summarize(months, now)
	}
	return result
}

// lastContributions is the latest contribution date per holding, keyed by
// kind and id since a pocket and an asset could in principle share an id.
func lastContributions(contributions []contributionRow) map[[2]string]string {
	last := map[[2]string]string{}
	for _, row := range contributions {
		key := [2]string{row.Kind, row.HoldingID}
		if row.LastDate > last[key] {
			last[key] = row.LastDate
		}
	}
	return last
}

type InvestmentActivityStore struct {
	db *pgxpool.Pool
}

func NewInvestmentActivityStore(db *pgxpool.Pool) *InvestmentActivityStore {
	return &InvestmentActivityStore{db: db}
}

/*
contributionsQuery lists new money per holding and month.

Stocks and bonds are bought with investment_buy; a coupon reinvested into a
bond arrives the same way but is return being rolled over, so it is left out.
Savings pockets and groups are paid into with saving_transfer, matched on the
account's currency the way their balances are. The internal flag marks money
whose source was itself a pocket or group account.
*/
const contributionsQuery = `
	with investment_accounts as (
		select account_id from savings_pockets where user_id = $1
		union
		select account_id from savings_groups where user_id = $1
	),
	contributions as (
		select a.asset_class as kind, a.id::text as holding_id, t.currency, t.transaction_date, t.amount::bigint as amount,
		       coalesce(t.account_id in (select account_id from investment_accounts), false) as internal
		from transactions t
		join assets a on a.id = t.asset_id
		where t.user_id = $1 and t.deleted_at is null
		  and t.entry_kind = 'investment_buy'
		  and coalesce(t.origin_event_type, '') <> 'bond_coupon_reinvestment'
		union all
		select 'savings_pocket', sp.id::text, t.currency, t.transaction_date, t.amount::bigint,
		       coalesce(t.account_id in (select account_id from investment_accounts), false)
		from transactions t
		join savings_pockets sp on sp.account_id = t.destination_account_id and sp.user_id = t.user_id
		join accounts acc on acc.id = sp.account_id and acc.archived_at is null
		where t.user_id = $1 and t.deleted_at is null
		  and t.entry_kind = 'saving_transfer' and t.currency = acc.currency
		union all
		select 'savings_group', sg.id::text, t.currency, t.transaction_date, t.amount::bigint,
		       coalesce(t.account_id in (select account_id from investment_accounts), false)
		from transactions t
		join savings_groups sg on sg.account_id = t.destination_account_id and sg.user_id = t.user_id
		join accounts acc on acc.id = sg.account_id
		where t.user_id = $1 and t.deleted_at is null
		  and t.entry_kind = 'saving_transfer' and t.currency = acc.currency
	)
	select kind, holding_id, currency, to_char(transaction_date, 'YYYY-MM'),
	       sum(amount)::bigint, min(transaction_date)::text, max(transaction_date)::text, internal
	from contributions
	where transaction_date <= $2
	group by kind, holding_id, currency, to_char(transaction_date, 'YYYY-MM'), internal`

/*
incomeQuery is what each holding has paid. The dividend rule matches
SummarizeDividends and the coupon rule matches summarizeBonds (posted only),
so per-holding figures add up to the dashboard totals.
*/
const incomeQuery = `
	select a.asset_class, a.id::text,
	       case when a.asset_class = 'bond' then
	         coalesce((select sum(bc.net_amount_minor) from bond_cashflows bc
	           where bc.asset_id = a.id and bc.event_type = 'coupon' and bc.status = 'posted'), 0)
	       else
	         coalesce((select sum(t.amount) from transactions t
	           where t.asset_id = a.id and t.user_id = $1 and t.deleted_at is null
	             and (t.origin_event_type = 'equity_dividend' or t.entry_kind = 'dividend_drip')), 0)
	       end::bigint
	from assets a
	where a.user_id = $1
	union all
	select 'savings_pocket', sp.id::text,
	       coalesce((select sum(t.amount) from transactions t
	         where t.user_id = $1 and t.account_id = sp.account_id and t.deleted_at is null
	           and t.entry_kind = 'investment_income' and t.currency = acc.currency), 0)::bigint
	from savings_pockets sp
	join accounts acc on acc.id = sp.account_id and acc.archived_at is null
	where sp.user_id = $1
	union all
	select 'savings_group', sg.id::text,
	       coalesce((select sum(c.realized_result_minor) from savings_group_cycles c where c.group_id = sg.id), 0)::bigint
	from savings_groups sg
	where sg.user_id = $1`

func (s *InvestmentActivityStore) Activity(ctx context.Context, userID string, now time.Time) (InvestmentActivity, error) {
	activity := InvestmentActivity{
		AsOf:     now.Format(dateLayout),
		Scopes:   map[string][]InvestmentCurrencyActivity{},
		Holdings: []HoldingActivity{},
		Targets:  map[string]int64{},
	}

	rows, err := s.db.Query(ctx, contributionsQuery, userID, now.Format(dateLayout))
	if err != nil {
		return activity, fmt.Errorf("investment contributions: %w", err)
	}
	contributions := make([]contributionRow, 0)
	for rows.Next() {
		var row contributionRow
		if err := rows.Scan(&row.Kind, &row.HoldingID, &row.Currency, &row.Month, &row.AmountMinor, &row.FirstDate, &row.LastDate, &row.Internal); err != nil {
			rows.Close()
			return activity, err
		}
		contributions = append(contributions, row)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return activity, err
	}

	rows, err = s.db.Query(ctx, `
		select a.asset_class, a.currency,
		       round(l.total_cost::numeric * l.remaining_quantity / nullif(l.quantity, 0))::bigint,
		       l.acquired_at::text
		from asset_lots l
		join assets a on a.id = l.asset_id
		where l.user_id = $1 and a.asset_class = 'stock' and l.remaining_quantity > 0
	`, userID)
	if err != nil {
		return activity, fmt.Errorf("investment lots: %w", err)
	}
	lots := make([]lotRow, 0)
	for rows.Next() {
		var row lotRow
		var remaining *int64
		if err := rows.Scan(&row.Kind, &row.Currency, &remaining, &row.AcquiredAt); err != nil {
			rows.Close()
			return activity, err
		}
		if remaining != nil {
			row.RemainingCost = *remaining
		}
		lots = append(lots, row)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return activity, err
	}

	activity.Scopes = summarizeActivity(contributions, lots, now)
	last := lastContributions(contributions)

	rows, err = s.db.Query(ctx, incomeQuery, userID)
	if err != nil {
		return activity, fmt.Errorf("investment income: %w", err)
	}
	for rows.Next() {
		var row HoldingActivity
		if err := rows.Scan(&row.Kind, &row.ID, &row.IncomeMinor); err != nil {
			rows.Close()
			return activity, err
		}
		if date, ok := last[[2]string{row.Kind, row.ID}]; ok {
			row.LastContributionDate = &date
		}
		activity.Holdings = append(activity.Holdings, row)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return activity, err
	}

	activity.Targets, err = s.Targets(ctx, userID)
	return activity, err
}

func (s *InvestmentActivityStore) Targets(ctx context.Context, userID string) (map[string]int64, error) {
	targets := map[string]int64{}
	rows, err := s.db.Query(ctx, `select scope, target_minor from investing_targets where user_id = $1`, userID)
	if err != nil {
		return targets, fmt.Errorf("investing targets: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var scope string
		var target int64
		if err := rows.Scan(&scope, &target); err != nil {
			return targets, err
		}
		targets[scope] = target
	}
	return targets, rows.Err()
}

// ValidInvestingScope reports whether a target can be set on scope.
func ValidInvestingScope(scope string) bool {
	for _, known := range InvestingTargetScopes {
		if scope == known {
			return true
		}
	}
	return false
}

// SetTarget stores a scope's monthly target; zero removes it, since a target
// the person no longer wants would only read as falling short.
func (s *InvestmentActivityStore) SetTarget(ctx context.Context, userID, scope string, targetMinor int64) error {
	if !ValidInvestingScope(scope) {
		return ErrUnknownInvestingScope
	}
	if targetMinor <= 0 {
		_, err := s.db.Exec(ctx, `delete from investing_targets where user_id = $1 and scope = $2`, userID, scope)
		return err
	}
	_, err := s.db.Exec(ctx, `
		insert into investing_targets (user_id, scope, target_minor) values ($1, $2, $3)
		on conflict (user_id, scope) do update set target_minor = excluded.target_minor, updated_at = now()
	`, userID, scope, targetMinor)
	return err
}
