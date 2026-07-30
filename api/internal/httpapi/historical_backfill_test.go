package httpapi

import (
	"testing"
	"time"
)

func TestValidateHistoricalBackfill(t *testing.T) {
	now := time.Date(2026, time.July, 29, 8, 0, 0, 0, time.UTC)

	t.Run("accepts past savings and investments", func(t *testing.T) {
		for _, entryKind := range []string{"saving_transfer", "investment_buy"} {
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
		if err := validateHistoricalBackfill("expense_living", "2026-07-28", now); err == nil {
			t.Fatal("expected expense backfill to be rejected")
		}
		if err := validateHistoricalBackfill("saving_transfer", "28/07/2026", now); err == nil {
			t.Fatal("expected malformed date to be rejected")
		}
	})
}
