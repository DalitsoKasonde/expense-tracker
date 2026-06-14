package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Business struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

type BusinessStore struct {
	db *pgxpool.Pool
}

func NewBusinessStore(db *pgxpool.Pool) *BusinessStore {
	return &BusinessStore{db: db}
}

func (s *BusinessStore) ListByUser(ctx context.Context, userID string) ([]Business, error) {
	rows, err := s.db.Query(ctx, `
		select id, user_id, name, created_at
		from businesses
		where user_id = $1
		order by name asc
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var businesses []Business
	for rows.Next() {
		var b Business
		if err := rows.Scan(&b.ID, &b.UserID, &b.Name, &b.CreatedAt); err != nil {
			return nil, err
		}
		businesses = append(businesses, b)
	}

	return businesses, rows.Err()
}

func (s *BusinessStore) Create(ctx context.Context, userID, name string) (Business, error) {
	var business Business
	err := s.db.QueryRow(ctx, `
		insert into businesses (user_id, name)
		values ($1, $2)
		returning id, user_id, name, created_at
	`, userID, name).Scan(
		&business.ID,
		&business.UserID,
		&business.Name,
		&business.CreatedAt,
	)
	return business, err
}

func (s *BusinessStore) Update(ctx context.Context, id, userID, name string) (Business, error) {
	var business Business
	err := s.db.QueryRow(ctx, `
		update businesses
		set name = $1
		where id = $2 and user_id = $3
		returning id, user_id, name, created_at
	`, name, id, userID).Scan(
		&business.ID,
		&business.UserID,
		&business.Name,
		&business.CreatedAt,
	)
	return business, err
}

func (s *BusinessStore) Delete(ctx context.Context, id, userID string) error {
	_, err := s.db.Exec(ctx, `
		delete from businesses
		where id = $1 and user_id = $2
	`, id, userID)
	return err
}
