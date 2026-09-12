package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	AuthTokenPasswordReset = "password_reset"
	AuthTokenVerifyEmail   = "email_verification"
)

// ErrTokenInvalid covers every way a token can fail to work — unknown, expired,
// already used, or for the wrong purpose. Callers must not distinguish between
// them to the user: telling someone a reset token is "expired" rather than
// "unknown" confirms that it once existed.
var ErrTokenInvalid = errors.New("token is invalid or has expired")

type AuthTokenStore struct {
	db *pgxpool.Pool
}

func NewAuthTokenStore(db *pgxpool.Pool) *AuthTokenStore {
	return &AuthTokenStore{db: db}
}

// NewToken returns the secret to email and the hash to store. Only the hash
// reaches the database, so a dump of it cannot be turned into working links.
func NewToken() (secret string, hash string, err error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	// URL-safe and unpadded, because this travels as a query parameter.
	secret = base64.RawURLEncoding.EncodeToString(buf)
	return secret, HashToken(secret), nil
}

// HashToken is deliberately a plain SHA-256 rather than bcrypt: the input is
// 256 bits of randomness, so there is no dictionary to slow an attacker down,
// and reset links are verified on a request path that should stay fast.
func HashToken(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

func (s *AuthTokenStore) Create(ctx context.Context, userID, purpose, tokenHash string, expiresAt time.Time) error {
	_, err := s.db.Exec(ctx, `
		insert into auth_tokens (user_id, purpose, token_hash, expires_at)
		values ($1, $2, $3, $4)
	`, userID, purpose, tokenHash, expiresAt)
	return err
}

// Consume validates a token and spends it in one statement. Doing both at once
// is what stops the same reset link being used twice from two tabs.
func (s *AuthTokenStore) Consume(ctx context.Context, purpose, secret string) (string, error) {
	var userID string
	err := s.db.QueryRow(ctx, `
		update auth_tokens
		set used_at = now()
		where token_hash = $1
		  and purpose = $2
		  and used_at is null
		  and expires_at > now()
		returning user_id
	`, HashToken(secret), purpose).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrTokenInvalid
	}
	return userID, err
}

// InvalidateAll spends every outstanding token of one purpose. A completed
// password reset calls it so older links mailed out earlier stop working.
func (s *AuthTokenStore) InvalidateAll(ctx context.Context, userID, purpose string) error {
	_, err := s.db.Exec(ctx, `
		update auth_tokens
		set used_at = now()
		where user_id = $1 and purpose = $2 and used_at is null
	`, userID, purpose)
	return err
}

// DeleteExpired keeps the table from growing without bound. Spent and expired
// tokens have no value; the scheduler sweeps them on its daily pass.
func (s *AuthTokenStore) DeleteExpired(ctx context.Context) (int64, error) {
	tag, err := s.db.Exec(ctx, `
		delete from auth_tokens
		where expires_at < now() - interval '7 days'
		   or used_at < now() - interval '7 days'
	`)
	return tag.RowsAffected(), err
}
