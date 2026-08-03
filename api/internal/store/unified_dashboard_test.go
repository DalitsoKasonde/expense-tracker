package store

import "testing"

func TestIsAvailableBalanceAccount(t *testing.T) {
	tests := []struct {
		name        string
		accountType string
		class       string
		want        bool
	}{
		{name: "cash", accountType: "cash", class: "asset", want: true},
		{name: "mobile money", accountType: "mobile_money", class: "asset", want: true},
		{name: "bank", accountType: "bank", class: "asset", want: true},
		{name: "ordinary savings", accountType: "savings", class: "asset", want: false},
		{name: "savings group", accountType: "savings", class: "asset", want: false},
		{name: "receivable", accountType: "receivable", class: "asset", want: false},
		{name: "investment account", accountType: "investment", class: "asset", want: false},
		{name: "liability", accountType: "bank", class: "liability", want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := isAvailableBalanceAccount(DashboardAccountBalance{
				AccountType:  test.accountType,
				AccountClass: test.class,
			})
			if got != test.want {
				t.Fatalf("isAvailableBalanceAccount() = %v, want %v", got, test.want)
			}
		})
	}
}
