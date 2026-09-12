package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strings"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

// digestFrequencies mirrors the check constraint on user_preferences; keep the
// two in step or a valid-looking save fails at the database instead of here,
// where the message can say something useful.
var digestFrequencies = []string{"off", "daily", "weekly", "monthly"}

func normalizeDigestFrequency(value string) (string, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return "off", nil
	}
	if !slices.Contains(digestFrequencies, value) {
		return "", errors.New("emailDigestFrequency must be one of off, daily, weekly, or monthly")
	}
	return value, nil
}

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
		DefaultCurrency             string   `json:"defaultCurrency"`
		Theme                       string   `json:"theme"`
		ColorScheme                 string   `json:"colorScheme"`
		NotificationsEnabled        bool     `json:"notificationsEnabled"`
		EmailDigestFrequency        string   `json:"emailDigestFrequency"`
		EmailMutedNotificationTypes []string `json:"emailMutedNotificationTypes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	currency, err := normalizeCurrency(req.DefaultCurrency)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	req.Theme = strings.ToLower(strings.TrimSpace(req.Theme))
	if req.Theme == "" {
		req.Theme = "light"
	}
	if req.Theme != "light" && req.Theme != "dark" {
		http.Error(w, "theme must be light or dark", http.StatusBadRequest)
		return
	}

	req.ColorScheme = strings.ToLower(strings.TrimSpace(req.ColorScheme))
	if req.ColorScheme == "" {
		req.ColorScheme = "default"
	}
	if req.ColorScheme != "default" && req.ColorScheme != "sonto" {
		http.Error(w, "colorScheme must be default or sonto", http.StatusBadRequest)
		return
	}

	frequency, err := normalizeDigestFrequency(req.EmailDigestFrequency)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	prefs, err := s.userPreferences.Update(r.Context(), claims.UserID, store.UserPreferencesInput{
		DefaultCurrency:      currency,
		Theme:                req.Theme,
		ColorScheme:          req.ColorScheme,
		NotificationsEnabled: req.NotificationsEnabled,
		EmailDigestFrequency: frequency,
		// Unknown types are dropped rather than rejected: a client one deploy
		// behind should still be able to save the rest of a person's settings.
		EmailMutedNotificationTypes: validNotificationTypes(req.EmailMutedNotificationTypes),
	})
	if err != nil {
		http.Error(w, "failed to update preferences", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, prefs)
}

// listNotificationTypes serves the alert catalogue so the settings screen can
// render a checkbox per alert without hard-coding the list, and mailEnabled so
// it can say plainly when digests would go nowhere.
func (s *Server) listNotificationTypes(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"mailEnabled": s.config.MailEnabled(),
		"frequencies": digestFrequencies,
		"types":       notificationCatalogue,
	})
}

// listEmailDeliveries shows what the app has actually sent this person. It is
// the honest answer to "did my digest go out?", which neither the preference
// toggle nor the mail server can give on its own.
func (s *Server) listEmailDeliveries(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	deliveries, err := s.emailDeliveries.ListRecent(r.Context(), claims.UserID, 20)
	if err != nil {
		writeInternalError(w, r, "email.deliveries.list", "recent emails are temporarily unavailable", err)
		return
	}

	writeJSON(w, http.StatusOK, deliveries)
}
