package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrLoginPINInvalid = errors.New("login PIN is invalid or has expired")

type LoginPINStore struct {
	db *pgxpool.Pool
}

func NewLoginPINStore(db *pgxpool.Pool) *LoginPINStore {
	return &LoginPINStore{db: db}
}

// Replace makes the newest code the only usable code for this account.
func (s *LoginPINStore) Replace(ctx context.Context, userID, pinHash string, expiresAt time.Time) error {
	_, err := s.db.Exec(ctx, `
		insert into login_pins (user_id, pin_hash, expires_at)
		values ($1, $2, $3)
		on conflict (user_id) do update
		set pin_hash = excluded.pin_hash,
		    attempt_count = 0,
		    expires_at = excluded.expires_at,
		    used_at = null,
		    created_at = now()
	`, userID, pinHash, expiresAt)
	return err
}

// Consume spends a matching code atomically. A wrong code increments the
// attempt counter; five wrong attempts invalidate the current code.
func (s *LoginPINStore) Consume(ctx context.Context, userID, pinHash string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var matched bool
	err = tx.QueryRow(ctx, `
		update login_pins
		set used_at = now()
		where user_id = $1
		  and pin_hash = $2
		  and used_at is null
		  and expires_at > now()
		  and attempt_count < 5
		returning true
	`, userID, pinHash).Scan(&matched)
	if err == nil && matched {
		return tx.Commit(ctx)
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	_, err = tx.Exec(ctx, `
		update login_pins
		set attempt_count = least(attempt_count + 1, 5),
		    used_at = case when attempt_count + 1 >= 5 then now() else used_at end
		where user_id = $1 and used_at is null and expires_at > now()
	`, userID)
	if err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return ErrLoginPINInvalid
}

func (s *LoginPINStore) Delete(ctx context.Context, userID string) error {
	_, err := s.db.Exec(ctx, `delete from login_pins where user_id = $1`, userID)
	return err
}
