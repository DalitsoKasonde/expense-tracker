package store

import (
	"errors"
	"testing"
)

func TestAccountCurrencyChangeAllowed(t *testing.T) {
	cases := []struct {
		name            string
		current         string
		requested       string
		hasTransactions bool
		wantErr         error
	}{
		{
			// The dangerous case: balance queries join transactions on currency,
			// so this would detach the history and silently zero the balance.
			name:    "refuses a change once money has moved",
			current: "ZMW", requested: "USD", hasTransactions: true,
			wantErr: ErrAccountCurrencyLocked,
		},
		{
			name:    "allows a correction while the account is unused",
			current: "ZMW", requested: "USD", hasTransactions: false,
			wantErr: nil,
		},
		{
			// An ordinary rename or type change resubmits the same currency and
			// must not be blocked.
			name:    "allows an unrelated edit that resubmits the same currency",
			current: "ZMW", requested: "ZMW", hasTransactions: true,
			wantErr: nil,
		},
		{
			name:    "treats case differences as the same currency",
			current: "ZMW", requested: "zmw", hasTransactions: true,
			wantErr: nil,
		},
		{
			// The handler normalises before calling, but an omitted currency must
			// never be read as a request to change it.
			name:    "ignores an omitted currency",
			current: "ZMW", requested: "", hasTransactions: true,
			wantErr: nil,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := accountCurrencyChangeAllowed(tc.current, tc.requested, tc.hasTransactions)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("expected %v, got %v", tc.wantErr, err)
			}
		})
	}
}
