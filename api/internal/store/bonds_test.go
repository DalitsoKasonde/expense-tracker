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

	stock := base
	stock.Destination = "stock"
	stock.DestinationAssetID = "stock-1"
	stock.UnitPriceMinor = 1450
	stock.PurchaseFeeMinor = 200
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
