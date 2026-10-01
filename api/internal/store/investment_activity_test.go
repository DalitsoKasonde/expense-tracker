package store

import (
	"testing"
	"time"
)

func day(year int, month time.Month, date int) time.Time {
	return time.Date(year, month, date, 12, 0, 0, 0, time.UTC)
}

func TestTheMonthGridIsTheLastTwelveMonthsEndingNow(t *testing.T) {
	months := lastTwelveMonths(day(2026, time.October, 1))
	if len(months) != 12 || months[0] != "2025-11" || months[11] != "2026-10" {
		t.Fatalf("months = %v", months)
	}
}

func TestTheInvestingRunIsNotBrokenBeforeTheMonthIsOver(t *testing.T) {
	invested := map[string]int64{"2026-07": 100, "2026-08": 100, "2026-09": 100}
	// On the 3rd of October, nothing added yet this month is not a lapse.
	if got := monthsInARow(invested, day(2026, time.October, 3)); got != 3 {
		t.Fatalf("run = %d, want 3", got)
	}
	invested["2026-10"] = 50
	if got := monthsInARow(invested, day(2026, time.October, 3)); got != 4 {
		t.Fatalf("run with a contribution this month = %d, want 4", got)
	}
}

func TestAMissedMonthEndsTheRun(t *testing.T) {
	invested := map[string]int64{"2026-06": 100, "2026-08": 100, "2026-09": 100}
	if got := monthsInARow(invested, day(2026, time.October, 3)); got != 2 {
		t.Fatalf("run = %d, want 2", got)
	}
	if got := monthsInARow(map[string]int64{}, day(2026, time.October, 3)); got != 0 {
		t.Fatalf("run with no contributions = %d, want 0", got)
	}
}

func TestHoldingPeriodIsWeightedByWhatEachLotCost(t *testing.T) {
	now := day(2026, time.October, 1)
	lots := []lotRow{
		{Kind: "stock", Currency: "ZMW", RemainingCost: 90000, AcquiredAt: "2026-04-04"}, // 180 days, most of the money
		{Kind: "stock", Currency: "ZMW", RemainingCost: 10000, AcquiredAt: "2026-09-21"}, // 10 days, a small top-up
	}
	got := averageHoldingDays(lots, now)
	if got == nil || *got != 163 {
		t.Fatalf("average holding days = %v, want 163", got)
	}
	if averageHoldingDays(nil, now) != nil {
		t.Fatal("an empty portfolio reported a holding period")
	}
}

func TestActivityKeepsCurrenciesApartAndFillsEmptyMonths(t *testing.T) {
	now := day(2026, time.October, 1)
	scopes := summarizeActivity(
		[]contributionRow{
			{Kind: "stock", Currency: "ZMW", Month: "2026-09", AmountMinor: 50000, FirstDate: "2026-09-04"},
			{Kind: "stock", Currency: "ZMW", Month: "2026-03", AmountMinor: 25000, FirstDate: "2026-03-10"},
			{Kind: "stock", Currency: "USD", Month: "2026-09", AmountMinor: 1000, FirstDate: "2026-09-15"},
		},
		nil,
		now,
	)
	stocks := scopes["stock"]
	if len(stocks) != 2 {
		t.Fatalf("currencies = %d, want 2", len(stocks))
	}
	zmw := stocks[0]
	if zmw.Currency != "ZMW" || zmw.TotalContributed != 75000 || zmw.FirstPurchaseDate != "2026-03-10" {
		t.Fatalf("ZMW summary = %+v", zmw)
	}
	if len(zmw.Months) != 12 || zmw.Months[10].Month != "2026-09" || zmw.Months[10].InvestedMinor != 50000 || zmw.Months[9].InvestedMinor != 0 {
		t.Fatalf("ZMW months = %+v", zmw.Months)
	}
	if stocks[1].TotalContributed != 1000 {
		t.Fatalf("USD was mixed into another currency: %+v", stocks[1])
	}
}

func TestThePortfolioCountsEveryKindOfNewMoneyTogether(t *testing.T) {
	now := day(2026, time.October, 1)
	scopes := summarizeActivity(
		[]contributionRow{
			{Kind: "stock", Currency: "ZMW", Month: "2026-08", AmountMinor: 50000, FirstDate: "2026-08-04"},
			{Kind: "bond", Currency: "ZMW", Month: "2026-09", AmountMinor: 1000000, FirstDate: "2026-09-12"},
			{Kind: "savings_pocket", Currency: "ZMW", Month: "2026-07", AmountMinor: 20000, FirstDate: "2026-07-01"},
		},
		nil,
		now,
	)
	all := scopes[ScopeAll]
	if len(all) != 1 || all[0].TotalContributed != 1070000 || all[0].MonthsInARow != 3 || all[0].FirstPurchaseDate != "2026-07-01" {
		t.Fatalf("portfolio = %+v", all)
	}
	// Each kind's own run is its own: one month of bonds is one month.
	if scopes["bond"][0].MonthsInARow != 1 {
		t.Fatalf("bond run = %d, want 1", scopes["bond"][0].MonthsInARow)
	}
}

func TestMoneyMovedBetweenInvestmentsIsNotNewMoneyForThePortfolio(t *testing.T) {
	now := day(2026, time.October, 1)
	scopes := summarizeActivity(
		[]contributionRow{
			{Kind: "savings_pocket", Currency: "ZMW", Month: "2026-09", AmountMinor: 100000, FirstDate: "2026-09-01"},
			// The same money, later spent on shares straight out of the pocket.
			{Kind: "stock", Currency: "ZMW", Month: "2026-09", AmountMinor: 60000, FirstDate: "2026-09-20", Internal: true},
		},
		nil,
		now,
	)
	if got := scopes["stock"][0].TotalContributed; got != 60000 {
		t.Fatalf("stocks = %d, want 60000: it is still money into stocks", got)
	}
	if got := scopes[ScopeAll][0].TotalContributed; got != 100000 {
		t.Fatalf("portfolio = %d, want 100000: the move was counted twice", got)
	}
}

func TestHoldingPeriodsAreReportedForStocksAlone(t *testing.T) {
	now := day(2026, time.October, 1)
	scopes := summarizeActivity(
		[]contributionRow{{Kind: "savings_pocket", Currency: "ZMW", Month: "2026-09", AmountMinor: 100, FirstDate: "2026-09-01"}},
		[]lotRow{{Kind: "stock", Currency: "ZMW", RemainingCost: 1000, AcquiredAt: "2026-09-01"}},
		now,
	)
	if scopes["savings_pocket"][0].AverageHoldingDays != nil {
		t.Fatal("a savings pocket reported a holding period it cannot have")
	}
	if got := scopes["stock"][0].AverageHoldingDays; got == nil || *got != 30 {
		t.Fatalf("stock holding period = %v, want 30", got)
	}
	// A portfolio average over stocks alone would be labelled as the whole.
	if scopes[ScopeAll][0].AverageHoldingDays != nil {
		t.Fatal("the portfolio reported a holding period drawn from stocks alone")
	}
}

func TestTheLastContributionIsTrackedPerHolding(t *testing.T) {
	last := lastContributions([]contributionRow{
		{Kind: "stock", HoldingID: "a", LastDate: "2026-05-02"},
		{Kind: "stock", HoldingID: "a", LastDate: "2026-08-19"},
		{Kind: "savings_pocket", HoldingID: "a", LastDate: "2026-09-30"},
	})
	if last[[2]string{"stock", "a"}] != "2026-08-19" || last[[2]string{"savings_pocket", "a"}] != "2026-09-30" {
		t.Fatalf("last contributions = %v", last)
	}
}

func TestOnlyKnownScopesTakeATarget(t *testing.T) {
	for _, scope := range []string{"all", "stock", "bond", "savings_pocket", "savings_group"} {
		if !ValidInvestingScope(scope) {
			t.Fatalf("%q rejected", scope)
		}
	}
	if ValidInvestingScope("crypto") || ValidInvestingScope("") {
		t.Fatal("an unknown scope was accepted")
	}
}
