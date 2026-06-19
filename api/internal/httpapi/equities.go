package httpapi

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
	"github.com/go-chi/chi/v5"
)

func (s *Server) getAssetHolding(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	holding, err := s.assetLots.GetAssetHolding(r.Context(), claims.UserID, chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "failed to get holding", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, holding)
}

func (s *Server) sellAssetFIFO(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req store.EquitySellInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	req.AssetID = chi.URLParam(r, "id")
	if _, err := time.Parse("2006-01-02", req.ExecutionDate); err != nil {
		http.Error(w, "executionDate must use YYYY-MM-DD", http.StatusBadRequest)
		return
	}
	currency, err := normalizeCurrency(req.Currency)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req.Currency = currency

	result, err := s.assetLots.SellFIFO(r.Context(), claims.UserID, req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

func (s *Server) recordAssetDividend(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req store.DividendInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	req.AssetID = chi.URLParam(r, "id")
	if _, err := time.Parse("2006-01-02", req.ExecutionDate); err != nil {
		http.Error(w, "executionDate must use YYYY-MM-DD", http.StatusBadRequest)
		return
	}
	currency, err := normalizeCurrency(req.Currency)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req.Currency = currency

	result, err := s.assetLots.RecordDividend(r.Context(), claims.UserID, req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}
