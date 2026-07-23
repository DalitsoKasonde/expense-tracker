package httpapi

import (
	"testing"

	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

func TestValidateTransferAccounts(t *testing.T) {
	base := store.Account{ID: "source", AccountClass: "asset", Currency: "ZMW"}

	tests := []struct {
		name        string
		source      store.Account
		destination store.Account
		currency    string
		wantError   bool
	}{
		{
			name:        "allows different active asset accounts",
			source:      base,
			destination: store.Account{ID: "destination", AccountClass: "asset", Currency: "ZMW"},
			currency:    "ZMW",
		},
		{
			name:        "rejects the same account",
			source:      base,
			destination: store.Account{ID: "source", AccountClass: "asset", Currency: "ZMW"},
			currency:    "ZMW",
			wantError:   true,
		},
		{
			name:        "rejects liability accounts",
			source:      base,
			destination: store.Account{ID: "destination", AccountClass: "liability", Currency: "ZMW"},
			currency:    "ZMW",
			wantError:   true,
		},
		{
			name:        "rejects mixed currencies",
			source:      base,
			destination: store.Account{ID: "destination", AccountClass: "asset", Currency: "USD"},
			currency:    "ZMW",
			wantError:   true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateTransferAccounts(test.source, test.destination, test.currency)
			if (err != nil) != test.wantError {
				t.Fatalf("validateTransferAccounts() error = %v, wantError %v", err, test.wantError)
			}
		})
	}
}

func TestCalculateInvestmentTotal(t *testing.T) {
	if got := calculateInvestmentTotal(10, 25000, 1000); got != 251000 {
		t.Fatalf("calculateInvestmentTotal() = %d, want 251000", got)
	}
	if got := calculateInvestmentTotal(2.5, 999, 25); got != 2523 {
		t.Fatalf("calculateInvestmentTotal() with fractional shares = %d, want 2523", got)
	}
}

func TestNormalizeOptionalSymbol(t *testing.T) {
	blank := "  "
	if got := normalizeOptionalSymbol(&blank); got != nil {
		t.Fatalf("normalizeOptionalSymbol(blank) = %q, want nil", *got)
	}

	symbol := "  zanaco  "
	got := normalizeOptionalSymbol(&symbol)
	if got == nil || *got != "ZANACO" {
		t.Fatalf("normalizeOptionalSymbol() = %v, want ZANACO", got)
	}
}
