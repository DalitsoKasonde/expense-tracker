package store

import "context"

/*
DividendCurrencySummary is dividend income received from stocks in one currency.

A stock's value moves with the market, so unlike a bond its growth figure is
real. But the dividends it has paid are return too, and they are recorded as
income on a cash account, so they never show up in "value less cost". This
gathers them so the stock dashboard can put them beside the price movement.
*/
type DividendCurrencySummary struct {
	Currency          string `json:"currency"`
	DividendsReceived int64  `json:"dividendsReceivedMinor"`
	DividendsCount    int    `json:"dividendsCount"`
	// A breakdown of DividendsReceived by where the money went, not an addition
	// to it. Summing these with the total would double count.
	ReinvestedMinor int64 `json:"reinvestedMinor"`
	PaidToCashMinor int64 `json:"paidToCashMinor"`
	// Distinct stocks that have paid at least one dividend.
	PayingStockCount int `json:"payingStockCount"`
}

// dividendRow is one dividend transaction as the summary needs it.
type dividendRow struct {
	AssetID     string
	Currency    string
	EntryKind   string
	AmountMinor int64
}

/*
summarizeDividends folds dividend transactions into per-currency totals.

Kept separate from the query so the arithmetic — notably that a reinvested
dividend counts as received even though no cash arrived, and that the cash and
reinvested figures are a split rather than an addition — can be tested without
a database. Currencies are never mixed.
*/
func summarizeDividends(rows []dividendRow) []DividendCurrencySummary {
	order := make([]string, 0)
	byCurrency := make(map[string]*DividendCurrencySummary)
	payersByCurrency := make(map[string]map[string]bool)

	for _, row := range rows {
		summary, ok := byCurrency[row.Currency]
		if !ok {
			summary = &DividendCurrencySummary{Currency: row.Currency}
			byCurrency[row.Currency] = summary
			payersByCurrency[row.Currency] = make(map[string]bool)
			order = append(order, row.Currency)
		}

		summary.DividendsReceived += row.AmountMinor
		summary.DividendsCount++
		if row.EntryKind == "dividend_drip" {
			summary.ReinvestedMinor += row.AmountMinor
		} else {
			summary.PaidToCashMinor += row.AmountMinor
		}
		if !payersByCurrency[row.Currency][row.AssetID] {
			payersByCurrency[row.Currency][row.AssetID] = true
			summary.PayingStockCount++
		}
	}

	summaries := make([]DividendCurrencySummary, 0, len(order))
	for _, currency := range order {
		summaries = append(summaries, *byCurrency[currency])
	}
	return summaries
}

/*
SummarizeDividends reports dividend income per currency across every stock the
user holds or has held, so the dashboard needs one request rather than one per
holding.

A dividend is either paid to cash (investment_income) or, for a historical
record, booked straight back into shares (dividend_drip). Both carry the
equity_dividend origin, but older reinvestments are matched on their entry kind
as well so none are missed — the same rule the asset page applies.
*/
func (s *AssetLotStore) SummarizeDividends(ctx context.Context, userID string) ([]DividendCurrencySummary, error) {
	rows, err := s.db.Query(ctx, `
		select t.asset_id, t.currency, t.entry_kind, t.amount::bigint
		from transactions t
		join assets a on a.id = t.asset_id
		where t.user_id = $1
		  and t.deleted_at is null
		  and a.asset_class = 'stock'
		  and (t.origin_event_type = 'equity_dividend' or t.entry_kind = 'dividend_drip')
		order by t.currency, t.transaction_date
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	dividends := make([]dividendRow, 0)
	for rows.Next() {
		var row dividendRow
		if err := rows.Scan(&row.AssetID, &row.Currency, &row.EntryKind, &row.AmountMinor); err != nil {
			return nil, err
		}
		dividends = append(dividends, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return summarizeDividends(dividends), nil
}
