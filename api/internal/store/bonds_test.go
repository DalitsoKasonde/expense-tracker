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
