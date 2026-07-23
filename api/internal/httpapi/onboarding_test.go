package httpapi

import (
	"strings"
	"testing"
)

func TestNormalizeOnboardingRequest(t *testing.T) {
	t.Run("normalizes valid setup and removes duplicate interests", func(t *testing.T) {
		request, err := normalizeOnboardingRequest(completeOnboardingRequest{
			DefaultCurrency: " zmw ",
			Accounts: []onboardingAccountRequest{
				{Name: " Airtel Money ", AccountType: "mobile_money", OpeningBalanceMinor: 12550},
			},
			Interests: []string{"stocks", " STOCKS ", "loans"},
		})
		if err != nil {
			t.Fatalf("normalizeOnboardingRequest returned an error: %v", err)
		}

		if request.DefaultCurrency != "ZMW" {
			t.Fatalf("currency = %q, want ZMW", request.DefaultCurrency)
		}
		if request.Accounts[0].Name != "Airtel Money" {
			t.Fatalf("account name = %q, want Airtel Money", request.Accounts[0].Name)
		}
		if len(request.Interests) != 2 {
			t.Fatalf("interest count = %d, want 2", len(request.Interests))
		}
	})

	tests := []struct {
		name    string
		request completeOnboardingRequest
		want    string
	}{
		{
			name: "requires an account",
			request: completeOnboardingRequest{
				DefaultCurrency: "ZMW",
			},
			want: "at least one account",
		},
		{
			name: "rejects duplicate account names",
			request: completeOnboardingRequest{
				DefaultCurrency: "ZMW",
				Accounts: []onboardingAccountRequest{
					{Name: "Cash", AccountType: "cash"},
					{Name: " cash ", AccountType: "cash"},
				},
			},
			want: "unique",
		},
		{
			name: "rejects invalid account type",
			request: completeOnboardingRequest{
				DefaultCurrency: "ZMW",
				Accounts: []onboardingAccountRequest{
					{Name: "Main", AccountType: "crypto"},
				},
			},
			want: "accountType is invalid",
		},
		{
			name: "rejects invalid interest",
			request: completeOnboardingRequest{
				DefaultCurrency: "ZMW",
				Accounts: []onboardingAccountRequest{
					{Name: "Main", AccountType: "bank"},
				},
				Interests: []string{"property"},
			},
			want: "interest is invalid",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := normalizeOnboardingRequest(test.request)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v, want error containing %q", err, test.want)
			}
		})
	}
}
