package store

import "testing"

func TestSummarizeDividendsCountsReinvestedAsReceivedAndSplitsTheTotal(t *testing.T) {
	summaries := summarizeDividends([]dividendRow{
		{AssetID: "zmbf", Currency: "ZMW", EntryKind: "investment_income", AmountMinor: 12_000},
		{AssetID: "zmbf", Currency: "ZMW", EntryKind: "dividend_drip", AmountMinor: 3_000},
		{AssetID: "cec", Currency: "ZMW", EntryKind: "investment_income", AmountMinor: 5_000},
	})

	if len(summaries) != 1 {
		t.Fatalf("expected one currency, got %d", len(summaries))
	}
	got := summaries[0]
	if got.DividendsReceived != 20_000 {
		t.Errorf("received = %d, want 20000 (a reinvested dividend is still income)", got.DividendsReceived)
	}
	if got.PaidToCashMinor != 17_000 || got.ReinvestedMinor != 3_000 {
		t.Errorf("split = cash %d / reinvested %d, want 17000 / 3000", got.PaidToCashMinor, got.ReinvestedMinor)
	}
	if got.PaidToCashMinor+got.ReinvestedMinor != got.DividendsReceived {
		t.Errorf("the split must add back to the total, not to more than it")
	}
	if got.DividendsCount != 3 {
		t.Errorf("count = %d, want 3", got.DividendsCount)
	}
	if got.PayingStockCount != 2 {
		t.Errorf("paying stocks = %d, want 2", got.PayingStockCount)
	}
}

func TestSummarizeDividendsNeverMixesCurrencies(t *testing.T) {
	summaries := summarizeDividends([]dividendRow{
		{AssetID: "zmbf", Currency: "ZMW", EntryKind: "investment_income", AmountMinor: 1_000},
		{AssetID: "aapl", Currency: "USD", EntryKind: "investment_income", AmountMinor: 700},
	})

	if len(summaries) != 2 {
		t.Fatalf("expected two currencies, got %d", len(summaries))
	}
	for _, summary := range summaries {
		want := map[string]int64{"ZMW": 1_000, "USD": 700}[summary.Currency]
		if summary.DividendsReceived != want {
			t.Errorf("%s received = %d, want %d", summary.Currency, summary.DividendsReceived, want)
		}
	}
}

func TestSummarizeDividendsWithNothingPaidReturnsAnEmptyList(t *testing.T) {
	if got := summarizeDividends(nil); got == nil || len(got) != 0 {
		t.Fatalf("expected an empty, non-nil list so the response is [] rather than null; got %#v", got)
	}
}
