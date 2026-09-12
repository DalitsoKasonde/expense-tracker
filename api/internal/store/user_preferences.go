package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type UserPreferences struct {
	UserID               string `json:"userId"`
	DefaultCurrency      string `json:"defaultCurrency"`
	Theme                string `json:"theme"`
	ColorScheme          string `json:"colorScheme"`
	NotificationsEnabled bool   `json:"notificationsEnabled"`
	// EmailDigestFrequency is off, daily, weekly or monthly.
	EmailDigestFrequency string `json:"emailDigestFrequency"`
	// EmailMutedNotificationTypes records what a person turned OFF rather than
	// what they left on, so an alert type added later reaches them by default
	// instead of quietly reaching nobody.
	EmailMutedNotificationTypes []string `json:"emailMutedNotificationTypes"`
	EmailDigestLastSentAt       *string  `json:"emailDigestLastSentAt"`
	CreatedAt                   string   `json:"createdAt"`
	UpdatedAt                   string   `json:"updatedAt"`
}

// UserPreferencesInput carries an update. It is a struct rather than a
// parameter list because the settings screen writes every field at once and a
// run of same-typed arguments is easy to transpose unnoticed.
type UserPreferencesInput struct {
	DefaultCurrency             string
	Theme                       string
	ColorScheme                 string
	NotificationsEnabled        bool
	EmailDigestFrequency        string
	EmailMutedNotificationTypes []string
}

// DigestRecipient is one candidate for a scheduled email. Whether a candidate
// is actually due is decided outside the database so the rule can be tested
// without one.
type DigestRecipient struct {
	UserID          string
	Email           string
	DisplayName     string
	DefaultCurrency string
	Frequency       string
	MutedTypes      []string
	LastSentAt      *time.Time
}

const userPreferenceColumns = `user_id, default_currency, theme, color_scheme, notifications_enabled,
	email_digest_frequency, email_muted_notification_types, email_digest_last_sent_at::text,
	created_at::text, updated_at::text`

type UserPreferenceStore struct {
	db *pgxpool.Pool
}

func NewUserPreferenceStore(db *pgxpool.Pool) *UserPreferenceStore {
	return &UserPreferenceStore{db: db}
}

func scanUserPreferences(row interface {
	Scan(dest ...any) error
}) (UserPreferences, error) {
	var prefs UserPreferences
	err := row.Scan(
		&prefs.UserID,
		&prefs.DefaultCurrency,
		&prefs.Theme,
		&prefs.ColorScheme,
		&prefs.NotificationsEnabled,
		&prefs.EmailDigestFrequency,
		&prefs.EmailMutedNotificationTypes,
		&prefs.EmailDigestLastSentAt,
		&prefs.CreatedAt,
		&prefs.UpdatedAt,
	)
	if prefs.EmailMutedNotificationTypes == nil {
		// A JSON null here would make the settings screen's checkbox list
		// crash rather than render an empty one.
		prefs.EmailMutedNotificationTypes = []string{}
	}
	return prefs, err
}

func (s *UserPreferenceStore) GetOrCreate(ctx context.Context, userID string) (UserPreferences, error) {
	return scanUserPreferences(s.db.QueryRow(ctx, `
		insert into user_preferences (user_id)
		values ($1)
		on conflict (user_id) do update set user_id = excluded.user_id
		returning `+userPreferenceColumns, userID))
}

func (s *UserPreferenceStore) Update(ctx context.Context, userID string, input UserPreferencesInput) (UserPreferences, error) {
	muted := input.EmailMutedNotificationTypes
	if muted == nil {
		muted = []string{}
	}

	return scanUserPreferences(s.db.QueryRow(ctx, `
		insert into user_preferences (user_id, default_currency, theme, color_scheme, notifications_enabled,
			email_digest_frequency, email_muted_notification_types)
		values ($1, $2, $3, $4, $5, $6, $7)
		on conflict (user_id) do update
		set default_currency = excluded.default_currency,
		    theme = excluded.theme,
		    color_scheme = excluded.color_scheme,
		    notifications_enabled = excluded.notifications_enabled,
		    email_digest_frequency = excluded.email_digest_frequency,
		    email_muted_notification_types = excluded.email_muted_notification_types,
		    updated_at = now()
		returning `+userPreferenceColumns,
		userID, input.DefaultCurrency, input.Theme, input.ColorScheme, input.NotificationsEnabled,
		input.EmailDigestFrequency, muted))
}

// ListDigestSubscribers returns everyone who has asked for an emailed digest.
// Deactivated accounts are excluded here rather than filtered later: mail to a
// disabled account is the kind of thing nobody notices until a user complains.
func (s *UserPreferenceStore) ListDigestSubscribers(ctx context.Context) ([]DigestRecipient, error) {
	rows, err := s.db.Query(ctx, `
		select p.user_id, u.email, u.display_name, p.default_currency,
		       p.email_digest_frequency, p.email_muted_notification_types, p.email_digest_last_sent_at
		from user_preferences p
		join users u on u.id = p.user_id
		where p.email_digest_frequency <> 'off'
		  and u.is_active = true
		order by p.user_id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	recipients := make([]DigestRecipient, 0)
	for rows.Next() {
		var recipient DigestRecipient
		if err := rows.Scan(
			&recipient.UserID,
			&recipient.Email,
			&recipient.DisplayName,
			&recipient.DefaultCurrency,
			&recipient.Frequency,
			&recipient.MutedTypes,
			&recipient.LastSentAt,
		); err != nil {
			return nil, err
		}
		recipients = append(recipients, recipient)
	}

	return recipients, rows.Err()
}

func (s *UserPreferenceStore) RecordDigestSent(ctx context.Context, userID string, sentAt time.Time) error {
	_, err := s.db.Exec(ctx, `
		update user_preferences
		set email_digest_last_sent_at = $2, updated_at = now()
		where user_id = $1
	`, userID, sentAt)
	return err
}
