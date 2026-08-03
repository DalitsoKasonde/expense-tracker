package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AdminUserSummary struct {
	ID          string  `json:"id"`
	MaskedEmail string  `json:"maskedEmail"`
	Role        string  `json:"role"`
	IsActive    bool    `json:"isActive"`
	CreatedAt   string  `json:"createdAt"`
	LastLoginAt *string `json:"lastLoginAt"`
}

type AdminAuditLog struct {
	ID          string  `json:"id"`
	AdminUserID string  `json:"adminUserId"`
	Action      string  `json:"action"`
	TargetType  string  `json:"targetType"`
	TargetID    *string `json:"targetId"`
	RequestID   *string `json:"requestId"`
	IPAddress   *string `json:"ipAddress"`
	CreatedAt   string  `json:"createdAt"`
}

type BackupJob struct {
	ID             string  `json:"id"`
	RequestedBy    string  `json:"requestedBy"`
	Status         string  `json:"status"`
	FileName       *string `json:"fileName"`
	SizeBytes      *int64  `json:"sizeBytes"`
	ChecksumSHA256 *string `json:"checksumSha256"`
	ErrorMessage   *string `json:"errorMessage"`
	RequestedAt    string  `json:"requestedAt"`
	StartedAt      *string `json:"startedAt"`
	CompletedAt    *string `json:"completedAt"`
}

type AdminStore struct{ db *pgxpool.Pool }

func NewAdminStore(db *pgxpool.Pool) *AdminStore { return &AdminStore{db: db} }

func (s *UserStore) CountSystemAdmins(ctx context.Context) (int, error) {
	var count int
	err := s.db.QueryRow(ctx, `select count(*) from users where role = 'system_admin'`).Scan(&count)
	return count, err
}

func (s *AdminStore) ListUsers(ctx context.Context) ([]AdminUserSummary, error) {
	rows, err := s.db.Query(ctx, `
		select id, email, role, is_active, created_at::text, last_login_at::text
		from users where role <> 'system_admin'
		order by created_at desc
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]AdminUserSummary, 0)
	for rows.Next() {
		var item AdminUserSummary
		var email string
		if err := rows.Scan(&item.ID, &email, &item.Role, &item.IsActive, &item.CreatedAt, &item.LastLoginAt); err != nil {
			return nil, err
		}
		item.MaskedEmail = maskEmail(email)
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *AdminStore) SetUserActive(ctx context.Context, userID string, active bool) error {
	tag, err := s.db.Exec(ctx, `
		update users set is_active = $1, updated_at = now()
		where id = $2 and role <> 'system_admin'
	`, active, userID)
	return normalizeExecResult(tag, err)
}

func (s *AdminStore) RecordAudit(ctx context.Context, item AdminAuditLog) error {
	_, err := s.db.Exec(ctx, `
		insert into admin_audit_logs (admin_user_id, action, target_type, target_id, request_id, ip_address)
		values ($1, $2, $3, $4, $5, $6)
	`, item.AdminUserID, item.Action, item.TargetType, item.TargetID, item.RequestID, item.IPAddress)
	return err
}

func (s *AdminStore) ListAudit(ctx context.Context) ([]AdminAuditLog, error) {
	rows, err := s.db.Query(ctx, `
		select id, admin_user_id, action, target_type, target_id, request_id, ip_address, created_at::text
		from admin_audit_logs order by created_at desc limit 200
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]AdminAuditLog, 0)
	for rows.Next() {
		var item AdminAuditLog
		if err := rows.Scan(&item.ID, &item.AdminUserID, &item.Action, &item.TargetType, &item.TargetID, &item.RequestID, &item.IPAddress, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *AdminStore) CreateBackupJob(ctx context.Context, adminID string) (BackupJob, error) {
	var job BackupJob
	err := s.db.QueryRow(ctx, `
		insert into backup_jobs (requested_by) values ($1)
		returning id, requested_by, status, file_name, size_bytes, checksum_sha256, error_message,
		          requested_at::text, started_at::text, completed_at::text
	`, adminID).Scan(&job.ID, &job.RequestedBy, &job.Status, &job.FileName, &job.SizeBytes, &job.ChecksumSHA256, &job.ErrorMessage, &job.RequestedAt, &job.StartedAt, &job.CompletedAt)
	return job, err
}

func (s *AdminStore) ListBackupJobs(ctx context.Context) ([]BackupJob, error) {
	rows, err := s.db.Query(ctx, `
		select id, requested_by, status, file_name, size_bytes, checksum_sha256, error_message,
		       requested_at::text, started_at::text, completed_at::text
		from backup_jobs order by requested_at desc limit 100
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]BackupJob, 0)
	for rows.Next() {
		var item BackupJob
		if err := rows.Scan(&item.ID, &item.RequestedBy, &item.Status, &item.FileName, &item.SizeBytes, &item.ChecksumSHA256, &item.ErrorMessage, &item.RequestedAt, &item.StartedAt, &item.CompletedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *AdminStore) StartBackup(ctx context.Context, jobID string) error {
	tag, err := s.db.Exec(ctx, `update backup_jobs set status = 'running', started_at = now() where id = $1 and status = 'queued'`, jobID)
	return normalizeExecResult(tag, err)
}

func (s *AdminStore) CompleteBackup(ctx context.Context, jobID, fileName string, size int64, checksum string) error {
	tag, err := s.db.Exec(ctx, `
		update backup_jobs set status = 'completed', file_name = $2, size_bytes = $3,
		checksum_sha256 = $4, completed_at = now(), error_message = null where id = $1
	`, jobID, fileName, size, checksum)
	return normalizeExecResult(tag, err)
}

func (s *AdminStore) FailBackup(ctx context.Context, jobID, message string) error {
	tag, err := s.db.Exec(ctx, `update backup_jobs set status = 'failed', error_message = $2, completed_at = now() where id = $1`, jobID, message)
	return normalizeExecResult(tag, err)
}

func maskEmail(email string) string {
	for i, character := range email {
		if character == '@' {
			if i <= 1 {
				return "***" + email[i:]
			}
			return email[:1] + "***" + email[i:]
		}
	}
	return "***"
}

func (s *UserStore) CreateSystemAdmin(ctx context.Context, email, passwordHash, displayName string) (User, error) {
	var user User
	err := s.db.QueryRow(ctx, `
		insert into users (email, display_name, password_hash, role, is_active)
		values ($1, $2, $3, 'system_admin', true)
		returning id, email, display_name, role, is_active
	`, email, displayName, passwordHash).Scan(&user.ID, &user.Email, &user.DisplayName, &user.Role, &user.IsActive)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return user, normalizeWriteError(err)
}
