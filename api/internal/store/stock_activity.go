package store

import (
	"context"
	"fmt"
	"time"
)

/*
StockActivity is the investing record behind the stock dashboard's habit card:
how much new money went into stocks month by month, for how long it has been
held, and when each stock was last added to.

The point is to put weight on what the investor controls. A share price over
a few months is mostly noise; buying regularly and holding is the part that
is theirs. So "invested" here means new money only — a reinvested dividend or
a bond coupon rolled into shares is return, not a contribution, and counting
it would flatter the habit.
*/
type StockActivity struct {
	AsOf       string                  `json:"asOf"`
	Currencies []StockCurrencyActivity `json:"currencies"`
	Stocks     []StockAssetActivity    `json:"stocks"`
}

type StockCurrencyActivity struct {
	Currency string `json:"currency"`
	// Months is the last twelve calendar months, oldest first, ending with the
	// current one; a month with no purchase is present with zero.
	Months []StockMonthContribution `json:"months"`
	// MonthsInARow counts consecutive months with a purchase, ending this month
	// — or last month, so the streak is not broken before this one is over.
	MonthsInARow int `json:"monthsInARow"`
	// AverageHoldingDays weights each share still held by what it cost; nil
	// when nothing is held.
	AverageHoldingDays *int   `json:"averageHoldingDays"`
	FirstPurchaseDate  string `json:"firstPurchaseDate"`
	TotalContributed   int64  `json:"totalContributedMinor"`
}

type StockMonthContribution struct {
	Month         string `json:"month"`
	InvestedMinor int64  `json:"investedMinor"`
}

type StockAssetActivity struct {
	AssetID string `json:"assetId"`
	// LastPurchaseDate is the last time new money bought this stock.
	LastPurchaseDate *string `json:"lastPurchaseDate"`
	DividendsMinor   int64   `json:"dividendsMinor"`
}

type stockContributionRow struct {
	Currency    string
	Month       string
	AmountMinor int64
	FirstDate   string
}

type stockLotRow struct {
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
// purchase. An empty current month is skipped rather than ending the streak:
// on the 3rd, not having bought yet this month is not a lapse.
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
func averageHoldingDays(lots []stockLotRow, now time.Time) *int {
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

// summarizeStockActivity folds the query results into the response. Separate
// from the queries so the month grid, the streak and the weighting can be
// tested without a database. Currencies are never mixed.
func summarizeStockActivity(contributions []stockContributionRow, lots []stockLotRow, now time.Time) []StockCurrencyActivity {
	months := lastTwelveMonths(now)
	order := make([]string, 0)
	byCurrency := map[string]map[string]int64{}
	firstDate := map[string]string{}
	totals := map[string]int64{}
	lotsByCurrency := map[string][]stockLotRow{}

	remember := func(currency string) {
		if _, ok := byCurrency[currency]; !ok {
			byCurrency[currency] = map[string]int64{}
			order = append(order, currency)
		}
	}
	for _, row := range contributions {
		remember(row.Currency)
		byCurrency[row.Currency][row.Month] += row.AmountMinor
		totals[row.Currency] += row.AmountMinor
		if first := firstDate[row.Currency]; first == "" || row.FirstDate < first {
			firstDate[row.Currency] = row.FirstDate
		}
	}
	for _, lot := range lots {
		remember(lot.Currency)
		lotsByCurrency[lot.Currency] = append(lotsByCurrency[lot.Currency], lot)
	}

	result := make([]StockCurrencyActivity, 0, len(order))
	for _, currency := range order {
		grid := make([]StockMonthContribution, 0, len(months))
		for _, month := range months {
			grid = append(grid, StockMonthContribution{Month: month, InvestedMinor: byCurrency[currency][month]})
		}
		result = append(result, StockCurrencyActivity{
			Currency:           currency,
			Months:             grid,
			MonthsInARow:       monthsInARow(byCurrency[currency], now),
			AverageHoldingDays: averageHoldingDays(lotsByCurrency[currency], now),
			FirstPurchaseDate:  firstDate[currency],
			TotalContributed:   totals[currency],
		})
	}
	return result
}

// newMoneyPurchase is the filter shared by both purchase queries: a stock
// bought with new money. Reinvested bond coupons arrive as investment_buy but
// are return being rolled over, and dividend reinvestment has its own kind.
const newMoneyPurchase = `
	t.deleted_at is null
	and t.entry_kind = 'investment_buy'
	and coalesce(t.origin_event_type, '') <> 'bond_coupon_reinvestment'
	and a.asset_class = 'stock'`

func (s *AssetLotStore) StockActivity(ctx context.Context, userID string, now time.Time) (StockActivity, error) {
	activity := StockActivity{AsOf: now.Format(dateLayout), Currencies: []StockCurrencyActivity{}, Stocks: []StockAssetActivity{}}

	contributionRows, err := s.db.Query(ctx, `
		select t.currency, to_char(t.transaction_date, 'YYYY-MM'), sum(t.amount)::bigint, min(t.transaction_date)::text
		from transactions t
		join assets a on a.id = t.asset_id
		where t.user_id = $1 and `+newMoneyPurchase+`
		  and t.transaction_date <= $2
		group by t.currency, to_char(t.transaction_date, 'YYYY-MM')
	`, userID, now.Format(dateLayout))
	if err != nil {
		return activity, fmt.Errorf("stock contributions: %w", err)
	}
	contributions := make([]stockContributionRow, 0)
	for contributionRows.Next() {
		var row stockContributionRow
		if err := contributionRows.Scan(&row.Currency, &row.Month, &row.AmountMinor, &row.FirstDate); err != nil {
			contributionRows.Close()
			return activity, err
		}
		contributions = append(contributions, row)
	}
	contributionRows.Close()
	if err := contributionRows.Err(); err != nil {
		return activity, err
	}

	lotRows, err := s.db.Query(ctx, `
		select a.currency,
		       round(l.total_cost::numeric * l.remaining_quantity / nullif(l.quantity, 0))::bigint,
		       l.acquired_at::text
		from asset_lots l
		join assets a on a.id = l.asset_id
		where l.user_id = $1 and a.asset_class = 'stock' and l.remaining_quantity > 0
	`, userID)
	if err != nil {
		return activity, fmt.Errorf("stock lots: %w", err)
	}
	lots := make([]stockLotRow, 0)
	for lotRows.Next() {
		var row stockLotRow
		var remaining *int64
		if err := lotRows.Scan(&row.Currency, &remaining, &row.AcquiredAt); err != nil {
			lotRows.Close()
			return activity, err
		}
		if remaining != nil {
			row.RemainingCost = *remaining
		}
		lots = append(lots, row)
	}
	lotRows.Close()
	if err := lotRows.Err(); err != nil {
		return activity, err
	}

	activity.Currencies = summarizeStockActivity(contributions, lots, now)

	// Per stock: when new money last went in, and what it has paid out. The
	// dividend rule matches SummarizeDividends, so the per-stock figures add
	// up to the dashboard total.
	stockRows, err := s.db.Query(ctx, `
		select a.id,
		       (select max(t.transaction_date)::text from transactions t
		         where t.asset_id = a.id and t.user_id = $1 and `+newMoneyPurchase+`),
		       coalesce((select sum(t.amount)::bigint from transactions t
		         where t.asset_id = a.id and t.user_id = $1 and t.deleted_at is null
		           and (t.origin_event_type = 'equity_dividend' or t.entry_kind = 'dividend_drip')), 0)
		from assets a
		where a.user_id = $1 and a.asset_class = 'stock'
	`, userID)
	if err != nil {
		return activity, fmt.Errorf("stock assets: %w", err)
	}
	defer stockRows.Close()
	for stockRows.Next() {
		var row StockAssetActivity
		if err := stockRows.Scan(&row.AssetID, &row.LastPurchaseDate, &row.DividendsMinor); err != nil {
			return activity, err
		}
		activity.Stocks = append(activity.Stocks, row)
	}
	return activity, stockRows.Err()
}
