package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type PushSubscription struct {
	ID         string `json:"id"`
	UserID     string `json:"userId"`
	Endpoint   string `json:"endpoint"`
	AuthKey    string `json:"-"`
	P256dhKey  string `json:"-"`
	LastActive string `json:"lastActive"`
	CreatedAt  string `json:"createdAt"`
}

type PushSubscriptionStore struct {
	db *pgxpool.Pool
}

func NewPushSubscriptionStore(db *pgxpool.Pool) *PushSubscriptionStore {
	return &PushSubscriptionStore{db: db}
}

func (s *PushSubscriptionStore) Subscribe(ctx context.Context, userID, endpoint, authKey, p256dhKey string) (PushSubscription, error) {
	var sub PushSubscription
	err := s.db.QueryRow(ctx, `
		insert into push_subscriptions (user_id, endpoint, auth_key, p256dh_key)
		values ($1, $2, $3, $4)
		on conflict (user_id, endpoint) do update
		set auth_key = excluded.auth_key, p256dh_key = excluded.p256dh_key, last_active = now()
		returning id, user_id, endpoint, last_active, created_at
	`, userID, endpoint, authKey, p256dhKey).Scan(
		&sub.ID, &sub.UserID, &sub.Endpoint, &sub.LastActive, &sub.CreatedAt,
	)
	return sub, err
}

func (s *PushSubscriptionStore) ListByUser(ctx context.Context, userID string) ([]PushSubscription, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, endpoint, last_active, created_at
		from push_subscriptions
		where user_id = $1
		order by last_active desc
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subs []PushSubscription
	for rows.Next() {
		var sub PushSubscription
		if err := rows.Scan(&sub.ID, &sub.UserID, &sub.Endpoint, &sub.LastActive, &sub.CreatedAt); err != nil {
			return nil, err
		}
		subs = append(subs, sub)
	}

	return subs, rows.Err()
}

func (s *PushSubscriptionStore) Unsubscribe(ctx context.Context, userID, endpoint string) error {
	_, err := s.db.Exec(ctx, `
		delete from push_subscriptions
		where user_id = $1 and endpoint = $2
	`, userID, endpoint)
	return err
}

func (s *PushSubscriptionStore) GetByEndpoint(ctx context.Context, endpoint string) (*PushSubscription, error) {
	var sub PushSubscription
	err := s.db.QueryRow(ctx, `
		select id, user_id, endpoint, auth_key, p256dh_key, last_active, created_at
		from push_subscriptions
		where endpoint = $1
	`, endpoint).Scan(
		&sub.ID, &sub.UserID, &sub.Endpoint, &sub.AuthKey, &sub.P256dhKey, &sub.LastActive, &sub.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &sub, nil
}
