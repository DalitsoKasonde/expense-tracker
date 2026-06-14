package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

// Accounts

func (s *Server) listAccounts(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	accounts, err := s.accounts.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to list accounts", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, accounts)
}

func (s *Server) createAccount(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Name     string `json:"name"`
		Currency string `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	account, err := s.accounts.Create(r.Context(), claims.UserID, req.Name, req.Currency)
	if err != nil {
		http.Error(w, "failed to create account", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, account)
}

func (s *Server) updateAccount(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")

	var req struct {
		Name     string `json:"name"`
		Currency string `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	account, err := s.accounts.Update(r.Context(), id, claims.UserID, req.Name, req.Currency)
	if err != nil {
		http.Error(w, "failed to update account", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, account)
}

func (s *Server) deleteAccount(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	if err := s.accounts.Delete(r.Context(), id, claims.UserID); err != nil {
		http.Error(w, "failed to delete account", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Categories

func (s *Server) listCategories(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	categories, err := s.categories.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to list categories", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, categories)
}

func (s *Server) createCategory(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	category, err := s.categories.Create(r.Context(), claims.UserID, req.Name)
	if err != nil {
		http.Error(w, "failed to create category", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, category)
}

func (s *Server) updateCategory(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	category, err := s.categories.Update(r.Context(), id, claims.UserID, req.Name)
	if err != nil {
		http.Error(w, "failed to update category", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, category)
}

func (s *Server) deleteCategory(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	if err := s.categories.Delete(r.Context(), id, claims.UserID); err != nil {
		http.Error(w, "failed to delete category", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Income Sources

func (s *Server) listIncomeSources(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	sources, err := s.incomeSources.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to list income sources", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, sources)
}

func (s *Server) createIncomeSource(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	source, err := s.incomeSources.Create(r.Context(), claims.UserID, req.Name)
	if err != nil {
		http.Error(w, "failed to create income source", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, source)
}

func (s *Server) updateIncomeSource(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	source, err := s.incomeSources.Update(r.Context(), id, claims.UserID, req.Name)
	if err != nil {
		http.Error(w, "failed to update income source", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, source)
}

func (s *Server) deleteIncomeSource(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	if err := s.incomeSources.Delete(r.Context(), id, claims.UserID); err != nil {
		http.Error(w, "failed to delete income source", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Businesses

func (s *Server) listBusinesses(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	businesses, err := s.businesses.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to list businesses", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, businesses)
}

func (s *Server) createBusiness(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	business, err := s.businesses.Create(r.Context(), claims.UserID, req.Name)
	if err != nil {
		http.Error(w, "failed to create business", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, business)
}

func (s *Server) updateBusiness(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	business, err := s.businesses.Update(r.Context(), id, claims.UserID, req.Name)
	if err != nil {
		http.Error(w, "failed to update business", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, business)
}

func (s *Server) deleteBusiness(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	if err := s.businesses.Delete(r.Context(), id, claims.UserID); err != nil {
		http.Error(w, "failed to delete business", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}


// Transactions

func (s *Server) listTransactions(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	limit := 20
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		_, _ = fmt.Sscanf(l, "%d", &limit)
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		_, _ = fmt.Sscanf(o, "%d", &offset)
	}

	transactions, err := s.transactions.ListByUser(r.Context(), claims.UserID, limit, offset)
	if err != nil {
		http.Error(w, "failed to list transactions", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, transactions)
}

func (s *Server) createTransaction(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		TransactionDate string   `json:"transactionDate"`
		EntryKind       string   `json:"entryKind"`
		Amount          int64    `json:"amount"`
		Currency        string   `json:"currency"`
		AccountID       string   `json:"accountId"`
		CategoryID      *string  `json:"categoryId"`
		IncomeSourceID  *string  `json:"incomeSourceId"`
		BusinessID      *string  `json:"businessId"`
		Note            *string  `json:"note"`
		Source          string   `json:"source"`
		ImportID        *string  `json:"importId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	tx := store.Transaction{
		UserID:          claims.UserID,
		TransactionDate: req.TransactionDate,
		EntryKind:       req.EntryKind,
		Amount:          req.Amount,
		Currency:        req.Currency,
		AccountID:       req.AccountID,
		CategoryID:      req.CategoryID,
		IncomeSourceID:  req.IncomeSourceID,
		BusinessID:      req.BusinessID,
		Note:            req.Note,
		Source:          req.Source,
		ImportID:        req.ImportID,
	}

	result, err := s.transactions.Create(r.Context(), tx)
	if err != nil {
		http.Error(w, "failed to create transaction", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, result)
}

func (s *Server) updateTransaction(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")

	var req struct {
		EntryKind      string  `json:"entryKind"`
		Amount         int64   `json:"amount"`
		AccountID      string  `json:"accountId"`
		CategoryID     *string `json:"categoryId"`
		IncomeSourceID *string `json:"incomeSourceId"`
		BusinessID     *string `json:"businessId"`
		Note           *string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	tx := store.Transaction{
		EntryKind:      req.EntryKind,
		Amount:         req.Amount,
		AccountID:      req.AccountID,
		CategoryID:     req.CategoryID,
		IncomeSourceID: req.IncomeSourceID,
		BusinessID:     req.BusinessID,
		Note:           req.Note,
	}

	result, err := s.transactions.Update(r.Context(), id, claims.UserID, tx)
	if err != nil {
		http.Error(w, "failed to update transaction", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) deleteTransaction(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	if err := s.transactions.SoftDelete(r.Context(), id, claims.UserID); err != nil {
		http.Error(w, "failed to delete transaction", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) dashboardSummary(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	currency := r.URL.Query().Get("currency")
	if currency == "" {
		currency = "ZMW"
	}

	summary, err := s.transactions.DashboardSummary(r.Context(), claims.UserID, currency)
	if err != nil {
		http.Error(w, "failed to get summary", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, summary)
}
