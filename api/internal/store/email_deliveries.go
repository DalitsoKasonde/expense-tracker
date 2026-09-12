package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Email kinds recorded in the delivery log.
const (
	EmailKindDigest        = "digest"
	EmailKindPasswordReset = "password_reset"
	EmailKindVerification  = "email_verification"
	EmailKindReport        = "report"
	EmailKindAdminAlert    = "admin_alert"
)

// ErrEmailAlreadySent means a message with this dedupe key has already gone
// out. It is a normal outcome, not a failure: it is how a restarted scheduler
// avoids mailing the same digest twice.
var ErrEmailAlreadySent = errors.New("email already sent")

type EmailDelivery struct {
	ID        string  `json:"id"`
	Recipient string  `json:"recipient"`
	Kind      string  `json:"kind"`
	Subject   string  `json:"subject"`
	Status    string  `json:"status"`
	Error     *string `json:"error,omitempty"`
	CreatedAt string  `json:"createdAt"`
}

type EmailDeliveryStore struct {
	db *pgxpool.Pool
}

func NewEmailDeliveryStore(db *pgxpool.Pool) *EmailDeliveryStore {
	return &EmailDeliveryStore{db: db}
}

// Claim reserves the right to send one message. The unique index on dedupe_key
// is what makes this safe: two schedulers racing on the same digest both try to
// insert, one wins, and the loser gets ErrEmailAlreadySent instead of putting a
// second copy in somebody's inbox. Pass an empty key for mail that may legitimately
// repeat, such as a second password reset request.
func (s *EmailDeliveryStore) Claim(ctx context.Context, userID *string, recipient, kind, subject, dedupeKey string) (string, error) {
	var key *string
	if dedupeKey != "" {
		key = &dedupeKey
	}

	var id string
	err := s.db.QueryRow(ctx, `
		insert into email_deliveries (user_id, recipient, kind, subject, dedupe_key, status)
		values ($1, $2, $3, $4, $5, 'sent')
		on conflict (dedupe_key) do nothing
		returning id
	`, userID, recipient, kind, subject, key).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrEmailAlreadySent
	}
	return id, err
}

// MarkFailed records that delivery failed after the claim was taken. The row is
// kept rather than deleted so a failure is visible in the log; the dedupe key is
// released so the next attempt can retry.
func (s *EmailDeliveryStore) MarkFailed(ctx context.Context, id string, cause error) error {
	message := ""
	if cause != nil {
		message = cause.Error()
	}
	_, err := s.db.Exec(ctx, `
		update email_deliveries
		set status = 'failed', error = $2, dedupe_key = null
		where id = $1
	`, id, message)
	return err
}

// ListRecent returns the delivery log for one user, newest first, for the
// settings screen's "recent emails" list.
func (s *EmailDeliveryStore) ListRecent(ctx context.Context, userID string, limit int) ([]EmailDelivery, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	rows, err := s.db.Query(ctx, `
		select id, recipient, kind, subject, status, error, created_at::text
		from email_deliveries
		where user_id = $1
		order by created_at desc
		limit $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	deliveries := make([]EmailDelivery, 0)
	for rows.Next() {
		var delivery EmailDelivery
		if err := rows.Scan(
			&delivery.ID, &delivery.Recipient, &delivery.Kind,
			&delivery.Subject, &delivery.Status, &delivery.Error, &delivery.CreatedAt,
		); err != nil {
			return nil, err
		}
		deliveries = append(deliveries, delivery)
	}

	return deliveries, rows.Err()
}
