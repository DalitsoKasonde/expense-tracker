package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
)

func (s *Server) getUserPreferences(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	prefs, err := s.userPreferences.GetOrCreate(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to load preferences", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, prefs)
}

func (s *Server) updateUserPreferences(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		DefaultCurrency      string `json:"defaultCurrency"`
		Theme                string `json:"theme"`
		NotificationsEnabled bool   `json:"notificationsEnabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	if req.DefaultCurrency == "" {
		req.DefaultCurrency = "ZMW"
	}

	req.Theme = strings.ToLower(strings.TrimSpace(req.Theme))
	if req.Theme == "" {
		req.Theme = "light"
	}
	if req.Theme != "light" && req.Theme != "dark" {
		http.Error(w, "theme must be light or dark", http.StatusBadRequest)
		return
	}

	prefs, err := s.userPreferences.Update(r.Context(), claims.UserID, strings.ToUpper(req.DefaultCurrency), req.Theme, req.NotificationsEnabled)
	if err != nil {
		http.Error(w, "failed to update preferences", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, prefs)
}
