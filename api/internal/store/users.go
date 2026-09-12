package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type User struct {
	ID           string `json:"id"`
	Email        string `json:"email"`
	DisplayName  string `json:"displayName"`
	PasswordHash string
	Role         string `json:"role"`
	IsActive     bool
	// EmailVerifiedAt is nil until someone follows the link they were sent.
	// Accounts created before verification existed are left nil rather than
	// backfilled, so the flag never claims an address was proven when it wasn't.
	EmailVerifiedAt *string `json:"emailVerifiedAt"`
}

type UserStore struct {
	db *pgxpool.Pool
}

type UserAuthState struct {
	Role     string
	IsActive bool
}

func NewUserStore(db *pgxpool.Pool) *UserStore {
	return &UserStore{db: db}
}

func (s *UserStore) CountUsers(ctx context.Context) (int, error) {
	var count int
	err := s.db.QueryRow(ctx, `select count(*) from users`).Scan(&count)
	return count, err
}

func (s *UserStore) FindByEmail(ctx context.Context, email string) (User, error) {
	var user User
	err := s.db.QueryRow(ctx, `
		select id, email, display_name, password_hash, role, is_active, email_verified_at::text
		from users
		where email = $1
	`, email).Scan(
		&user.ID,
		&user.Email,
		&user.DisplayName,
		&user.PasswordHash,
		&user.Role,
		&user.IsActive,
		&user.EmailVerifiedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, err
		}
		return User{}, err
	}

	return user, nil
}

func (s *UserStore) RecordLogin(ctx context.Context, userID string) error {
	_, err := s.db.Exec(ctx, `update users set last_login_at = now() where id = $1`, userID)
	return err
}

func (s *UserStore) GetAuthState(ctx context.Context, userID string) (UserAuthState, error) {
	var state UserAuthState
	err := s.db.QueryRow(ctx, `
		select role, is_active
		from users
		where id = $1
	`, userID).Scan(&state.Role, &state.IsActive)
	return state, err
}

func (s *UserStore) CreateBootstrapAdmin(ctx context.Context, email, passwordHash string) (User, error) {
	var user User
	err := s.db.QueryRow(ctx, `
		insert into users (email, display_name, password_hash, role, is_active)
		values ($1, $2, $3, 'admin', true)
		returning id, email, display_name, role, is_active
	`, email, "Bootstrap Admin", passwordHash).Scan(
		&user.ID,
		&user.Email,
		&user.DisplayName,
		&user.Role,
		&user.IsActive,
	)
	if err != nil {
		return User{}, err
	}

	return user, nil
}

func (s *UserStore) CreateInvitedUser(ctx context.Context, email, passwordHash, displayName string) (User, error) {
	var user User
	err := s.db.QueryRow(ctx, `
		insert into users (email, display_name, password_hash, role, is_active)
		values ($1, $2, $3, 'member', true)
		returning id, email, display_name, role, is_active
	`, email, displayName, passwordHash).Scan(
		&user.ID,
		&user.Email,
		&user.DisplayName,
		&user.Role,
		&user.IsActive,
	)
	return user, err
}

// FindByID loads the account behind an authenticated request. Handlers that
// send mail need the address and name, which the JWT deliberately does not carry.
func (s *UserStore) FindByID(ctx context.Context, userID string) (User, error) {
	var user User
	err := s.db.QueryRow(ctx, `
		select id, email, display_name, password_hash, role, is_active, email_verified_at::text
		from users
		where id = $1
	`, userID).Scan(
		&user.ID,
		&user.Email,
		&user.DisplayName,
		&user.PasswordHash,
		&user.Role,
		&user.IsActive,
		&user.EmailVerifiedAt,
	)
	return user, err
}

func (s *UserStore) UpdatePassword(ctx context.Context, userID, passwordHash string) error {
	_, err := s.db.Exec(ctx, `
		update users set password_hash = $2, updated_at = now() where id = $1
	`, userID, passwordHash)
	return err
}

// MarkEmailVerified is written to only once. Re-verifying an already-verified
// address must not move the date, which is the record of when the address was
// actually proven.
func (s *UserStore) MarkEmailVerified(ctx context.Context, userID string) error {
	_, err := s.db.Exec(ctx, `
		update users
		set email_verified_at = coalesce(email_verified_at, now()), updated_at = now()
		where id = $1
	`, userID)
	return err
}
