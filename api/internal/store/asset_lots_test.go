package store

import "testing"

func TestValidateDividendInputKeepsLiveDividendsInCash(t *testing.T) {
	live := DividendInput{AmountMinor: 12550, DividendDisposition: "drip"}
	if err := validateDividendInput(live); err == nil {
		t.Fatal("live DRIP returned no error")
	}

	cash := live
	cash.DividendDisposition = "cash"
	if err := validateDividendInput(cash); err != nil {
		t.Fatalf("live cash dividend returned an error: %v", err)
	}

	historical := live
	historical.HistoricalBackfill = true
	if err := validateDividendInput(historical); err != nil {
		t.Fatalf("historical DRIP returned an error: %v", err)
	}
}
