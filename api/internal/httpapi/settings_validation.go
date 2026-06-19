package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"unicode"

	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

var (
	validAccountTypes = map[string]struct{}{
		"cash":         {},
		"mobile_money": {},
		"bank":         {},
		"savings":      {},
		"investment":   {},
		"other":        {},
	}
	validAccountClasses = map[string]struct{}{
		"asset":     {},
		"liability": {},
	}
	validCategoryGroups = map[string]struct{}{
		"expense":    {},
		"income":     {},
		"saving":     {},
		"investment": {},
	}
	validIncomeSourceTypes = map[string]struct{}{
		"salary":            {},
		"business":          {},
		"freelance":         {},
		"gift":              {},
		"investment_income": {},
		"other":             {},
	}
	validAssetClasses = map[string]struct{}{
		"bond":            {},
		"stock":           {},
		"cash_equivalent": {},
		"other":           {},
	}
	validTransactionEntryKinds = map[string]struct{}{
		"income_earned":             {},
		"income_borrowed":           {},
		"expense_living":            {},
		"expense_interest":          {},
		"expense_fee":               {},
		"debt_principal_payment":    {},
		"saving_transfer":           {},
		"investment_buy":            {},
		"investment_sell":           {},
		"investment_income":         {},
		"investment_loss":           {},
		"dividend_drip":             {},
		"bond_principal_redemption": {},
	}
)

func normalizeRequiredName(name string) (string, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return "", errors.New("name is required")
	}

	return trimmed, nil
}

func normalizeCurrency(currency string) (string, error) {
	normalized := strings.ToUpper(strings.TrimSpace(currency))
	if normalized == "" {
		normalized = "ZMW"
	}

	if len(normalized) != 3 {
		return "", errors.New("currency must be a 3-letter code")
	}

	for _, char := range normalized {
		if !unicode.IsUpper(char) || !unicode.IsLetter(char) {
			return "", errors.New("currency must be a 3-letter code")
		}
	}

	return normalized, nil
}

func normalizeAllowedValue(value string, fallback string, allowed map[string]struct{}, field string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if normalized == "" {
		normalized = fallback
	}

	if _, ok := allowed[normalized]; !ok {
		return "", errors.New(field + " is invalid")
	}

	return normalized, nil
}

func writeSettingsError(w http.ResponseWriter, err error, genericMessage string) {
	switch {
	case errors.Is(err, store.ErrInvalidCategoryParent):
		http.Error(w, "category parent must exist, avoid cycles, and stay in the same category group", http.StatusBadRequest)
	case errors.Is(err, store.ErrConflict):
		http.Error(w, "a resource with that name already exists", http.StatusConflict)
	case errors.Is(err, store.ErrNotFound):
		http.Error(w, "resource not found", http.StatusNotFound)
	default:
		http.Error(w, genericMessage, http.StatusInternalServerError)
	}
}
