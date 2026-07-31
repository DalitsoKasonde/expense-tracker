package httpapi

import (
	"testing"
	"time"
)

func TestValidateHistoricalBackfill(t *testing.T) {
	now := time.Date(2026, time.July, 29, 8, 0, 0, 0, time.UTC)

	t.Run("accepts past expenses, savings and investments", func(t *testing.T) {
		for _, entryKind := range []string{
			"saving_transfer",
			"investment_buy",
			"expense_living",
			"expense_interest",
			"expense_fee",
		} {
			if err := validateHistoricalBackfill(entryKind, "2026-07-28", now); err != nil {
				t.Fatalf("expected %s to be accepted: %v", entryKind, err)
			}
		}
	})

	t.Run("rejects today and future dates", func(t *testing.T) {
		for _, date := range []string{"2026-07-29", "2026-07-30"} {
			if err := validateHistoricalBackfill("investment_buy", date, now); err == nil {
				t.Fatalf("expected %s to be rejected", date)
			}
		}
	})

	t.Run("rejects unrelated entry kinds and malformed dates", func(t *testing.T) {
		// Income needs a destination account to land in, and transfers to a
		// receivable need both sides, so neither can drop its account.
		for _, entryKind := range []string{
			"income_earned",
			"income_borrowed",
			"loan_receivable_advance",
			"debt_principal_payment",
		} {
			if err := validateHistoricalBackfill(entryKind, "2026-07-28", now); err == nil {
				t.Fatalf("expected %s backfill to be rejected", entryKind)
			}
		}
		if err := validateHistoricalBackfill("saving_transfer", "28/07/2026", now); err == nil {
			t.Fatal("expected malformed date to be rejected")
		}
	})
}
