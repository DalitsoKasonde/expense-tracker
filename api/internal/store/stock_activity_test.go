package store

import (
	"testing"
	"time"
)

func day(year int, month time.Month, date int) time.Time {
	return time.Date(year, month, date, 12, 0, 0, 0, time.UTC)
}

func TestTheStockMonthGridIsTheLastTwelveMonthsEndingNow(t *testing.T) {
	months := lastTwelveMonths(day(2026, time.October, 1))
	if len(months) != 12 || months[0] != "2025-11" || months[11] != "2026-10" {
		t.Fatalf("months = %v", months)
	}
}

func TestTheInvestingStreakIsNotBrokenBeforeTheMonthIsOver(t *testing.T) {
	invested := map[string]int64{"2026-07": 100, "2026-08": 100, "2026-09": 100}
	// On the 3rd of October, nothing bought yet this month is not a lapse.
	if got := monthsInARow(invested, day(2026, time.October, 3)); got != 3 {
		t.Fatalf("streak = %d, want 3", got)
	}
	invested["2026-10"] = 50
	if got := monthsInARow(invested, day(2026, time.October, 3)); got != 4 {
		t.Fatalf("streak with a purchase this month = %d, want 4", got)
	}
}

func TestAMissedMonthEndsTheStreak(t *testing.T) {
	invested := map[string]int64{"2026-06": 100, "2026-08": 100, "2026-09": 100}
	if got := monthsInARow(invested, day(2026, time.October, 3)); got != 2 {
		t.Fatalf("streak = %d, want 2", got)
	}
	if got := monthsInARow(map[string]int64{}, day(2026, time.October, 3)); got != 0 {
		t.Fatalf("streak with no purchases = %d, want 0", got)
	}
}

func TestHoldingPeriodIsWeightedByWhatEachLotCost(t *testing.T) {
	now := day(2026, time.October, 1)
	lots := []stockLotRow{
		{Currency: "ZMW", RemainingCost: 90000, AcquiredAt: "2026-04-04"}, // 180 days, most of the money
		{Currency: "ZMW", RemainingCost: 10000, AcquiredAt: "2026-09-21"}, // 10 days, a small top-up
	}
	got := averageHoldingDays(lots, now)
	if got == nil || *got != 163 {
		t.Fatalf("average holding days = %v, want 163", got)
	}
	if averageHoldingDays(nil, now) != nil {
		t.Fatal("an empty portfolio reported a holding period")
	}
}

func TestStockActivityKeepsCurrenciesApartAndFillsEmptyMonths(t *testing.T) {
	now := day(2026, time.October, 1)
	summary := summarizeStockActivity(
		[]stockContributionRow{
			{Currency: "ZMW", Month: "2026-09", AmountMinor: 50000, FirstDate: "2026-09-04"},
			{Currency: "ZMW", Month: "2026-03", AmountMinor: 25000, FirstDate: "2026-03-10"},
			{Currency: "USD", Month: "2026-09", AmountMinor: 1000, FirstDate: "2026-09-15"},
		},
		nil,
		now,
	)
	if len(summary) != 2 {
		t.Fatalf("currencies = %d, want 2", len(summary))
	}
	zmw := summary[0]
	if zmw.Currency != "ZMW" || zmw.TotalContributed != 75000 || zmw.FirstPurchaseDate != "2026-03-10" {
		t.Fatalf("ZMW summary = %+v", zmw)
	}
	if len(zmw.Months) != 12 || zmw.Months[10].Month != "2026-09" || zmw.Months[10].InvestedMinor != 50000 || zmw.Months[9].InvestedMinor != 0 {
		t.Fatalf("ZMW months = %+v", zmw.Months)
	}
	if summary[1].TotalContributed != 1000 {
		t.Fatalf("USD was mixed into another currency: %+v", summary[1])
	}
}
