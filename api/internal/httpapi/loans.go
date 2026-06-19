package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
	"github.com/go-chi/chi/v5"
)

func (s *Server) listLoans(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	loans, err := s.loans.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to list loans", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, loans)
}

func (s *Server) getLoan(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	loan, err := s.loans.GetSummary(r.Context(), claims.UserID, chi.URLParam(r, "id"))
	if err != nil {
		writeSettingsError(w, err, "failed to get loan")
		return
	}

	writeJSON(w, http.StatusOK, loan)
}

func (s *Server) createLoan(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req store.CreateLoanInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	currency, err := normalizeCurrency(req.Currency)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req.Currency = currency

	loan, err := s.loans.Create(r.Context(), claims.UserID, req)
	if err != nil {
		writeSettingsError(w, err, "failed to create loan")
		return
	}

	writeJSON(w, http.StatusCreated, loan)
}

func (s *Server) recordBorrowedMoney(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req store.RecordBorrowedInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	currency, err := normalizeCurrency(req.Currency)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req.Currency = currency

	result, err := s.loans.RecordBorrowed(r.Context(), claims.UserID, req)
	if err != nil {
		writeSettingsError(w, err, "failed to record borrowed money")
		return
	}

	writeJSON(w, http.StatusCreated, result)
}

func (s *Server) recordLoanRepayment(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req store.RecordRepaymentInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	req.LoanID = chi.URLParam(r, "id")
	currency, err := normalizeCurrency(req.Currency)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req.Currency = currency

	result, err := s.loans.RecordRepayment(r.Context(), claims.UserID, req)
	if err != nil {
		writeSettingsError(w, err, "failed to record loan repayment")
		return
	}

	writeJSON(w, http.StatusCreated, result)
}
