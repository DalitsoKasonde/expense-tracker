package store

import (
	"context"
	"crypto/md5"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type IdempotencyKey struct {
	ID          string          `json:"id"`
	UserID      string          `json:"userId"`
	Key         string          `json:"key"`
	RequestHash string          `json:"-"`
	Response    json.RawMessage `json:"response"`
	CreatedAt   string          `json:"createdAt"`
}

type IdempotencyKeyStore struct {
	db *pgxpool.Pool
}

func NewIdempotencyKeyStore(db *pgxpool.Pool) *IdempotencyKeyStore {
	return &IdempotencyKeyStore{db: db}
}

// GetOrCreate returns cached response if exists, otherwise returns nil
func (s *IdempotencyKeyStore) GetOrCreate(ctx context.Context, userID, key string, requestBody interface{}) (*IdempotencyKey, error) {
	// Hash request to detect replay attacks with different payloads
	hash := s.hashRequest(requestBody)

	// Try to get existing key
	var existing IdempotencyKey
	err := s.db.QueryRow(ctx, `
		select id, user_id, key, request_hash, response_json, created_at
		from idempotency_keys
		where user_id = $1 and key = $2
	`, userID, key).Scan(
		&existing.ID, &existing.UserID, &existing.Key, &existing.RequestHash, &existing.Response, &existing.CreatedAt,
	)

	if err == nil {
		// Key exists
		if existing.RequestHash != hash {
			// Different request body with same key - reject
			return nil, fmt.Errorf("idempotency key reused with different request")
		}
		// Same request - return cached response
		return &existing, nil
	}

	if err != pgx.ErrNoRows {
		return nil, err
	}

	// Key doesn't exist yet - return nil to proceed with request
	return nil, nil
}

// Store saves the response for a request
func (s *IdempotencyKeyStore) Store(ctx context.Context, userID, key string, requestBody interface{}, response json.RawMessage) error {
	hash := s.hashRequest(requestBody)

	_, err := s.db.Exec(ctx, `
		insert into idempotency_keys (user_id, key, request_hash, response_json)
		values ($1, $2, $3, $4)
		on conflict (user_id, key) do update
		set response_json = excluded.response_json
	`, userID, key, hash, response)
	return err
}

func (s *IdempotencyKeyStore) hashRequest(v interface{}) string {
	b, _ := json.Marshal(v)
	return fmt.Sprintf("%x", md5.Sum(b))
}
