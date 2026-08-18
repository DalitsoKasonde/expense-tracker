package store

import "testing"

func TestValidateBondInputRejectsNegativePurchaseFee(t *testing.T) {
	input := CreateBondInput{
		Name:                   "Three-year bond",
		CashAccountID:          "cash-account",
		PrincipalMinor:         100000,
		PurchaseFeeMinor:       -1,
		CouponRateBps:          1300,
		IssueDate:              "2026-01-01",
		MaturityDate:           "2029-01-01",
		CouponFrequencyPerYear: 2,
		ReinvestmentCutoffDate: "2029-01-01",
	}

	if err := validateBondInput(input); err == nil {
		t.Fatal("validateBondInput returned no error for a negative purchase fee")
	}
}

func TestValidateBondInputAccountRequirement(t *testing.T) {
	valid := CreateBondInput{
		Name:                   "Three-year bond",
		CashAccountID:          "cash-account",
		PrincipalMinor:         100000,
		CouponRateBps:          1300,
		IssueDate:              "2026-01-01",
		MaturityDate:           "2029-01-01",
		CouponFrequencyPerYear: 2,
		ReinvestmentCutoffDate: "2029-01-01",
	}
	if err := validateBondInput(valid); err != nil {
		t.Fatalf("valid bond returned an error: %v", err)
	}

	missingAccount := valid
	missingAccount.CashAccountID = ""
	if err := validateBondInput(missingAccount); err == nil {
		t.Fatal("bond without an account returned no error")
	}

	// A bond bought years ago may have left an account that was never tracked.
	historical := missingAccount
	historical.HistoricalBackfill = true
	if err := validateBondInput(historical); err != nil {
		t.Fatalf("historical bond without an account returned an error: %v", err)
	}
}

func TestValidateCouponConfirmation(t *testing.T) {
	base := ConfirmBondCouponInput{
		CashflowID:       "cashflow-1",
		CashAccountID:    "cash-account",
		GrossAmountMinor: 6500,
		TaxAmountMinor:   500,
		PaymentDate:      "2026-07-01",
		Destination:      "cash",
	}

	net, quantity, err := validateCouponConfirmation(base)
	if err != nil {
		t.Fatalf("cash confirmation returned an error: %v", err)
	}
	if net != 6000 || quantity != 0 {
		t.Fatalf("cash confirmation = net %d quantity %f, want net 6000 quantity 0", net, quantity)
	}

	historical := base
	historical.CashAccountID = ""
	historical.HistoricalBackfill = true
	if _, _, err := validateCouponConfirmation(historical); err != nil {
		t.Fatalf("historical confirmation without an account returned an error: %v", err)
	}

	nonHistoricalWithoutAccount := base
	nonHistoricalWithoutAccount.CashAccountID = ""
	if _, _, err := validateCouponConfirmation(nonHistoricalWithoutAccount); err == nil {
		t.Fatal("current confirmation without an account returned no error")
	}

	// Only a historical coupon may be booked as a reinvestment in one step; a
	// live one is covered by TestValidateCouponConfirmationKeepsLiveCouponsInCash.
	stock := base
	stock.Destination = "stock"
	stock.DestinationAssetID = "stock-1"
	stock.UnitPriceMinor = 1450
	stock.PurchaseFeeMinor = 200
	stock.HistoricalBackfill = true
	net, quantity, err = validateCouponConfirmation(stock)
	if err != nil {
		t.Fatalf("stock confirmation returned an error: %v", err)
	}
	if net != 6000 || quantity != 4 {
		t.Fatalf("stock confirmation = net %d quantity %f, want net 6000 quantity 4", net, quantity)
	}

	tooMuchTax := base
	tooMuchTax.TaxAmountMinor = 7000
	if _, _, err := validateCouponConfirmation(tooMuchTax); err == nil {
		t.Fatal("confirmation with tax above gross returned no error")
	}
}

func TestValidateAddBondPurchaseInput(t *testing.T) {
	valid := AddBondPurchaseInput{
		CashAccountID:    "cash-account",
		PrincipalMinor:   100000,
		PurchaseFeeMinor: 500,
		PurchaseDate:     "2026-08-01",
	}
	if err := validateAddBondPurchaseInput(valid); err != nil {
		t.Fatalf("valid purchase returned an error: %v", err)
	}

	missingAccount := valid
	missingAccount.CashAccountID = ""
	if err := validateAddBondPurchaseInput(missingAccount); err == nil {
		t.Fatal("purchase without an account returned no error")
	}

	historical := missingAccount
	historical.HistoricalBackfill = true
	if err := validateAddBondPurchaseInput(historical); err != nil {
		t.Fatalf("historical purchase without an account returned an error: %v", err)
	}
}

func TestValidateCouponConfirmationKeepsLiveCouponsInCash(t *testing.T) {
	live := ConfirmBondCouponInput{
		CashflowID:         "cashflow-1",
		CashAccountID:      "cash-account",
		GrossAmountMinor:   7895,
		PaymentDate:        "2026-07-26",
		Destination:        "stock",
		DestinationAssetID: "stock-1",
		UnitPriceMinor:     2000,
	}
	if _, _, err := validateCouponConfirmation(live); err == nil {
		t.Fatal("live coupon reinvestment returned no error")
	}

	cash := live
	cash.Destination = "cash"
	if _, _, err := validateCouponConfirmation(cash); err != nil {
		t.Fatalf("live coupon paid into an account returned an error: %v", err)
	}

	historical := live
	historical.HistoricalBackfill = true
	historical.CashAccountID = ""
	net, quantity, err := validateCouponConfirmation(historical)
	if err != nil {
		t.Fatalf("historical coupon reinvestment returned an error: %v", err)
	}
	if net != 7895 || quantity <= 0 {
		t.Fatalf("historical coupon reinvestment computed net %d and quantity %f", net, quantity)
	}
}

func TestSummarizeBondsCountsOnlyPostedCoupons(t *testing.T) {
	positions := []BondPosition{
		{AssetID: "bond-a", Currency: "ZMW", PrincipalMinor: 200_000},
	}
	cashflows := map[string][]BondCashflow{
		"bond-a": {
			// Paid.
			{AssetID: "bond-a", EventType: "coupon", Status: "posted", Disposition: "cash_balance",
				ScheduledDate: "2026-02-01", GrossAmountMinor: 10_000, TaxAmountMinor: 1_500, NetAmountMinor: 8_500},
			// Still scheduled: must not reach any received total.
			{AssetID: "bond-a", EventType: "coupon", Status: "projected", Disposition: "cash_balance",
				ScheduledDate: "2026-08-01", GrossAmountMinor: 10_000, TaxAmountMinor: 1_500, NetAmountMinor: 8_500},
			// Cancelled: neither received nor outstanding.
			{AssetID: "bond-a", EventType: "coupon", Status: "cancelled", Disposition: "cash_balance",
				ScheduledDate: "2027-02-01", GrossAmountMinor: 10_000, TaxAmountMinor: 1_500, NetAmountMinor: 8_500},
		},
	}

	summaries := summarizeBonds(positions, cashflows)
	if len(summaries) != 1 {
		t.Fatalf("expected one currency, got %d", len(summaries))
	}
	got := summaries[0]

	if got.CouponNetReceivedMinor != 8_500 {
		t.Fatalf("expected 8500 net received, got %d", got.CouponNetReceivedMinor)
	}
	if got.CouponGrossReceivedMinor != 10_000 || got.CouponTaxWithheldMinor != 1_500 {
		t.Fatalf("unexpected gross/tax: %d/%d", got.CouponGrossReceivedMinor, got.CouponTaxWithheldMinor)
	}
	if got.CouponsReceivedCount != 1 {
		t.Fatalf("expected 1 payment, got %d", got.CouponsReceivedCount)
	}
	if got.CouponNetOutstandingMinor != 8_500 {
		t.Fatalf("expected 8500 outstanding, got %d", got.CouponNetOutstandingMinor)
	}
	if got.PrincipalMinor != 200_000 || got.HoldingCount != 1 {
		t.Fatalf("unexpected principal/count: %d/%d", got.PrincipalMinor, got.HoldingCount)
	}
}

func TestSummarizeBondsSplitsReinvestedWithoutDoubleCounting(t *testing.T) {
	positions := []BondPosition{{AssetID: "bond-a", Currency: "ZMW", PrincipalMinor: 100_000}}
	cashflows := map[string][]BondCashflow{
		"bond-a": {
			{AssetID: "bond-a", EventType: "coupon", Status: "posted", Disposition: "reinvest",
				ScheduledDate: "2026-02-01", NetAmountMinor: 5_000},
			{AssetID: "bond-a", EventType: "coupon", Status: "posted", Disposition: "cash_balance",
				ScheduledDate: "2026-08-01", NetAmountMinor: 3_000},
			// Historical coupons carry their own disposition but are still cash.
			{AssetID: "bond-a", EventType: "coupon", Status: "posted", Disposition: "historical_cash",
				ScheduledDate: "2025-08-01", NetAmountMinor: 2_000},
		},
	}

	got := summarizeBonds(positions, cashflows)[0]

	if got.CouponNetReceivedMinor != 10_000 {
		t.Fatalf("expected 10000 total received, got %d", got.CouponNetReceivedMinor)
	}
	// The split has to reconstruct the total exactly, never exceed it.
	if got.ReinvestedMinor+got.PaidToCashMinor != got.CouponNetReceivedMinor {
		t.Fatalf("split %d + %d does not equal total %d",
			got.ReinvestedMinor, got.PaidToCashMinor, got.CouponNetReceivedMinor)
	}
	if got.ReinvestedMinor != 5_000 {
		t.Fatalf("expected 5000 reinvested, got %d", got.ReinvestedMinor)
	}
	if got.PaidToCashMinor != 5_000 {
		t.Fatalf("expected 5000 to cash, got %d", got.PaidToCashMinor)
	}
}

func TestSummarizeBondsKeepsCurrenciesApart(t *testing.T) {
	positions := []BondPosition{
		{AssetID: "zmw-bond", Currency: "ZMW", PrincipalMinor: 100_000},
		{AssetID: "usd-bond", Currency: "USD", PrincipalMinor: 50_000},
	}
	cashflows := map[string][]BondCashflow{
		"zmw-bond": {{AssetID: "zmw-bond", EventType: "coupon", Status: "posted",
			Disposition: "cash_balance", ScheduledDate: "2026-02-01", NetAmountMinor: 4_000}},
		"usd-bond": {{AssetID: "usd-bond", EventType: "coupon", Status: "posted",
			Disposition: "cash_balance", ScheduledDate: "2026-02-01", NetAmountMinor: 900}},
	}

	summaries := summarizeBonds(positions, cashflows)
	if len(summaries) != 2 {
		t.Fatalf("expected two currencies, got %d", len(summaries))
	}
	byCurrency := map[string]BondCurrencySummary{}
	for _, summary := range summaries {
		byCurrency[summary.Currency] = summary
	}
	if byCurrency["ZMW"].CouponNetReceivedMinor != 4_000 {
		t.Fatalf("ZMW received %d", byCurrency["ZMW"].CouponNetReceivedMinor)
	}
	if byCurrency["USD"].CouponNetReceivedMinor != 900 {
		t.Fatalf("USD received %d", byCurrency["USD"].CouponNetReceivedMinor)
	}
}

func TestSummarizeBondsReportsEarliestOutstandingCouponAsNext(t *testing.T) {
	positions := []BondPosition{{AssetID: "bond-a", Currency: "ZMW", PrincipalMinor: 100_000}}
	cashflows := map[string][]BondCashflow{
		"bond-a": {
			{AssetID: "bond-a", EventType: "coupon", Status: "projected", Disposition: "cash_balance",
				ScheduledDate: "2027-02-01", NetAmountMinor: 5_000},
			{AssetID: "bond-a", EventType: "coupon", Status: "projected", Disposition: "cash_balance",
				ScheduledDate: "2026-08-01", NetAmountMinor: 4_000},
		},
	}

	got := summarizeBonds(positions, cashflows)[0]

	if got.NextCouponDate != "2026-08-01" {
		t.Fatalf("expected earliest scheduled date, got %q", got.NextCouponDate)
	}
	if got.NextCouponNetMinor != 4_000 {
		t.Fatalf("expected the amount belonging to that date, got %d", got.NextCouponNetMinor)
	}
}

func TestSummarizeBondsIgnoresCashflowsForUnknownAssets(t *testing.T) {
	// Defence in depth: the query is user-scoped, but a stray asset must never
	// contribute to someone else's totals.
	positions := []BondPosition{{AssetID: "mine", Currency: "ZMW", PrincipalMinor: 100_000}}
	cashflows := map[string][]BondCashflow{
		"someone-elses": {{AssetID: "someone-elses", EventType: "coupon", Status: "posted",
			Disposition: "cash_balance", ScheduledDate: "2026-02-01", NetAmountMinor: 99_000}},
	}

	got := summarizeBonds(positions, cashflows)[0]

	if got.CouponNetReceivedMinor != 0 {
		t.Fatalf("expected no received coupons, got %d", got.CouponNetReceivedMinor)
	}
}

func TestSummarizeBondsWithNoPositionsReturnsNoCurrencies(t *testing.T) {
	if got := summarizeBonds(nil, nil); len(got) != 0 {
		t.Fatalf("expected no summaries, got %d", len(got))
	}
}
