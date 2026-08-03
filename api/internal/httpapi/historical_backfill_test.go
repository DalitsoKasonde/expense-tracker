package httpapi

import (
	"testing"
	"time"
)

func TestValidateHistoricalInvestmentPayments(t *testing.T) {
	now := time.Date(2026, time.August, 3, 12, 0, 0, 0, lusakaLocation)
	for _, entryKind := range []string{"investment_income", "dividend_drip"} {
		t.Run(entryKind, func(t *testing.T) {
			if err := validateHistoricalBackfill(entryKind, "2026-08-02", now); err != nil {
				t.Fatalf("past %s returned an error: %v", entryKind, err)
			}
		})
	}
}

func TestValidateHistoricalInvestmentPaymentRejectsToday(t *testing.T) {
	now := time.Date(2026, time.August, 3, 12, 0, 0, 0, lusakaLocation)
	if err := validateHistoricalBackfill("investment_income", "2026-08-03", now); err == nil {
		t.Fatal("historical investment income dated today returned no error")
	}
}
