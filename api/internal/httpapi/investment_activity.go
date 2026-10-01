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

// investmentActivity serves the investing-habit figures behind every
// portfolio dashboard. "This month" is the Lusaka calendar month: the
// container clock is UTC, which would put a purchase on the evening of the
// 31st into the wrong month for two hours.
func (s *Server) investmentActivity(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	activity, err := s.investing.Activity(r.Context(), claims.UserID, time.Now().In(lusakaLocation))
	if err != nil {
		writeInternalError(w, r, "investments.activity", "investing activity is temporarily unavailable", err)
		return
	}
	writeJSON(w, http.StatusOK, activity)
}

// setInvestingTarget stores one scope's monthly target and returns them all.
func (s *Server) setInvestingTarget(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		// 0 removes the target.
		TargetMinor int64 `json:"targetMinor"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.TargetMinor < 0 {
		http.Error(w, "The monthly investing target cannot be negative.", http.StatusBadRequest)
		return
	}

	err := s.investing.SetTarget(r.Context(), claims.UserID, chi.URLParam(r, "scope"), req.TargetMinor)
	if errors.Is(err, store.ErrUnknownInvestingScope) {
		http.Error(w, "unknown target", http.StatusNotFound)
		return
	}
	if err != nil {
		writeInternalError(w, r, "investments.set_target", "the target could not be saved", err)
		return
	}

	targets, err := s.investing.Targets(r.Context(), claims.UserID)
	if err != nil {
		writeInternalError(w, r, "investments.targets", "the target was saved but could not be read back", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"targets": targets})
}
