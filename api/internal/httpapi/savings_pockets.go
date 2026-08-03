package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

func (s *Server) listSavingsPockets(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	items, err := s.savingsPockets.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		writeInternalError(w, r, "savings_pockets.list", "failed to list savings pockets", err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) createSavingsPocket(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req struct {
		Name                  string `json:"name"`
		Currency              string `json:"currency"`
		OpeningBalanceMinor   int64  `json:"openingBalanceMinor"`
		AnnualInterestRateBPS *int   `json:"annualInterestRateBps"`
		ExistingAccountID     string `json:"existingAccountId"`
	}
	if err := decodeJSON(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.OpeningBalanceMinor < 0 {
		http.Error(w, "opening balance cannot be negative", http.StatusBadRequest)
		return
	}
	if req.AnnualInterestRateBPS != nil && *req.AnnualInterestRateBPS < 0 {
		http.Error(w, "annual interest rate cannot be negative", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(req.Name)
	currency := strings.TrimSpace(req.Currency)
	if strings.TrimSpace(req.ExistingAccountID) == "" {
		var err error
		name, err = normalizeRequiredName(name)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		currency, err = normalizeCurrency(currency)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}
	item, err := s.savingsPockets.Create(r.Context(), claims.UserID, store.CreateSavingsPocketInput{
		Name:                  name,
		Currency:              currency,
		OpeningBalanceMinor:   req.OpeningBalanceMinor,
		AnnualInterestRateBPS: req.AnnualInterestRateBPS,
		ExistingAccountID:     strings.TrimSpace(req.ExistingAccountID),
	})
	if err != nil {
		if errors.Is(err, store.ErrConflict) {
			http.Error(w, "that account is already tracked as a savings pocket", http.StatusConflict)
			return
		}
		if errors.Is(err, store.ErrInvalidSavingsPocketAccount) || errors.Is(err, store.ErrNotFound) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeInternalError(w, r, "savings_pockets.create", "failed to create savings pocket", err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) recordSavingsPocketInterest(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req struct {
		TransactionDate string `json:"transactionDate"`
		AmountMinor     int64  `json:"amountMinor"`
		Note            string `json:"note"`
	}
	if err := decodeJSON(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if _, err := time.Parse("2006-01-02", req.TransactionDate); err != nil {
		http.Error(w, "transaction date must use YYYY-MM-DD", http.StatusBadRequest)
		return
	}
	if req.AmountMinor <= 0 {
		http.Error(w, "interest amount must be greater than zero", http.StatusBadRequest)
		return
	}
	item, err := s.savingsPockets.RecordInterest(r.Context(), claims.UserID, store.RecordSavingsPocketInterestInput{
		PocketID:        chi.URLParam(r, "id"),
		TransactionDate: req.TransactionDate,
		AmountMinor:     req.AmountMinor,
		Note:            req.Note,
	})
	if err != nil {
		writeSettingsError(w, err, "failed to record savings-pocket interest")
		return
	}
	writeJSON(w, http.StatusCreated, item)
}
