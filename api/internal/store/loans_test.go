package store

import "testing"

func TestEffectiveLoanStatus(t *testing.T) {
	tests := []struct {
		name       string
		status     string
		balance    int64
		wantStatus string
	}{
		{
			name:   "reopens a closed loan when new principal is outstanding",
			status: "closed", balance: 300000, wantStatus: "active",
		},
		{
			name:   "keeps a paid-off loan closed",
			status: "closed", balance: 0, wantStatus: "closed",
		},
		{
			name:   "keeps an active loan active",
			status: "active", balance: 300000, wantStatus: "active",
		},
		{
			name:   "does not overwrite another explicit state",
			status: "defaulted", balance: 300000, wantStatus: "defaulted",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := effectiveLoanStatus(test.status, test.balance); got != test.wantStatus {
				t.Fatalf("effectiveLoanStatus(%q, %d) = %q, want %q", test.status, test.balance, got, test.wantStatus)
			}
		})
	}
}
