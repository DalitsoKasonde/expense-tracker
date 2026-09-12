package store

import (
	"context"
	"errors"
	"time"

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
	// Plan and PlanExpiresAt together describe entitlement; a nil expiry never
	// lapses. Resolve them through plans.Effective rather than reading Plan
	// directly, or a lapsed trial keeps its entitlements.
	Plan          string     `json:"plan"`
	PlanExpiresAt *time.Time `json:"planExpiresAt"`
	PlanSource    string     `json:"planSource"`
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
		select id, email, display_name, password_hash, role, is_active, email_verified_at::text,
		       plan, plan_expires_at, plan_source
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
		&user.Plan,
		&user.PlanExpiresAt,
		&user.PlanSource,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, err
		}
		return User{}, err
	}

	return user, nil
}

func (s *UserStore) FindByGoogleSubject(ctx context.Context, subject string) (User, error) {
	var user User
	err := s.db.QueryRow(ctx, `
		select id, email, display_name, password_hash, role, is_active, email_verified_at::text,
		       plan, plan_expires_at, plan_source
		from users
		where google_subject = $1
	`, subject).Scan(
		&user.ID,
		&user.Email,
		&user.DisplayName,
		&user.PasswordHash,
		&user.Role,
		&user.IsActive,
		&user.EmailVerifiedAt,
		&user.Plan,
		&user.PlanExpiresAt,
		&user.PlanSource,
	)
	return user, err
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

// NewUser is an account about to be created. The plan is set in the same
// statement as the account so a new user is never briefly on the free plan
// before their trial is applied.
type NewUser struct {
	Email         string
	PasswordHash  string
	DisplayName   string
	Plan          string
	PlanExpiresAt *time.Time
	PlanSource    string
}

func (s *UserStore) CreateUser(ctx context.Context, in NewUser) (User, error) {
	var user User
	err := s.db.QueryRow(ctx, `
		insert into users (email, display_name, password_hash, role, is_active, plan, plan_expires_at, plan_source)
		values ($1, $2, $3, 'member', true, $4, $5, $6)
		returning id, email, display_name, role, is_active, plan, plan_expires_at, plan_source
	`, in.Email, in.DisplayName, in.PasswordHash, in.Plan, in.PlanExpiresAt, in.PlanSource).Scan(
		&user.ID,
		&user.Email,
		&user.DisplayName,
		&user.Role,
		&user.IsActive,
		&user.Plan,
		&user.PlanExpiresAt,
		&user.PlanSource,
	)
	return user, err
}

// SetPlan changes entitlement. A nil expiry means the plan never lapses, which
// is how a complimentary account is granted.
func (s *UserStore) SetPlan(ctx context.Context, userID, plan string, expiresAt *time.Time, source string) error {
	tag, err := s.db.Exec(ctx, `
		update users
		set plan = $2, plan_expires_at = $3, plan_source = $4, updated_at = now()
		where id = $1
	`, userID, plan, expiresAt, source)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// CreateGoogleUser registers someone arriving through Google. They get the
// same trial as any other new account: how a person chose to sign in should
// not decide what they are entitled to.
func (s *UserStore) CreateGoogleUser(ctx context.Context, email, passwordHash, displayName, subject string, plan string, planExpiresAt *time.Time, planSource string) (User, error) {
	var user User
	err := s.db.QueryRow(ctx, `
		insert into users (email, display_name, password_hash, role, is_active, email_verified_at, google_subject,
		                   plan, plan_expires_at, plan_source)
		values ($1, $2, $3, 'member', true, now(), $4, $5, $6, $7)
		returning id, email, display_name, role, is_active, email_verified_at::text, plan, plan_expires_at, plan_source
	`, email, displayName, passwordHash, subject, plan, planExpiresAt, planSource).Scan(
		&user.ID,
		&user.Email,
		&user.DisplayName,
		&user.Role,
		&user.IsActive,
		&user.EmailVerifiedAt,
		&user.Plan,
		&user.PlanExpiresAt,
		&user.PlanSource,
	)
	return user, err
}

// LinkGoogleIdentity records Google's stable account identifier and treats the
// provider's verified email claim as address verification. It never replaces a
// different Google identity already attached to the account.
func (s *UserStore) LinkGoogleIdentity(ctx context.Context, userID, subject string) error {
	tag, err := s.db.Exec(ctx, `
		update users
		set google_subject = $2,
		    email_verified_at = coalesce(email_verified_at, now()),
		    updated_at = now()
		where id = $1 and (google_subject is null or google_subject = $2)
	`, userID, subject)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return errors.New("account is linked to a different Google identity")
	}
	return nil
}

// FindByID loads the account behind an authenticated request. Handlers that
// send mail need the address and name, which the JWT deliberately does not carry.
func (s *UserStore) FindByID(ctx context.Context, userID string) (User, error) {
	var user User
	err := s.db.QueryRow(ctx, `
		select id, email, display_name, password_hash, role, is_active, email_verified_at::text,
		       plan, plan_expires_at, plan_source
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
		&user.Plan,
		&user.PlanExpiresAt,
		&user.PlanSource,
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
