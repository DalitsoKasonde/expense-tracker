package httpapi

import (
	"errors"
	"time"
)

const historicalBackfillSource = "historical_backfill"

var lusakaLocation = time.FixedZone("Africa/Lusaka", 2*60*60)

func validateHistoricalBackfill(entryKind, transactionDate string, now time.Time) error {
	if entryKind != "saving_transfer" && entryKind != "investment_buy" {
		return errors.New("historical entries are only available for savings and investment purchases")
	}
	if _, err := time.Parse("2006-01-02", transactionDate); err != nil {
		return errors.New("transactionDate must use YYYY-MM-DD")
	}
	if transactionDate >= now.In(lusakaLocation).Format("2006-01-02") {
		return errors.New("historical entries must be dated before today")
	}
	return nil
}
