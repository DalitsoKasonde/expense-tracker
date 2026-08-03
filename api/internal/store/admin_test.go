package store

import "testing"

func TestMaskEmail(t *testing.T) {
	tests := map[string]string{
		"dalitso@example.com": "d***@example.com",
		"ab@example.com":      "a***@example.com",
		"a@example.com":       "***@example.com",
		"invalid":             "***",
	}
	for input, want := range tests {
		if got := maskEmail(input); got != want {
			t.Errorf("maskEmail(%q) = %q, want %q", input, got, want)
		}
	}
}
