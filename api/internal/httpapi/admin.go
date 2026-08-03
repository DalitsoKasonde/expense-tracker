package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/dalitsokasonde/expense-tracker/api/internal/auth"
	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func (s *Server) listAdminUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.admin.ListUsers(r.Context())
	if err != nil {
		http.Error(w, "failed to list users", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func (s *Server) createSystemAdmin(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req struct {
		Email       string `json:"email"`
		Password    string `json:"password"`
		DisplayName string `json:"displayName"`
	}
	if err := decodeJSON(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	displayName := strings.TrimSpace(req.DisplayName)
	if email == "" || !strings.Contains(email, "@") {
		http.Error(w, "a valid email is required", http.StatusBadRequest)
		return
	}
	if displayName == "" {
		displayName = "System administrator"
	}
	if err := auth.ValidatePassword(req.Password); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, "failed to secure password", http.StatusInternalServerError)
		return
	}
	user, err := s.users.CreateSystemAdmin(r.Context(), email, hash, displayName)
	if err != nil {
		writeSettingsError(w, err, "failed to create system administrator")
		return
	}
	targetID := user.ID
	s.recordAdminAudit(r, claims.UserID, "system_admin.created", "system_admin", &targetID)
	writeJSON(w, http.StatusCreated, map[string]string{"id": user.ID, "role": user.Role})
}

func (s *Server) updateAdminUserStatus(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req struct {
		IsActive bool `json:"isActive"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	targetID := strings.TrimSpace(chi.URLParam(r, "id"))
	if err := s.admin.SetUserActive(r.Context(), targetID, req.IsActive); err != nil {
		writeSettingsError(w, err, "failed to update user status")
		return
	}
	action := "user.suspended"
	if req.IsActive {
		action = "user.activated"
	}
	s.recordAdminAudit(r, claims.UserID, action, "user", &targetID)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listAdminAudit(w http.ResponseWriter, r *http.Request) {
	items, err := s.admin.ListAudit(r.Context())
	if err != nil {
		http.Error(w, "failed to list audit history", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) listAdminBackups(w http.ResponseWriter, r *http.Request) {
	items, err := s.admin.ListBackupJobs(r.Context())
	if err != nil {
		http.Error(w, "failed to list backups", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) createAdminBackup(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if strings.TrimSpace(s.config.BackupDir) == "" || strings.TrimSpace(s.config.BackupEncryptionKey) == "" {
		http.Error(w, "encrypted backups are not configured", http.StatusServiceUnavailable)
		return
	}
	job, err := s.admin.CreateBackupJob(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, "failed to queue backup", http.StatusInternalServerError)
		return
	}
	s.recordAdminAudit(r, claims.UserID, "backup.requested", "backup", &job.ID)
	go s.executeBackup(job.ID)
	writeJSON(w, http.StatusAccepted, job)
}

func (s *Server) recordAdminAudit(r *http.Request, adminID, action, targetType string, targetID *string) {
	requestID := middleware.GetReqID(r.Context())
	ip := clientIP(r)
	item := store.AdminAuditLog{AdminUserID: adminID, Action: action, TargetType: targetType, TargetID: targetID}
	if requestID != "" {
		item.RequestID = &requestID
	}
	if ip != "" {
		item.IPAddress = &ip
	}
	_ = s.admin.RecordAudit(r.Context(), item)
}
