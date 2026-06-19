package httpapi

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
	"github.com/go-chi/chi/v5"
)

func (s *Server) unifiedDashboardSummary(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	currency := r.URL.Query().Get("currency")
	if currency == "" {
		currency = "ZMW"
	}

	dashboard, err := s.unifiedDashboard.Get(r.Context(), claims.UserID, currency, time.Now())
	if err != nil {
		http.Error(w, "failed to get unified dashboard", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, dashboard)
}

func (s *Server) upsertAssetValuation(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	assetID := chi.URLParam(r, "id")
	var req struct {
		ValuationDate     string `json:"valuationDate"`
		CurrentValueMinor int64  `json:"currentValueMinor"`
		Currency          string `json:"currency"`
		Source            string `json:"source"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if _, err := time.Parse("2006-01-02", req.ValuationDate); err != nil {
		http.Error(w, "valuationDate must use YYYY-MM-DD", http.StatusBadRequest)
		return
	}
	currency, err := normalizeCurrency(req.Currency)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	assets, err := s.assets.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to verify asset", http.StatusInternalServerError)
		return
	}
	owned := false
	for _, asset := range assets {
		if asset.ID == assetID {
			owned = true
			break
		}
	}
	if !owned {
		http.Error(w, "asset not found", http.StatusNotFound)
		return
	}

	valuation, err := s.assetValuations.Upsert(r.Context(), store.AssetValuation{
		AssetID:           assetID,
		ValuationDate:     req.ValuationDate,
		CurrentValueMinor: req.CurrentValueMinor,
		Currency:          currency,
		Source:            req.Source,
	})
	if err != nil {
		http.Error(w, "failed to upsert valuation", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, valuation)
}

func (s *Server) listBonds(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	positions, err := s.bonds.ListByUser(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to list bonds", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, positions)
}

func (s *Server) createBond(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req store.CreateBondInput
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

	position, err := s.bonds.Create(r.Context(), claims.UserID, req)
	if err != nil {
		switch err {
		case store.ErrNotFound, store.ErrConflict:
			http.Error(w, err.Error(), http.StatusBadRequest)
		default:
			http.Error(w, err.Error(), http.StatusBadRequest)
		}
		return
	}

	writeJSON(w, http.StatusCreated, position)
}

func (s *Server) getBondProjection(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	assetID := chi.URLParam(r, "assetId")
	projection, err := s.bonds.GetProjection(r.Context(), claims.UserID, assetID)
	if err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "bond not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to get bond projection", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, projection)
}
