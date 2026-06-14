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
}

type UserStore struct {
	db *pgxpool.Pool
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
		select id, email, display_name, password_hash, role, is_active
		from users
		where email = $1
	`, email).Scan(
		&user.ID,
		&user.Email,
		&user.DisplayName,
		&user.PasswordHash,
		&user.Role,
		&user.IsActive,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, err
		}
		return User{}, err
	}

	return user, nil
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

