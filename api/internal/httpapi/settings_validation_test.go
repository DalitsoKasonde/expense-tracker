package httpapi

import "testing"

func TestReceivableIsAValidAccountType(t *testing.T) {
	accountType, err := normalizeAllowedValue("receivable", "cash", validAccountTypes, "accountType")
	if err != nil {
		t.Fatalf("normalizeAllowedValue returned an error: %v", err)
	}
	if accountType != "receivable" {
		t.Fatalf("accountType = %q, want receivable", accountType)
	}
}
