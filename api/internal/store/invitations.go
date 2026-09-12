package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrInvitationInvalid covers unknown, expired, revoked and already-accepted
// invitations alike. Callers must not tell them apart to the person holding
// the link: distinguishing "expired" from "unknown" confirms that an address
// was invited, which is information about someone else.
var ErrInvitationInvalid = errors.New("invitation is invalid or has expired")

type Invitation struct {
	ID             string  `json:"id"`
	Email          string  `json:"email"`
	PremiumMonths  int     `json:"premiumMonths"`
	Note           *string `json:"note,omitempty"`
	ExpiresAt      string  `json:"expiresAt"`
	AcceptedAt     *string `json:"acceptedAt"`
	RevokedAt      *string `json:"revokedAt"`
	CreatedAt      string  `json:"createdAt"`
	AcceptedUserID *string `json:"acceptedUserId,omitempty"`
}

type InvitationStore struct {
	db *pgxpool.Pool
}

func NewInvitationStore(db *pgxpool.Pool) *InvitationStore {
	return &InvitationStore{db: db}
}

// Create issues an invitation, revoking any that is still open for the same
// address. Re-inviting someone is a normal thing to do — they lost the email,
// or it expired — and it must not leave two working links in one inbox.
func (s *InvitationStore) Create(ctx context.Context, email, tokenHash, invitedBy string, premiumMonths int, note string, expiresAt time.Time) (Invitation, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Invitation{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		update invitations
		set revoked_at = now()
		where lower(email) = lower($1) and accepted_at is null and revoked_at is null
	`, email); err != nil {
		return Invitation{}, err
	}

	var noteValue *string
	if note != "" {
		noteValue = &note
	}
	var inviter *string
	if invitedBy != "" {
		inviter = &invitedBy
	}

	var item Invitation
	err = tx.QueryRow(ctx, `
		insert into invitations (email, token_hash, invited_by, premium_months, note, expires_at)
		values ($1, $2, $3, $4, $5, $6)
		returning id, email, premium_months, note, expires_at::text, accepted_at::text,
		          revoked_at::text, created_at::text, accepted_user_id
	`, email, tokenHash, inviter, premiumMonths, noteValue, expiresAt).Scan(
		&item.ID, &item.Email, &item.PremiumMonths, &item.Note, &item.ExpiresAt,
		&item.AcceptedAt, &item.RevokedAt, &item.CreatedAt, &item.AcceptedUserID,
	)
	if err != nil {
		return Invitation{}, err
	}

	return item, tx.Commit(ctx)
}

// Lookup resolves a token without spending it, so the accept screen can show
// which address the invitation is for before a password is chosen.
func (s *InvitationStore) Lookup(ctx context.Context, tokenHash string) (Invitation, error) {
	var item Invitation
	err := s.db.QueryRow(ctx, `
		select id, email, premium_months, note, expires_at::text, accepted_at::text,
		       revoked_at::text, created_at::text, accepted_user_id
		from invitations
		where token_hash = $1
		  and accepted_at is null
		  and revoked_at is null
		  and expires_at > now()
	`, tokenHash).Scan(
		&item.ID, &item.Email, &item.PremiumMonths, &item.Note, &item.ExpiresAt,
		&item.AcceptedAt, &item.RevokedAt, &item.CreatedAt, &item.AcceptedUserID,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Invitation{}, ErrInvitationInvalid
	}
	return item, err
}

// Accept spends the invitation. The conditions are repeated here rather than
// trusted from an earlier Lookup, so two people following the same link at
// once cannot both be admitted.
func (s *InvitationStore) Accept(ctx context.Context, tokenHash, userID string) (Invitation, error) {
	var item Invitation
	err := s.db.QueryRow(ctx, `
		update invitations
		set accepted_at = now(), accepted_user_id = $2
		where token_hash = $1
		  and accepted_at is null
		  and revoked_at is null
		  and expires_at > now()
		returning id, email, premium_months, note, expires_at::text, accepted_at::text,
		          revoked_at::text, created_at::text, accepted_user_id
	`, tokenHash, userID).Scan(
		&item.ID, &item.Email, &item.PremiumMonths, &item.Note, &item.ExpiresAt,
		&item.AcceptedAt, &item.RevokedAt, &item.CreatedAt, &item.AcceptedUserID,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Invitation{}, ErrInvitationInvalid
	}
	return item, err
}

func (s *InvitationStore) Revoke(ctx context.Context, id string) error {
	tag, err := s.db.Exec(ctx, `
		update invitations
		set revoked_at = now()
		where id = $1 and accepted_at is null and revoked_at is null
	`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInvitationInvalid
	}
	return nil
}

func (s *InvitationStore) List(ctx context.Context) ([]Invitation, error) {
	rows, err := s.db.Query(ctx, `
		select id, email, premium_months, note, expires_at::text, accepted_at::text,
		       revoked_at::text, created_at::text, accepted_user_id
		from invitations
		order by created_at desc
		limit 200
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]Invitation, 0)
	for rows.Next() {
		var item Invitation
		if err := rows.Scan(
			&item.ID, &item.Email, &item.PremiumMonths, &item.Note, &item.ExpiresAt,
			&item.AcceptedAt, &item.RevokedAt, &item.CreatedAt, &item.AcceptedUserID,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
