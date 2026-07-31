package httpapi

import (
	"errors"
	"time"
)

const historicalBackfillSource = "historical_backfill"

var lusakaLocation = time.FixedZone("Africa/Lusaka", 2*60*60)

// Entry kinds that may be recorded without a funding account. Kept in step with
// the transactions_account_or_historical_check constraint in migration 033.
var historicalBackfillEntryKinds = map[string]struct{}{
	"saving_transfer":  {},
	"investment_buy":   {},
	"expense_living":   {},
	"expense_interest": {},
	"expense_fee":      {},
}

func validateHistoricalBackfill(entryKind, transactionDate string, now time.Time) error {
	if _, ok := historicalBackfillEntryKinds[entryKind]; !ok {
		return errors.New("historical entries are only available for expenses, savings, and investment purchases")
	}
	if _, err := time.Parse("2006-01-02", transactionDate); err != nil {
		return errors.New("transactionDate must use YYYY-MM-DD")
	}
	if transactionDate >= now.In(lusakaLocation).Format("2006-01-02") {
		return errors.New("historical entries must be dated before today")
	}
	return nil
}
