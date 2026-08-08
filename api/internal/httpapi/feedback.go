package httpapi

import (
	"net/http"
	"strings"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/go-chi/chi/v5"
)

const maxFeedbackMessageLength = 4000

func (s *Server) createFeedback(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Message  string `json:"message"`
		PagePath string `json:"pagePath"`
	}
	if err := decodeJSON(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	message := strings.TrimSpace(req.Message)
	if message == "" {
		http.Error(w, "feedback message is required", http.StatusBadRequest)
		return
	}
	if len(message) > maxFeedbackMessageLength {
		http.Error(w, "feedback message is too long", http.StatusBadRequest)
		return
	}

	item, err := s.feedback.Create(r.Context(), claims.UserID, message, strings.TrimSpace(req.PagePath))
	if err != nil {
		writeSettingsError(w, err, "failed to submit feedback")
		return
	}

	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) listAdminFeedback(w http.ResponseWriter, r *http.Request) {
	items, err := s.feedback.ListForAdmin(r.Context())
	if err != nil {
		http.Error(w, "failed to list feedback", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) updateAdminFeedbackStatus(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Status string `json:"status"`
	}
	if err := decodeJSON(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	status := strings.TrimSpace(req.Status)
	if status != "new" && status != "reviewed" && status != "resolved" {
		http.Error(w, "status must be one of new, reviewed, resolved", http.StatusBadRequest)
		return
	}

	targetID := strings.TrimSpace(chi.URLParam(r, "id"))
	if err := s.feedback.UpdateStatus(r.Context(), targetID, status); err != nil {
		writeSettingsError(w, err, "failed to update feedback")
		return
	}

	s.recordAdminAudit(r, claims.UserID, "feedback."+status, "feedback", &targetID)
	w.WriteHeader(http.StatusNoContent)
}
