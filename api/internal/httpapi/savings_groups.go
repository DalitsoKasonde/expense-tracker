package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
	"github.com/go-chi/chi/v5"
)

func (s *Server) listSavingsGroups(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	groups, err := s.savingsGroups.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to list savings groups", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, groups)
}

func (s *Server) createSavingsGroup(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req store.CreateSavingsGroupInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.CycleStart != "" {
		if _, err := time.Parse("2006-01-02", req.CycleStart); err != nil {
			http.Error(w, "cycleStart must use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
	}
	currency, err := normalizeCurrency(req.Currency)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req.Currency = currency

	group, err := s.savingsGroups.Create(r.Context(), claims.UserID, req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusCreated, group)
}

func (s *Server) updateSavingsGroup(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req store.UpdateSavingsGroupInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if _, err := time.Parse("2006-01-02", req.CycleStart); err != nil {
		http.Error(w, "cycleStart must use YYYY-MM-DD", http.StatusBadRequest)
		return
	}

	group, err := s.savingsGroups.Update(r.Context(), claims.UserID, chi.URLParam(r, "id"), req)
	if err != nil {
		writeSettingsError(w, err, "failed to update savings group")
		return
	}
	writeJSON(w, http.StatusOK, group)
}

func (s *Server) deleteSavingsGroup(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if err := s.savingsGroups.Delete(r.Context(), claims.UserID, chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, store.ErrAccountHasTransactions) {
			http.Error(w, "savings group already has contributions; record a share-out instead of deleting it", http.StatusBadRequest)
			return
		}
		writeSettingsError(w, err, "failed to delete savings group")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) closeSavingsGroupCycle(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req store.CloseSavingsGroupInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	req.GroupID = chi.URLParam(r, "id")
	if _, err := time.Parse("2006-01-02", req.CycleEnd); err != nil {
		http.Error(w, "cycleEnd must use YYYY-MM-DD", http.StatusBadRequest)
		return
	}
	currency, err := normalizeCurrency(req.Currency)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req.Currency = currency

	result, err := s.savingsGroups.CloseCycle(r.Context(), claims.UserID, req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}
