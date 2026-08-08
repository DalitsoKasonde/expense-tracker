package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Feedback struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Message   string `json:"message"`
	PagePath  string `json:"pagePath,omitempty"`
	Status    string `json:"status"`
	CreatedAt string `json:"createdAt"`
}

// AdminFeedback carries a masked identity so the operations console can
// triage feedback without exposing a beta user's real email address.
type AdminFeedback struct {
	Feedback
	MaskedEmail string `json:"maskedEmail"`
}

type FeedbackStore struct {
	db *pgxpool.Pool
}

func NewFeedbackStore(db *pgxpool.Pool) *FeedbackStore {
	return &FeedbackStore{db: db}
}

func (s *FeedbackStore) Create(ctx context.Context, userID, message, pagePath string) (Feedback, error) {
	var item Feedback
	var page *string
	if pagePath != "" {
		page = &pagePath
	}
	err := s.db.QueryRow(ctx, `
		insert into user_feedback (user_id, message, page_path)
		values ($1, $2, $3)
		returning id, user_id, message, coalesce(page_path, ''), status, created_at::text
	`, userID, message, page).Scan(
		&item.ID, &item.UserID, &item.Message, &item.PagePath, &item.Status, &item.CreatedAt,
	)
	return item, normalizeWriteError(err)
}

func (s *FeedbackStore) ListForAdmin(ctx context.Context) ([]AdminFeedback, error) {
	rows, err := s.db.Query(ctx, `
		select f.id, f.user_id, u.email, f.message, coalesce(f.page_path, ''), f.status, f.created_at::text
		from user_feedback f
		join users u on u.id = f.user_id
		order by f.created_at desc
		limit 200
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]AdminFeedback, 0)
	for rows.Next() {
		var item AdminFeedback
		var email string
		if err := rows.Scan(&item.ID, &item.UserID, &email, &item.Message, &item.PagePath, &item.Status, &item.CreatedAt); err != nil {
			return nil, err
		}
		item.MaskedEmail = maskEmail(email)
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *FeedbackStore) UpdateStatus(ctx context.Context, id, status string) error {
	tag, err := s.db.Exec(ctx, `
		update user_feedback set status = $1, updated_at = now() where id = $2
	`, status, id)
	return normalizeExecResult(tag, err)
}
