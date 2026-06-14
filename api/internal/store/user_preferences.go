package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type UserPreferences struct {
	UserID               string `json:"userId"`
	DefaultCurrency      string `json:"defaultCurrency"`
	Theme                string `json:"theme"`
	NotificationsEnabled bool   `json:"notificationsEnabled"`
	CreatedAt            string `json:"createdAt"`
	UpdatedAt            string `json:"updatedAt"`
}

type UserPreferenceStore struct {
	db *pgxpool.Pool
}

func NewUserPreferenceStore(db *pgxpool.Pool) *UserPreferenceStore {
	return &UserPreferenceStore{db: db}
}

func (s *UserPreferenceStore) GetOrCreate(ctx context.Context, userID string) (UserPreferences, error) {
	var prefs UserPreferences
	err := s.db.QueryRow(ctx, `
		insert into user_preferences (user_id)
		values ($1)
		on conflict (user_id) do update set user_id = excluded.user_id
		returning user_id, default_currency, theme, notifications_enabled, created_at, updated_at
	`, userID).Scan(
		&prefs.UserID,
		&prefs.DefaultCurrency,
		&prefs.Theme,
		&prefs.NotificationsEnabled,
		&prefs.CreatedAt,
		&prefs.UpdatedAt,
	)
	return prefs, err
}

func (s *UserPreferenceStore) Update(ctx context.Context, userID, defaultCurrency, theme string, notificationsEnabled bool) (UserPreferences, error) {
	var prefs UserPreferences
	err := s.db.QueryRow(ctx, `
		insert into user_preferences (user_id, default_currency, theme, notifications_enabled)
		values ($1, $2, $3, $4)
		on conflict (user_id) do update
		set default_currency = excluded.default_currency,
		    theme = excluded.theme,
		    notifications_enabled = excluded.notifications_enabled,
		    updated_at = now()
		returning user_id, default_currency, theme, notifications_enabled, created_at, updated_at
	`, userID, defaultCurrency, theme, notificationsEnabled).Scan(
		&prefs.UserID,
		&prefs.DefaultCurrency,
		&prefs.Theme,
		&prefs.NotificationsEnabled,
		&prefs.CreatedAt,
		&prefs.UpdatedAt,
	)
	return prefs, err
}
